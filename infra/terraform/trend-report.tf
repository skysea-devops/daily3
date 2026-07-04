# ==============================================================================
# Weekly Trend Report (Pro) — her Pazar sabahı
#   weekly-trigger (bölgesel cron) → generate-trend-report → e-posta + DynamoDB
#   get-trend-report → dashboard kartı
# ==============================================================================

locals {
  # Pazar sabahı bölgesel cron'lar. Asya UTC+8/9 olduğundan Cumartesi 23:00 UTC
  # tetiklenir ki yerelde Pazar sabahına denk gelsin.
  weekly_schedules = {
    eu      = { cron = "cron(0 4 ? * SUN *)",  region = "EU" }
    us_east = { cron = "cron(0 11 ? * SUN *)", region = "US_EAST" }
    us_west = { cron = "cron(0 14 ? * SUN *)", region = "US_WEST" }
    asia    = { cron = "cron(0 23 ? * SAT *)", region = "ASIA" }
  }
}

# ------------------------------------------------------------------------------
# generate-trend-report  (RSS + Bedrock + SES + DynamoDB)
# ------------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "generate_trend_report" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-generate-trend-report"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "generate_trend_report_role" {
  name = "${var.project_name}-${var.environment}-generate-trend-report-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "generate_trend_report_policy" {
  name = "${var.project_name}-${var.environment}-generate-trend-report-policy"
  role = aws_iam_role.generate_trend_report_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.generate_trend_report.arn}:*"
      },
      { Sid = "WriteArticles", Effect = "Allow", Action = ["dynamodb:PutItem"], Resource = aws_dynamodb_table.articles.arn },
      { Sid = "ReadUsers",     Effect = "Allow", Action = ["dynamodb:GetItem"], Resource = aws_dynamodb_table.users.arn },
      {
        Sid      = "BedrockInferenceProfile"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:inference-profile/eu.anthropic.claude-haiku-4-5-20251001-v1:0"
      },
      {
        Sid      = "BedrockFoundationModel"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "arn:aws:bedrock:eu-*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0"
      },
      { Sid = "SendEmail", Effect = "Allow", Action = ["ses:SendEmail", "ses:SendRawEmail"], Resource = "*" },
    ]
  })
}

data "archive_file" "generate_trend_report_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/reports/generate-trend-report/dist"
  output_path = "${path.module}/generate-trend-report.zip"
}

resource "aws_lambda_function" "generate_trend_report" {
  function_name    = "${var.project_name}-${var.environment}-generate-trend-report"
  role             = aws_iam_role.generate_trend_report_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.generate_trend_report_zip.output_path
  source_code_hash = data.archive_file.generate_trend_report_zip.output_base64sha256
  timeout          = 150
  memory_size      = var.environment == "prod" ? 512 : 256

  environment {
    variables = {
      ARTICLES_TABLE_NAME = aws_dynamodb_table.articles.name
      USERS_TABLE_NAME    = aws_dynamodb_table.users.name
      SES_FROM_EMAIL      = var.ses_from_email
      NODE_OPTIONS        = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.generate_trend_report]
}

# ------------------------------------------------------------------------------
# weekly-trigger  (bölgesel Pazar cron; sadece Pro; generate-trend-report'u çağırır)
# ------------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "weekly_trigger" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-weekly-trigger"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "weekly_trigger_role" {
  name = "${var.project_name}-${var.environment}-weekly-trigger-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "weekly_trigger_policy" {
  name = "${var.project_name}-${var.environment}-weekly-trigger-policy"
  role = aws_iam_role.weekly_trigger_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.weekly_trigger.arn}:*"
      },
      { Sid = "ScanUsers",    Effect = "Allow", Action = ["dynamodb:Scan"], Resource = aws_dynamodb_table.users.arn },
      { Sid = "InvokeReport", Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = aws_lambda_function.generate_trend_report.arn },
    ]
  })
}

data "archive_file" "weekly_trigger_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/reports/weekly-trigger/dist"
  output_path = "${path.module}/weekly-trigger.zip"
}

resource "aws_lambda_function" "weekly_trigger" {
  function_name    = "${var.project_name}-${var.environment}-weekly-trigger"
  role             = aws_iam_role.weekly_trigger_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.weekly_trigger_zip.output_path
  source_code_hash = data.archive_file.weekly_trigger_zip.output_base64sha256
  timeout          = 120
  memory_size      = local.lambda_memory_size

  environment {
    variables = {
      USERS_TABLE_NAME                     = aws_dynamodb_table.users.name
      GENERATE_TREND_REPORT_FUNCTION_NAME  = aws_lambda_function.generate_trend_report.function_name
      NODE_OPTIONS                         = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.weekly_trigger]
}

resource "aws_cloudwatch_event_rule" "weekly" {
  for_each            = local.weekly_schedules
  name                = "${var.project_name}-${var.environment}-weekly-${each.key}"
  description         = "Weekly trend report for region ${each.value.region}"
  schedule_expression = each.value.cron
}

resource "aws_cloudwatch_event_target" "weekly_trigger_target" {
  for_each  = local.weekly_schedules
  rule      = aws_cloudwatch_event_rule.weekly[each.key].name
  target_id = "weekly-trigger-${each.key}"
  arn       = aws_lambda_function.weekly_trigger.arn
  input     = jsonencode({ region = each.value.region })
}

resource "aws_lambda_permission" "allow_eventbridge_weekly" {
  for_each      = local.weekly_schedules
  statement_id  = "AllowEventBridgeWeekly-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.weekly_trigger.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.weekly[each.key].arn
}

# ------------------------------------------------------------------------------
# get-trend-report  (GET /me/trend-report — JWT)
# ------------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "get_trend_report" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-get-trend-report"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "get_trend_report_role" {
  name = "${var.project_name}-${var.environment}-get-trend-report-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "get_trend_report_policy" {
  name = "${var.project_name}-${var.environment}-get-trend-report-policy"
  role = aws_iam_role.get_trend_report_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.get_trend_report.arn}:*"
      },
      { Sid = "QueryArticles", Effect = "Allow", Action = ["dynamodb:Query"], Resource = aws_dynamodb_table.articles.arn },
    ]
  })
}

data "archive_file" "get_trend_report_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/reports/get-trend-report/dist"
  output_path = "${path.module}/get-trend-report.zip"
}

resource "aws_lambda_function" "get_trend_report" {
  function_name    = "${var.project_name}-${var.environment}-get-trend-report"
  role             = aws_iam_role.get_trend_report_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.get_trend_report_zip.output_path
  source_code_hash = data.archive_file.get_trend_report_zip.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory_size

  environment {
    variables = {
      ARTICLES_TABLE_NAME = aws_dynamodb_table.articles.name
      CORS_ORIGIN         = var.cors_origin
      NODE_OPTIONS        = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.get_trend_report]
}

resource "aws_lambda_permission" "allow_api_gateway_get_trend_report" {
  statement_id  = "AllowExecutionFromApiGatewayGetTrendReport"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_trend_report.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "get_trend_report" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.get_trend_report.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_me_trend_report" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "GET /me/trend-report"
  target             = "integrations/${aws_apigatewayv2_integration.get_trend_report.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}
