# ──────────────────────────────────────────────────────────────────────────────
# Shared Lambda config
# ──────────────────────────────────────────────────────────────────────────────

locals {
  lambda_runtime     = "nodejs20.x"
  lambda_timeout     = 10
  lambda_memory_size = 256
  # dist/ folders are built by: cd app-backend && npm run build
  lambda_src_root    = "${path.module}/../../app-backend/lambdas"
}

# ──────────────────────────────────────────────────────────────────────────────
# CloudWatch log groups (created explicitly so retention is controlled)
# ──────────────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "update_interests" {
  name              = "/aws/lambda/${aws_lambda_function.update_interests.function_name}"
  retention_in_days = 14
}

# ──────────────────────────────────────────────────────────────────────────────
# update-interests Lambda
# ──────────────────────────────────────────────────────────────────────────────

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

data "archive_file" "update_interests_lambda_zip" {
  type        = "zip"
  # Zip only the compiled dist/ output — never raw TypeScript
  source_dir  = "${local.lambda_src_root}/users/update-interests/dist"
  output_path = "${path.module}/update-interests.zip"
}

resource "aws_lambda_function" "update_interests" {
  function_name = "${var.project_name}-${var.environment}-update-interests"
  role          = aws_iam_role.update_interests_lambda_role.arn

  runtime  = local.lambda_runtime
  handler  = "index.handler"
  # ESM bundle — tell Lambda to treat it as an ES module
  filename = data.archive_file.update_interests_lambda_zip.output_path
  source_code_hash = data.archive_file.update_interests_lambda_zip.output_base64sha256

  timeout     = local.lambda_timeout
  memory_size = local.lambda_memory_size

  environment {
    variables = {
      USERS_TABLE_NAME = aws_dynamodb_table.users.name
      CORS_ORIGIN      = var.cors_origin
      NODE_OPTIONS     = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.update_interests]
}
