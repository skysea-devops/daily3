resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-${var.environment}-user-pool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  email_configuration {
    email_sending_account = "DEVELOPER"
    source_arn            = "arn:aws:ses:eu-central-1:117647030196:identity/cogletta.com"
    from_email_address    = "Cogletta <read@cogletta.com>"
  }

  schema {
    name                = "given_name"
    attribute_data_type = "String"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 50
    }
  }

  schema {
    name                = "family_name"
    attribute_data_type = "String"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 50
    }
  }

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  lambda_config {
    post_confirmation = aws_lambda_function.post_confirmation.arn
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project_name}-${var.environment}-web-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  supported_identity_providers = [
    "COGNITO"
  ]

  callback_urls = [
    "http://localhost:3000/auth/callback"
  ]

  logout_urls = [
    "http://localhost:3000/login"
  ]

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]

  allowed_oauth_scopes = [
    "openid",
    "email",
    "profile"
  ]

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  prevent_user_existence_errors = "ENABLED"
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project_name}-${var.environment}-auth"
  user_pool_id = aws_cognito_user_pool.main.id
}

# ==============================================================================
# PostConfirmation Lambda — Welcome email gönderir
# ==============================================================================

resource "aws_cloudwatch_log_group" "post_confirmation" {
  name              = "/aws/lambda/${var.project_name}-${var.environment}-post-confirmation"
  retention_in_days = var.environment == "prod" ? 30 : 14
}

resource "aws_iam_role" "post_confirmation_lambda_role" {
  name = "${var.project_name}-${var.environment}-post-confirmation-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "post_confirmation_lambda_policy" {
  name = "${var.project_name}-${var.environment}-post-confirmation-policy"
  role = aws_iam_role.post_confirmation_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logging"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.post_confirmation.arn}:*"
      },
      {
        Sid      = "SESsendEmail"
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
      },
    ]
  })
}

data "archive_file" "post_confirmation_lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../app-backend/lambdas/users/post-confirmation/dist"
  output_path = "${path.module}/post-confirmation.zip"
}

resource "aws_lambda_function" "post_confirmation" {
  function_name    = "${var.project_name}-${var.environment}-post-confirmation"
  role             = aws_iam_role.post_confirmation_lambda_role.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.post_confirmation_lambda_zip.output_path
  source_code_hash = data.archive_file.post_confirmation_lambda_zip.output_base64sha256
  timeout          = 10
  memory_size      = 128

  environment {
    variables = {
      SES_FROM_EMAIL = var.ses_from_email
      APP_URL        = var.app_url
      CONTACT_EMAIL  = var.contact_email
      APP_NAME       = var.app_name
      NODE_OPTIONS   = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.post_confirmation]
}

resource "aws_lambda_permission" "cognito_post_confirmation" {
  statement_id  = "AllowCognitoInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.post_confirmation.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

