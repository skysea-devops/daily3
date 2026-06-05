resource "aws_iam_policy" "github_actions_terraform" {

  name = "${var.project_name}-${var.environment}-terraform-policy"

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [

      {
        Sid    = "TerraformStateBucket"
        Effect = "Allow"

        Action = [
          "s3:ListBucket",
          "s3:GetBucketVersioning",
          "s3:GetBucketEncryption"
        ]

        Resource = aws_s3_bucket.terraform_state.arn
      },

      {
        Sid    = "TerraformStateObjects"
        Effect = "Allow"

        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]

        Resource = "${aws_s3_bucket.terraform_state.arn}/*"
      },

      {
        Sid    = "CognitoManagement"
        Effect = "Allow"

        Action = [
          "cognito-idp:*"
        ]

        Resource = "*"
      }
    ]
  })
}