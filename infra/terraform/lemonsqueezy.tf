# ==============================================================================
# Lemon Squeezy — webhook Lambda (PUBLIC route, imza ile doğrulanır)
# Stripe yerine Merchant of Record modeli. Tek Lambda: abonelik statüsünü
# dinleyip DynamoDB'de plan alanını günceller.
# ==============================================================================

resource "aws_cloudwatch_log_group" "lemonsqueezy_webhook" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-lemonsqueezy-webhook"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "lemonsqueezy_webhook_lambda_role" {
  name = "${var.project_name}-${var.environment}-lemonsqueezy-webhook-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "lemonsqueezy_webhook_lambda_policy" {
  name = "${var.project_name}-${var.environment}-lemonsqueezy-webhook-policy"
  role = aws_iam_role.lemonsqueezy_webhook_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.lemonsqueezy_webhook.arn}:*"
      },
      {
        # webhook hem profili günceller (UpdateItem) hem sub→user eşlemesini
        # yazar/okur (PutItem/GetItem) — hepsi users tablosunda
        Sid      = "DynamoDB"
        Effect   = "Allow"
        Action   = ["dynamodb:UpdateItem", "dynamodb:PutItem", "dynamodb:GetItem"]
        Resource = aws_dynamodb_table.users.arn
      },
    ]
  })
}

data "archive_file" "lemonsqueezy_webhook_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/billing/lemonsqueezy-webhook/dist"
  output_path = "${path.module}/lemonsqueezy-webhook.zip"
}

resource "aws_lambda_function" "lemonsqueezy_webhook" {
  function_name    = "${var.project_name}-${var.environment}-lemonsqueezy-webhook"
  role             = aws_iam_role.lemonsqueezy_webhook_lambda_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.lemonsqueezy_webhook_lambda_zip.output_path
  source_code_hash = data.archive_file.lemonsqueezy_webhook_lambda_zip.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory_size

  environment {
    variables = {
      USERS_TABLE_NAME           = aws_dynamodb_table.users.name
      LEMONSQUEEZY_WEBHOOK_SECRET = var.lemonsqueezy_webhook_secret
      NODE_OPTIONS               = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.lemonsqueezy_webhook]
}

resource "aws_lambda_permission" "allow_api_gateway_lemonsqueezy_webhook" {
  statement_id  = "AllowExecutionFromApiGatewayLemonSqueezyWebhook"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.lemonsqueezy_webhook.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "lemonsqueezy_webhook" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.lemonsqueezy_webhook.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_lemonsqueezy_webhook" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "POST /lemonsqueezy/webhook"
  target             = "integrations/${aws_apigatewayv2_integration.lemonsqueezy_webhook.id}"
  authorization_type = "NONE"
}

# Lemon Squeezy Dashboard → Webhooks → Callback URL'e girilecek adres
output "lemonsqueezy_webhook_url" {
  value = "${aws_apigatewayv2_api.backend.api_endpoint}/lemonsqueezy/webhook"
}
