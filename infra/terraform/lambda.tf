resource "aws_iam_role" "update_interests_lambda_role" {
  name = "${var.project_name}-${var.environment}-update-interests-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "update_interests_lambda_policy" {
  name = "${var.project_name}-${var.environment}-update-interests-lambda-policy"
  role = aws_iam_role.update_interests_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem"
        ]
        Resource = aws_dynamodb_table.users.arn
      }
    ]
  })
}

data "archive_file" "update_interests_lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../app-backend/lambdas/users/update-interests"
  output_path = "${path.module}/update-interests.zip"
}

resource "aws_lambda_function" "update_interests" {
  function_name = "${var.project_name}-${var.environment}-update-interests"
  role          = aws_iam_role.update_interests_lambda_role.arn

  runtime = "nodejs20.x"
  handler = "index.handler"

  filename         = data.archive_file.update_interests_lambda_zip.output_path
  source_code_hash = data.archive_file.update_interests_lambda_zip.output_base64sha256

  timeout = 10

  environment {
    variables = {
      USERS_TABLE_NAME = aws_dynamodb_table.users.name
    }
  }
}