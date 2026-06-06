output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}

output "cognito_domain" {
  value = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "users_table_name" {
  value = aws_dynamodb_table.users.name
}

output "articles_table_name" {
  value = aws_dynamodb_table.articles.name
}

output "backend_api_url" {
  value = aws_apigatewayv2_api.backend.api_endpoint
}
