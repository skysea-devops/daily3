import {
  to = aws_s3_bucket.terraform_state
  id = "daily3-dev-tfstate"
}

import {
  to = aws_s3_bucket_versioning.terraform_state
  id = "daily3-dev-tfstate"
}

import {
  to = aws_s3_bucket_server_side_encryption_configuration.terraform_state
  id = "daily3-dev-tfstate"
}

import {
  to = aws_s3_bucket_public_access_block.terraform_state
  id = "daily3-dev-tfstate"
}

import {
  to = aws_iam_openid_connect_provider.github
  id = "arn:aws:iam::117647030196:oidc-provider/token.actions.githubusercontent.com"
}

import {
  to = aws_iam_role.github_actions
  id = "daily3-dev-github-actions-role"
}

import {
  to = aws_iam_policy.github_actions_terraform
  id = "arn:aws:iam::117647030196:policy/daily3-dev-terraform-policy"
}

import {
  to = aws_iam_role_policy_attachment.github_actions_terraform
  id = "daily3-dev-github-actions-role/arn:aws:iam::117647030196:policy/daily3-dev-terraform-policy"
}