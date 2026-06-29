# ==============================================================================
# delete-account Lambda
# ==============================================================================

resource "aws_cloudwatch_log_group" "delete_account" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-delete-account"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "delete_account_lambda_role" {
  name = "${var.project_name}-${var.environment}-delete-account-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "delete_account_lambda_policy" {
  name = "${var.project_name}-${var.environment}-delete-account-policy"
  role = aws_iam_role.delete_account_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.delete_account.arn}:*"
      },
      {
        Sid    = "DynamoDeleteUser"
        Effect = "Allow"
        Action = ["dynamodb:DeleteItem", "dynamodb:Query"]
        Resource = [
          aws_dynamodb_table.users.arn,
          aws_dynamodb_table.articles.arn,
        ]
      },
      {
        Sid      = "CognitoDeleteUser"
        Effect   = "Allow"
        Action   = ["cognito-idp:AdminDeleteUser"]
        Resource = aws_cognito_user_pool.main.arn
      },
    ]
  })
}

data "archive_file" "delete_account_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/users/delete-account/dist"
  output_path = "${path.module}/delete-account.zip"
}

resource "aws_lambda_function" "delete_account" {
  function_name    = "${var.project_name}-${var.environment}-delete-account"
  role             = aws_iam_role.delete_account_lambda_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.delete_account_lambda_zip.output_path
  source_code_hash = data.archive_file.delete_account_lambda_zip.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory_size

  environment {
    variables = {
      USERS_TABLE_NAME    = aws_dynamodb_table.users.name
      ARTICLES_TABLE_NAME = aws_dynamodb_table.articles.name
      USER_POOL_ID        = aws_cognito_user_pool.main.id
      CORS_ORIGIN         = var.cors_origin
      NODE_OPTIONS        = "--enable-source-maps"
    }
  }
}

resource "aws_lambda_permission" "allow_api_gateway_delete_account" {
  statement_id  = "AllowExecutionFromApiGatewayDeleteAccount"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.delete_account.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "delete_account" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.delete_account.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "delete_me" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "DELETE /me"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  target             = "integrations/${aws_apigatewayv2_integration.delete_account.id}"
}
