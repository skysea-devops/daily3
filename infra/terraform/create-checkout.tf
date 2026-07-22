# ==============================================================================
# create-checkout Lambda
# POST /me/checkout — LS Checkouts API ile TEK variant'lı, kullanıcıya bağlı,
# kısa ömürlü checkout üretir. Mükerrer abonelik guard'ı içerir (aktif aboneliği
# olan kullanıcıya yeni checkout açtırmaz → çift ücretlendirmeyi engeller).
# ==============================================================================

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
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.create_checkout.arn}:*"
      },
      {
        # Yalnızca profili (email + mevcut lsSubscriptionId) okur; yazma yok.
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = aws_dynamodb_table.users.arn
      }
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
      USERS_TABLE_NAME       = aws_dynamodb_table.users.name
      LEMONSQUEEZY_API_KEY   = var.lemonsqueezy_api_key
      LS_STORE_ID            = var.lemonsqueezy_store_id
      LS_MONTHLY_VARIANT_ID  = var.lemonsqueezy_monthly_variant_id
      LS_YEARLY_VARIANT_ID   = var.lemonsqueezy_yearly_variant_id
      # Ödeme sonrası dönüş kökü = CORS listesinin ilk origin'i (ör. https://cogletta.com)
      APP_BASE_URL           = element(split(",", var.cors_origin), 0)
      CORS_ORIGIN            = var.cors_origin
      NODE_OPTIONS           = "--enable-source-maps"
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
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  target             = "integrations/${aws_apigatewayv2_integration.create_checkout.id}"
}
