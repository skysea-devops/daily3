resource "aws_apigatewayv2_api" "backend" {
  name          = "${var.project_name}-${var.environment}-backend-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.cors_allowed_origins
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Authorization", "Content-Type"]
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.backend.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.project_name}-${var.environment}-cognito-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.web.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.backend.id
  name        = "$default"
  auto_deploy = true
}

# update-interests route

resource "aws_apigatewayv2_integration" "update_interests" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.update_interests.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "put_me_interests" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "PUT /me/interests"
  target             = "integrations/${aws_apigatewayv2_integration.update_interests.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "allow_api_gateway_update_interests" {
  statement_id  = "AllowExecutionFromApiGatewayUpdateInterests"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.update_interests.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

# get-profile route

resource "aws_apigatewayv2_integration" "get_profile" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.get_profile.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_me_profile" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "GET /me/profile"
  target             = "integrations/${aws_apigatewayv2_integration.get_profile.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "allow_api_gateway_get_profile" {
  statement_id  = "AllowExecutionFromApiGatewayGetProfile"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_profile.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

# get-articles route

resource "aws_apigatewayv2_integration" "get_articles" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.get_articles.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_me_articles" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "GET /me/articles"
  target             = "integrations/${aws_apigatewayv2_integration.get_articles.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "allow_api_gateway_get_articles" {
  statement_id  = "AllowExecutionFromApiGatewayGetArticles"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_articles.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}
