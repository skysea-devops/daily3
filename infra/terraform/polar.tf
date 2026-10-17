# infra/terraform/polar.tf
# ==============================================================================
# Polar (Merchant of Record) — sırlar, webhook Lambda'sı ve abonelik yönetimi
#
# Lemon Squeezy Ekim 2026'da hesabı kapattı; yerine Polar geldi.
#
# KURULUM SIRASI (her ortam için; önce dev + Polar sandbox):
#   1. Polar'da (sandbox/production) TEK ürün: Cogletta Pro, yıllık $48, TRIAL'SIZ.
#      Product ID → <env>.tfvars → polar_product_id
#   2. Organization Access Token üret → GitHub secret POLAR_ACCESS_TOKEN
#      (ilk apply'da SSM'e yazılır; sonrası için aşağıdaki "Rotasyon" notu)
#   3. Apply → output "polar_webhook_url" adresini Polar → Settings → Webhooks'a gir.
#      ASLA frontend domain'i girme: Next.js HTML + 200 döner, teslim edildi sanılır.
#      Format: Raw. API Version: 2026-10 (shared/polar.ts → POLAR_API_VERSION ile aynı).
#      Event'ler: Subscription grubunun tamamı (created, active, updated, canceled,
#      uncanceled, revoked, past_due, ...). Diğer gruplar gerekmez.
#   4. Polar'ın verdiği webhook secret → GitHub secret POLAR_WEBHOOK_SECRET ve/veya
#      doğrudan SSM'e (aşağıdaki komut).
#
# ROTASYON: Parametreler ignore_changes = all ile korunuyor; Terraform değeri
# yalnızca İLK oluşturmada yazar. Sonraki değişiklikler:
#   aws ssm put-parameter --overwrite --type SecureString \
#     --name /cogletta/<env>/polar/webhook-secret --value '<secret>'
# Lambda'lar yeni değeri en geç 5 dk içinde alır (polar-secrets.ts önbelleği).
# ==============================================================================

locals {
  polar_param_prefix = "/${var.project_name}/${var.environment}/polar"

  polar_access_token_param_arn   = aws_ssm_parameter.polar_access_token.arn
  polar_webhook_secret_param_arn = aws_ssm_parameter.polar_webhook_secret.arn

  # Polar API'sini çağıran tüm Lambda'ların ortak env'i
  polar_api_env = {
    POLAR_SERVER             = var.polar_server
    POLAR_ACCESS_TOKEN_PARAM = aws_ssm_parameter.polar_access_token.name
    POLAR_PRODUCT_ID         = var.polar_product_id
  }
}

# ─── Sırlar (SSM SecureString, aws/ssm anahtarı) ──────────────────────────────

resource "aws_ssm_parameter" "polar_access_token" {
  name        = "${local.polar_param_prefix}/access-token"
  description = "Polar Organization Access Token (${var.polar_server})"
  type        = "SecureString"
  value       = var.polar_access_token != "" ? var.polar_access_token : "CHANGE_ME"

  lifecycle {
    ignore_changes = all
  }
}

resource "aws_ssm_parameter" "polar_webhook_secret" {
  name        = "${local.polar_param_prefix}/webhook-secret"
  description = "Polar webhook signing secret (${var.polar_server})"
  type        = "SecureString"
  value       = var.polar_webhook_secret != "" ? var.polar_webhook_secret : "CHANGE_ME"

  lifecycle {
    ignore_changes = all
  }
}

# ─── Webhook Lambda (PUBLIC route, imza ile doğrulanır) ───────────────────────

resource "aws_cloudwatch_log_group" "polar_webhook" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-polar-webhook"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "polar_webhook_lambda_role" {
  name = "${var.project_name}-${var.environment}-polar-webhook-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "polar_webhook_lambda_policy" {
  name = "${var.project_name}-${var.environment}-polar-webhook-policy"
  role = aws_iam_role.polar_webhook_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.polar_webhook.arn}:*"
      },
      {
        # Profil güncelleme (UpdateItem) + sub→user eşlemesi (PutItem/GetItem)
        Sid      = "DynamoDB"
        Effect   = "Allow"
        Action   = ["dynamodb:UpdateItem", "dynamodb:PutItem", "dynamodb:GetItem"]
        Resource = aws_dynamodb_table.users.arn
      },
      {
        # aws/ssm yönetilen anahtarı: kms:Decrypt key policy üzerinden (via SSM) verilir
        Sid      = "WebhookSecret"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = local.polar_webhook_secret_param_arn
      },
    ]
  })
}

data "archive_file" "polar_webhook_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/billing/polar-webhook/dist"
  output_path = "${path.module}/polar-webhook.zip"
}

resource "aws_lambda_function" "polar_webhook" {
  function_name    = "${var.project_name}-${var.environment}-polar-webhook"
  role             = aws_iam_role.polar_webhook_lambda_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.polar_webhook_lambda_zip.output_path
  source_code_hash = data.archive_file.polar_webhook_lambda_zip.output_base64sha256
  # Polar 10 sn içinde yanıt bekliyor; Lambda bundan önce bitmeli.
  timeout     = 9
  memory_size = local.lambda_memory_size

  environment {
    variables = {
      USERS_TABLE_NAME           = aws_dynamodb_table.users.name
      POLAR_WEBHOOK_SECRET_PARAM = aws_ssm_parameter.polar_webhook_secret.name
      POLAR_PRODUCT_ID           = var.polar_product_id
      NODE_OPTIONS               = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.polar_webhook]
}

resource "aws_lambda_permission" "allow_api_gateway_polar_webhook" {
  statement_id  = "AllowExecutionFromApiGatewayPolarWebhook"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.polar_webhook.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "polar_webhook" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.polar_webhook.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_polar_webhook" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "POST /billing/polar/webhook"
  target             = "integrations/${aws_apigatewayv2_integration.polar_webhook.id}"
  authorization_type = "NONE"
}

# Polar → Settings → Webhooks → Endpoint URL'e girilecek adres (API Gateway!)
output "polar_webhook_url" {
  value = "${aws_apigatewayv2_api.backend.api_endpoint}/billing/polar/webhook"
}

# ==============================================================================
# Abonelik yönetimi (JWT korumalı)
# GET    /me/subscription  -> güncel durum + kısa ömürlü müşteri portalı linki
# PATCH  /me/subscription  -> resume (dönem sonu iptalini geri al)
# DELETE /me/subscription  -> dönem sonunda iptal
# ==============================================================================

resource "aws_cloudwatch_log_group" "manage_subscription" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-manage-subscription"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "manage_subscription_lambda_role" {
  name = "${var.project_name}-${var.environment}-manage-subscription-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "manage_subscription_lambda_policy" {
  name = "${var.project_name}-${var.environment}-manage-subscription-policy"
  role = aws_iam_role.manage_subscription_lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.manage_subscription.arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.users.arn
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = local.polar_access_token_param_arn
      }
    ]
  })
}

data "archive_file" "manage_subscription_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/billing/manage-subscription/dist"
  output_path = "${path.module}/manage-subscription.zip"
}

resource "aws_lambda_function" "manage_subscription" {
  function_name    = "${var.project_name}-${var.environment}-manage-subscription"
  role             = aws_iam_role.manage_subscription_lambda_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.manage_subscription_lambda_zip.output_path
  source_code_hash = data.archive_file.manage_subscription_lambda_zip.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory_size

  environment {
    variables = merge(local.polar_api_env, {
      USERS_TABLE_NAME = aws_dynamodb_table.users.name
      CORS_ORIGIN      = var.cors_origin
      NODE_OPTIONS     = "--enable-source-maps"
    })
  }

  depends_on = [aws_cloudwatch_log_group.manage_subscription]
}

resource "aws_lambda_permission" "allow_api_gateway_manage_subscription" {
  statement_id  = "AllowExecutionFromApiGatewayManageSubscription"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.manage_subscription.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "manage_subscription" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.manage_subscription.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_me_subscription" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "GET /me/subscription"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  target             = "integrations/${aws_apigatewayv2_integration.manage_subscription.id}"
}

resource "aws_apigatewayv2_route" "patch_me_subscription" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "PATCH /me/subscription"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  target             = "integrations/${aws_apigatewayv2_integration.manage_subscription.id}"
}

resource "aws_apigatewayv2_route" "delete_me_subscription" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "DELETE /me/subscription"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  target             = "integrations/${aws_apigatewayv2_integration.manage_subscription.id}"
}

# ─── İzleme ───────────────────────────────────────────────────────────────────
# Polar 10 ARDIŞIK başarısız teslimatta endpoint'i otomatik kapatır. Webhook
# yalnızca kullanıcı eşlemesi çözülemediğinde (ve SSM okunamadığında) 500 döner;
# ikisi de tek seferde bile alarm üretir. Kapanırsa Polar panelinden yeniden açılmalı.
# İmza reddi: başlıkları tam ama imzası tutmayan istek (SIGNATURE_MISMATCH) alarm
# üretir — secret yanlışsa her teslimat 401 olur ve endpoint sessizce kapanır.
# Eksik başlıklı rastgele istekler alarm üretmez.

resource "aws_cloudwatch_metric_alarm" "polar_webhook_errors" {
  alarm_name          = "${var.project_name}-${var.environment}-polar-webhook-errors"
  alarm_description   = "Polar webhook Lambda hata verdi ya da 5xx döndü. Polar 10 ardışık hatada endpoint'i kapatır — logları ve Polar → Webhooks → Deliveries'i kontrol et."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.polar_webhook.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.email_pipeline_alerts.arn]
}

resource "aws_cloudwatch_log_metric_filter" "polar_webhook_failures" {
  name           = "${var.project_name}-${var.environment}-polar-webhook-failures"
  log_group_name = aws_cloudwatch_log_group.polar_webhook.name
  pattern        = "?USER_MAPPING_FAILED ?SIGNATURE_MISMATCH ?\"could not load webhook secret\""

  metric_transformation {
    name          = "PolarWebhookFailures"
    namespace     = "Cogletta/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "polar_webhook_failures" {
  alarm_name          = "${var.project_name}-${var.environment}-polar-webhook-failures"
  alarm_description   = "Polar webhook reddedildi/işlenemedi (kullanıcı eşlemesi yok, secret okunamadı ya da secret yanlış). Ödeme yapan kullanıcı Free'de kalıyor olabilir."
  namespace           = "Cogletta/${var.environment}"
  metric_name         = "PolarWebhookFailures"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.email_pipeline_alerts.arn]
}
