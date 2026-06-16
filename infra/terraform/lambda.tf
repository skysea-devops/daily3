locals {
  lambda_runtime     = "nodejs20.x"
  lambda_timeout     = 10
  lambda_memory_size = 256
  lambda_src_root    = "${path.module}/../../app-backend/lambdas"
}

data "aws_caller_identity" "current" {}

# ==============================================================================
# update-interests
# ==============================================================================

resource "aws_cloudwatch_log_group" "update_interests" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-update-interests"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

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
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.update_interests.arn}:*"
      },
      {
        Sid      = "DynamoDB"
        Effect   = "Allow"
        Action   = ["dynamodb:UpdateItem", "dynamodb:GetItem"]
        Resource = aws_dynamodb_table.users.arn
      },
      {
        Sid      = "DynamoReadArticles"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = aws_dynamodb_table.articles.arn
      },
      {
        Sid      = "InvokeGenerateArticles"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = aws_lambda_function.generate_articles.arn
      },
    ]
  })
}

data "archive_file" "update_interests_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/users/update-interests/dist"
  output_path = "${path.module}/update-interests.zip"
}

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
      USERS_TABLE_NAME                = aws_dynamodb_table.users.name
      ARTICLES_TABLE_NAME             = aws_dynamodb_table.articles.name
      GENERATE_ARTICLES_FUNCTION_NAME = aws_lambda_function.generate_articles.function_name
      CORS_ORIGIN                     = var.cors_origin
      DEVELOPER_USER_IDS              = var.developer_user_ids
      NODE_OPTIONS                    = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.update_interests]
}

# ==============================================================================
# get-profile
# ==============================================================================

resource "aws_cloudwatch_log_group" "get_profile" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-get-profile"
  retention_in_days = var.environment == "prod" ? 30 : 14
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
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
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

# ==============================================================================
# generate-articles
# ==============================================================================

resource "aws_cloudwatch_log_group" "generate_articles" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-generate-articles"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "generate_articles_lambda_role" {
  name = "${var.project_name}-${var.environment}-generate-articles-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "generate_articles_lambda_policy" {
  name = "${var.project_name}-${var.environment}-generate-articles-policy"
  role = aws_iam_role.generate_articles_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.generate_articles.arn}:*"
      },
      {
        Sid      = "DynamoWriteArticles"
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:Query"]
        Resource = aws_dynamodb_table.articles.arn
      },
      {
        Sid      = "DynamoReadUsers"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = aws_dynamodb_table.users.arn
      },
      {
        Sid    = "BedrockCrossRegionProfile"
        Effect = "Allow"
        Action = ["bedrock:InvokeModel"]
        Resource = [
          "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:inference-profile/eu.anthropic.claude-haiku-4-5-20251001-v1:0",
        ]
      },
      {
        Sid    = "BedrockFoundationModels"
        Effect = "Allow"
        Action = ["bedrock:InvokeModel"]
        Resource = [
          "arn:aws:bedrock:eu-*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0",
        ]
      },
      {
        Sid      = "SESsendEmail"
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
      },
      {
        Sid      = "PollyTTS"
        Effect   = "Allow"
        Action   = ["polly:SynthesizeSpeech"]
        Resource = "*"
      },
      {
        Sid      = "AudioS3Write"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:HeadObject", "s3:GetObject"]
        Resource = "arn:aws:s3:::${aws_s3_bucket.audio.id}/*"
      },
    ]
  })
}

data "archive_file" "generate_articles_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/articles/generate-articles/dist"
  output_path = "${path.module}/generate-articles.zip"
}

resource "aws_lambda_function" "generate_articles" {
  function_name    = "${var.project_name}-${var.environment}-generate-articles"
  role             = aws_iam_role.generate_articles_lambda_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.generate_articles_lambda_zip.output_path
  source_code_hash = data.archive_file.generate_articles_lambda_zip.output_base64sha256
  timeout          = 150
  memory_size      = var.environment == "prod" ? 512 : 256

  environment {
    variables = {
      ARTICLES_TABLE_NAME = aws_dynamodb_table.articles.name
      USERS_TABLE_NAME    = aws_dynamodb_table.users.name
      SES_FROM_EMAIL      = var.ses_from_email
      CORS_ORIGIN         = var.cors_origin
      BEDROCK_REGION      = var.aws_region
      AUDIO_BUCKET_NAME   = aws_s3_bucket.audio.id
      NODE_OPTIONS        = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.generate_articles]
}

# ==============================================================================
# get-articles
# ==============================================================================

resource "aws_cloudwatch_log_group" "get_articles" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-get-articles"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "get_articles_lambda_role" {
  name = "${var.project_name}-${var.environment}-get-articles-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "get_articles_lambda_policy" {
  name = "${var.project_name}-${var.environment}-get-articles-policy"
  role = aws_iam_role.get_articles_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.get_articles.arn}:*"
      },
      {
        Sid      = "DynamoReadArticles"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = aws_dynamodb_table.articles.arn
      },
      {
        Sid      = "DynamoReadUsers"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = aws_dynamodb_table.users.arn
      },
      {
        Sid      = "InvokeGenerateArticles"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = aws_lambda_function.generate_articles.arn
      },
    ]
  })
}

data "archive_file" "get_articles_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/articles/get-articles/dist"
  output_path = "${path.module}/get-articles.zip"
}

resource "aws_lambda_function" "get_articles" {
  function_name    = "${var.project_name}-${var.environment}-get-articles"
  role             = aws_iam_role.get_articles_lambda_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.get_articles_lambda_zip.output_path
  source_code_hash = data.archive_file.get_articles_lambda_zip.output_base64sha256
  timeout          = local.lambda_timeout
  memory_size      = local.lambda_memory_size

  environment {
    variables = {
      ARTICLES_TABLE_NAME             = aws_dynamodb_table.articles.name
      USERS_TABLE_NAME                = aws_dynamodb_table.users.name
      GENERATE_ARTICLES_FUNCTION_NAME = aws_lambda_function.generate_articles.function_name
      CORS_ORIGIN                     = var.cors_origin
      NODE_OPTIONS                    = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.get_articles]
}

# ==============================================================================
# daily-trigger
# ==============================================================================

resource "aws_cloudwatch_log_group" "daily_trigger" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-daily-trigger"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "daily_trigger_lambda_role" {
  name = "${var.project_name}-${var.environment}-daily-trigger-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "daily_trigger_lambda_policy" {
  name = "${var.project_name}-${var.environment}-daily-trigger-policy"
  role = aws_iam_role.daily_trigger_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.daily_trigger.arn}:*"
      },
      {
        Sid      = "DynamoScanUsers"
        Effect   = "Allow"
        Action   = ["dynamodb:Scan"]
        Resource = aws_dynamodb_table.users.arn
      },
      {
        Sid      = "InvokeGenerateArticles"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = aws_lambda_function.generate_articles.arn
      },
    ]
  })
}

data "archive_file" "daily_trigger_lambda_zip" {
  type        = "zip"
  source_dir  = "${local.lambda_src_root}/articles/daily-trigger/dist"
  output_path = "${path.module}/daily-trigger.zip"
}

resource "aws_lambda_function" "daily_trigger" {
  function_name    = "${var.project_name}-${var.environment}-daily-trigger"
  role             = aws_iam_role.daily_trigger_lambda_role.arn
  runtime          = local.lambda_runtime
  handler          = "index.handler"
  filename         = data.archive_file.daily_trigger_lambda_zip.output_path
  source_code_hash = data.archive_file.daily_trigger_lambda_zip.output_base64sha256
  timeout          = 300
  memory_size      = 256

  environment {
    variables = {
      USERS_TABLE_NAME                = aws_dynamodb_table.users.name
      GENERATE_ARTICLES_FUNCTION_NAME = aws_lambda_function.generate_articles.function_name
      NODE_OPTIONS                    = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.daily_trigger]
}

resource "aws_cloudwatch_event_rule" "daily_07_00" {
  name                = "${var.project_name}-${var.environment}-daily-07-00"
  description         = "Triggers daily article generation at 07:00 Turkey time (04:00 UTC)"
  schedule_expression = "cron(0 4 * * ? *)"
}

resource "aws_cloudwatch_event_target" "daily_trigger_target" {
  rule      = aws_cloudwatch_event_rule.daily_07_00.name
  target_id = "daily-trigger-lambda"
  arn       = aws_lambda_function.daily_trigger.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.daily_trigger.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_07_00.arn
}

# ==============================================================================
# Audio Edition — S3 Bucket (shared Polly TTS cache)
# ==============================================================================

resource "aws_s3_bucket" "audio" {
  bucket = "daily3-dev-audio" # kept for backward compat — contains existing audio files
}

resource "aws_s3_bucket_public_access_block" "audio" {
  bucket = aws_s3_bucket.audio.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "audio_public_read" {
  bucket     = aws_s3_bucket.audio.id
  depends_on = [aws_s3_bucket_public_access_block.audio]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadAudio"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.audio.arn}/*"
    }]
  })
}

resource "aws_s3_bucket_lifecycle_configuration" "audio" {
  bucket = aws_s3_bucket.audio.id

  rule {
    id     = "expire-audio-30-days"
    status = "Enabled"

    filter {
      prefix = "audio/"
    }

    expiration {
      days = 30
    }
  }
}


