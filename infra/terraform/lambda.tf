locals {
  lambda_runtime     = "nodejs20.x"
  lambda_timeout     = 10
  lambda_memory_size = 256
  lambda_src_root    = "${path.module}/../../app-backend/lambdas"
}

# CloudWatch log group for update-interests Lambda

resource "aws_cloudwatch_log_group" "update_interests" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-update-interests"
  retention_in_days = 14
}

# IAM role and policy for update-interests Lambda

resource "aws_iam_role" "update_interests_lambda_role" {
  name = "${var.project_name}-${var.environment}-update-interests-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "update_interests_lambda_policy" {
  name = "${var.project_name}-${var.environment}-update-interests-lambda-policy"
  role = aws_iam_role.update_interests_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Logging"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.update_interests.arn}:*"
      },
      {
        Sid    = "DynamoDB"
        Effect = "Allow"
        Action = [
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
        ]
        Resource = aws_dynamodb_table.users.arn
      },
    ]
  })
}

# Build artifact: zip the compiled dist/ output, never raw TypeScript

data "archive_file" "update_interests_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/users/update-interests/dist"
  output_path = "${path.module}/update-interests.zip"
}

# Lambda function

resource "aws_lambda_function" "update_interests" {
  function_name    = "${var.project_name}-${var.environment}-update-interests"
  role             = aws_iam_role.update_interests_lambda_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.update_interests_lambda_zip.output_path
  source_code_hash = data.archive_file.update_interests_lambda_zip.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory_size

  environment {
    variables = {
      USERS_TABLE_NAME = aws_dynamodb_table.users.name
      CORS_ORIGIN      = var.cors_origin
      NODE_OPTIONS     = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.update_interests]
}

# get-profile Lambda

resource "aws_cloudwatch_log_group" "get_profile" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-get-profile"
  retention_in_days = 14
}

resource "aws_iam_role" "get_profile_lambda_role" {
  name = "${var.project_name}-${var.environment}-get-profile-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "get_profile_lambda_policy" {
  name = "${var.project_name}-${var.environment}-get-profile-lambda-policy"
  role = aws_iam_role.get_profile_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Logging"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "${aws_cloudwatch_log_group.get_profile.arn}:*"
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

data "archive_file" "get_profile_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/users/get-profile/dist"
  output_path = "${path.module}/get-profile.zip"
}

resource "aws_lambda_function" "get_profile" {
  function_name    = "${var.project_name}-${var.environment}-get-profile"
  role             = aws_iam_role.get_profile_lambda_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.get_profile_lambda_zip.output_path
  source_code_hash = data.archive_file.get_profile_lambda_zip.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory_size

  environment {
    variables = {
      USERS_TABLE_NAME = aws_dynamodb_table.users.name
      CORS_ORIGIN      = var.cors_origin
      NODE_OPTIONS     = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.get_profile]
}
