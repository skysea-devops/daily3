# infra/terraform/essays.tf
# ==============================================================================
# Cogletta Essays — kilitli deneme gövdeleri + GET /essays/{slug}/body
#
# Kilitli bölümler (app-frontend build'inde .essays-private/<slug>.json) bu
# PRIVATE bucket'ta durur; deploy workflow'u `aws s3 sync --delete` ile yükler.
# Bucket'a internetten erişim YOK: 4 public-access engeli açık, ACL kapalı,
# yalnızca TLS. Okuyan tek şey get-body Lambda'sının rolü.
#
# NEDEN S3 (DynamoDB değil): deploy tek komut (sync --delete, kaldırılan deneme
# de silinir), versioning ile geri alınabilir, 400 KB öğe sınırı yok; Lambda
# konteyner başına önbelleklediği için okuma maliyeti önemsiz.
# ==============================================================================

locals {
  # Bucket adları global: hesap numarasıyla benzersizleştirildi. Workflow aynı
  # kuralla hesaplıyor (deploy-*.yml → "Sync locked essay bodies").
  essays_private_bucket = "${var.project_name}-${var.environment}-essays-private-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "essays_private" {
  bucket = local.essays_private_bucket
}

resource "aws_s3_bucket_public_access_block" "essays_private" {
  bucket                  = aws_s3_bucket.essays_private.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "essays_private" {
  bucket = aws_s3_bucket.essays_private.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "essays_private" {
  bucket = aws_s3_bucket.essays_private.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "essays_private" {
  bucket = aws_s3_bucket.essays_private.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "essays_private" {
  bucket = aws_s3_bucket.essays_private.id
  rule {
    id     = "expire-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
  depends_on = [aws_s3_bucket_versioning.essays_private]
}

resource "aws_s3_bucket_policy" "essays_private" {
  bucket = aws_s3_bucket.essays_private.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.essays_private.arn, "${aws_s3_bucket.essays_private.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.essays_private]
}

# ─── GET /essays/{slug}/body ──────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "essays_get_body" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-essays-get-body"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "essays_get_body_lambda_role" {
  name = "${var.project_name}-${var.environment}-essays-get-body-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "essays_get_body_lambda_policy" {
  name = "${var.project_name}-${var.environment}-essays-get-body-policy"
  role = aws_iam_role.essays_get_body_lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.essays_get_body.arn}:*"
      },
      {
        # Yalnızca okuma, yalnızca essays/ öneki. ListBucket yok: olmayan slug
        # AccessDenied döner, Lambda bunu 404'e çevirir (bucket içeriği listelenemez).
        Sid      = "ReadLockedBodies"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.essays_private.arn}/essays/*"
      },
      {
        # GetItem: resolveEntitlement için profil. UpdateItem: süresi geçmiş
        # denemeyi kayda yansıtan expireTrialIfDue (best-effort).
        Sid      = "Entitlement"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.users.arn
      },
    ]
  })
}

data "archive_file" "essays_get_body_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/essays/get-body/dist"
  output_path = "${path.module}/essays-get-body.zip"
}

resource "aws_lambda_function" "essays_get_body" {
  function_name    = "${var.project_name}-${var.environment}-essays-get-body"
  role             = aws_iam_role.essays_get_body_lambda_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.essays_get_body_lambda_zip.output_path
  source_code_hash = data.archive_file.essays_get_body_lambda_zip.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory_size

  environment {
    variables = {
      USERS_TABLE_NAME    = aws_dynamodb_table.users.name
      ESSAYS_BUCKET       = aws_s3_bucket.essays_private.bucket
      USER_POOL_ID        = aws_cognito_user_pool.main.id
      USER_POOL_CLIENT_ID = aws_cognito_user_pool_client.web.id
      NODE_OPTIONS        = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.essays_get_body]
}

resource "aws_lambda_permission" "allow_api_gateway_essays_get_body" {
  statement_id  = "AllowExecutionFromApiGatewayEssaysGetBody"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.essays_get_body.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "essays_get_body" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.essays_get_body.invoke_arn
  payload_format_version = "2.0"
}

# AUTH OPSİYONEL: authorizer bağlanmaz (token'ı zorunlu kılardı). Free ve
# 7 günlük penceredeki denemeler misafire açılır; token varsa Lambda kendisi
# Cognito JWKS ile doğrular. CORS, API'nin genel cors_configuration'ından gelir.
resource "aws_apigatewayv2_route" "get_essay_body" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "GET /essays/{slug}/body"
  authorization_type = "NONE"
  target             = "integrations/${aws_apigatewayv2_integration.essays_get_body.id}"
}

output "essays_private_bucket" {
  value = aws_s3_bucket.essays_private.bucket
}
