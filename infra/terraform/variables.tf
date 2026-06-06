variable "project_name" {
  type    = string
  default = "daily3"
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
  description = "Single origin allowed for CORS on Lambda responses (e.g. https://app.daily3.io)"
  type        = string
  default     = "*"
}

variable "cors_allowed_origins" {
  description = "List of origins allowed by API Gateway CORS config"
  type        = list(string)
  default     = ["*"]
}
