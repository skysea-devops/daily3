# ==============================================================================
# STRIPE BILLING
#   create-checkout  → POST /me/checkout    (JWT authorizer)
#   stripe-portal    → POST /me/portal      (JWT authorizer)
#   stripe-webhook   → POST /stripe/webhook (NO authorizer — Stripe imzayla doğrular)
#
# Sırlar google_client_secret ile aynı yolu izler: sensitive TF_VAR → GitHub secrets.
# stripe_price_id secret değil, dev/prod.tfvars'ta (dev=test price, prod=live price).
# ==============================================================================

# ------------------------------------------------------------------------------
# create-checkout
# ------------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "create_checkout" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-create-checkout"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "create_checkout_lambda_role" {
  name = "${var.project_name}-${var.environment}-create-checkout-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "create_checkout_lambda_policy" {
  name = "${var.project_name}-${var.environment}-create-checkout-policy"
  role = aws_iam_role.create_checkout_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.create_checkout.arn}:*"
      },
      {
        Sid      = "DynamoDB"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.users.arn
      },
    ]
  })
}

data "archive_file" "create_checkout_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/billing/create-checkout/dist"
  output_path = "${path.module}/create-checkout.zip"
}

resource "aws_lambda_function" "create_checkout" {
  function_name    = "${var.project_name}-${var.environment}-create-checkout"
  role             = aws_iam_role.create_checkout_lambda_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.create_checkout_lambda_zip.output_path
  source_code_hash = data.archive_file.create_checkout_lambda_zip.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory_size

  environment {
    variables = {
      USERS_TABLE_NAME  = aws_dynamodb_table.users.name
      CORS_ORIGIN       = var.cors_origin
      APP_URL           = var.app_url
      STRIPE_SECRET_KEY = var.stripe_secret_key
      STRIPE_PRICE_ID   = var.stripe_price_id
      NODE_OPTIONS      = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.create_checkout]
}

resource "aws_lambda_permission" "allow_api_gateway_create_checkout" {
  statement_id  = "AllowExecutionFromApiGatewayCreateCheckout"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_checkout.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "create_checkout" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.create_checkout.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_me_checkout" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "POST /me/checkout"
  target             = "integrations/${aws_apigatewayv2_integration.create_checkout.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# ------------------------------------------------------------------------------
# stripe-portal
# ------------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "stripe_portal" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-stripe-portal"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "stripe_portal_lambda_role" {
  name = "${var.project_name}-${var.environment}-stripe-portal-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "stripe_portal_lambda_policy" {
  name = "${var.project_name}-${var.environment}-stripe-portal-policy"
  role = aws_iam_role.stripe_portal_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.stripe_portal.arn}:*"
      },
      {
        Sid      = "DynamoDB"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = aws_dynamodb_table.users.arn
      },
    ]
  })
}

data "archive_file" "stripe_portal_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/billing/stripe-portal/dist"
  output_path = "${path.module}/stripe-portal.zip"
}

resource "aws_lambda_function" "stripe_portal" {
  function_name    = "${var.project_name}-${var.environment}-stripe-portal"
  role             = aws_iam_role.stripe_portal_lambda_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.stripe_portal_lambda_zip.output_path
  source_code_hash = data.archive_file.stripe_portal_lambda_zip.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory_size

  environment {
    variables = {
      USERS_TABLE_NAME  = aws_dynamodb_table.users.name
      CORS_ORIGIN       = var.cors_origin
      APP_URL           = var.app_url
      STRIPE_SECRET_KEY = var.stripe_secret_key
      NODE_OPTIONS      = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.stripe_portal]
}

resource "aws_lambda_permission" "allow_api_gateway_stripe_portal" {
  statement_id  = "AllowExecutionFromApiGatewayStripePortal"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.stripe_portal.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "stripe_portal" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.stripe_portal.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_me_portal" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "POST /me/portal"
  target             = "integrations/${aws_apigatewayv2_integration.stripe_portal.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# ------------------------------------------------------------------------------
# stripe-webhook  (PUBLIC — authorization_type = NONE)
# ------------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "stripe_webhook" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-stripe-webhook"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "stripe_webhook_lambda_role" {
  name = "${var.project_name}-${var.environment}-stripe-webhook-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "stripe_webhook_lambda_policy" {
  name = "${var.project_name}-${var.environment}-stripe-webhook-policy"
  role = aws_iam_role.stripe_webhook_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.stripe_webhook.arn}:*"
      },
      {
        Sid      = "DynamoDB"
        Effect   = "Allow"
        Action   = ["dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.users.arn
      },
    ]
  })
}

data "archive_file" "stripe_webhook_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/billing/stripe-webhook/dist"
  output_path = "${path.module}/stripe-webhook.zip"
}

resource "aws_lambda_function" "stripe_webhook" {
  function_name    = "${var.project_name}-${var.environment}-stripe-webhook"
  role             = aws_iam_role.stripe_webhook_lambda_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.stripe_webhook_lambda_zip.output_path
  source_code_hash = data.archive_file.stripe_webhook_lambda_zip.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory_size

  environment {
    variables = {
      USERS_TABLE_NAME      = aws_dynamodb_table.users.name
      STRIPE_SECRET_KEY     = var.stripe_secret_key
      STRIPE_WEBHOOK_SECRET = var.stripe_webhook_secret
      NODE_OPTIONS          = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.stripe_webhook]
}

resource "aws_lambda_permission" "allow_api_gateway_stripe_webhook" {
  statement_id  = "AllowExecutionFromApiGatewayStripeWebhook"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.stripe_webhook.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "stripe_webhook" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.stripe_webhook.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "post_stripe_webhook" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "POST /stripe/webhook"
  target             = "integrations/${aws_apigatewayv2_integration.stripe_webhook.id}"
  authorization_type = "NONE"
}

# Stripe Dashboard'a girilecek webhook URL'i
output "stripe_webhook_url" {
  value = "${aws_apigatewayv2_api.backend.api_endpoint}/stripe/webhook"
}
