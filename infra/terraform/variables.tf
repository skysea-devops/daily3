variable "project_name" {
  type    = string
  default = "cogletta"
}

variable "environment" {
  type    = string
  default = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "github_repo" {
  type    = string
  default = "skysea-devops/daily3"
}

variable "cors_origin" {
  description = "Comma-separated origins allowed for CORS on Lambda responses. Lambda reflects the matching request Origin (e.g. \"https://cogletta.com,https://www.cogletta.com\")."
  type        = string
  default     = "*"
}

variable "cors_allowed_origins" {
  description = "List of origins allowed by API Gateway CORS config"
  type        = list(string)
  default     = ["*"]
}

variable "ses_from_email" {
  description = "Verified SES email address for sending daily digest notifications"
  type        = string
  default     = "read@cogletta.com"
}

variable "developer_user_ids" {
  description = "Comma-separated list of Cognito user IDs (sub) that bypass the daily generate limit"
  type        = string
  default     = ""
}

variable "app_url" {
  description = "Frontend app URL (e.g. https://cogletta.com)"
  type        = string
  default     = "https://dev.cogletta.com"
}

variable "contact_email" {
  description = "Contact email shown in welcome email"
  type        = string
  default     = "read@cogletta.com"
}

variable "app_name" {
  description = "App display name used in emails"
  type        = string
  default     = "Cogletta"
}

variable "google_client_id" {
  description = "Google OAuth Client ID"
  type        = string
}

variable "google_client_secret" {
  description = "Google OAuth Client Secret"
  type        = string
  sensitive   = true
}

variable "domain_name" {
  description = "Primary domain for ACM cert and CloudFront (e.g. cogletta.com or dev.cogletta.com)"
  type        = string
  default     = "dev.cogletta.com"
}

variable "domain_aliases" {
  description = "CloudFront aliases (e.g. [\"cogletta.com\", \"www.cogletta.com\"] or [\"dev.cogletta.com\"])"
  type        = list(string)
  default     = ["dev.cogletta.com"]
}

variable "lemonsqueezy_webhook_secret" {
  description = "Lemon Squeezy webhook signing secret (LS panelinde belirlenen string)"
  type        = string
  sensitive   = true
  default     = "" # ilk deploy icin bos birak; sonra GitHub secret'tan TF_VAR ile gelir
}