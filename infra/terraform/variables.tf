variable "project_name" {
  type    = string
  default = "daily3"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "google_client_id" {
  type      = string
  sensitive = true
}

variable "google_client_secret" {
  type      = string
  sensitive = true
}

variable "github_repo" {
  type    = string
  default = "GokdenizGokdeniz/daily3"
}