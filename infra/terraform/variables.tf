# infra/terraform/variables.tf
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

# ─── Polar (Merchant of Record) ───────────────────────────────────────────────
# Sırlar yalnızca SSM parametresi İLK oluşturulurken kullanılır (polar.tf,
# ignore_changes = all). Sonraki değişiklikler doğrudan SSM'de yapılır.

variable "polar_server" {
  description = "Polar API ortamı: sandbox (sandbox-api.polar.sh) ya da production (api.polar.sh)"
  type        = string
  default     = "sandbox"

  validation {
    condition     = contains(["sandbox", "production"], var.polar_server)
    error_message = "polar_server 'sandbox' ya da 'production' olmalı."
  }
}

variable "polar_access_token" {
  description = "Polar Organization Access Token (yalnızca SSM parametresinin ilk değeri)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "polar_webhook_secret" {
  description = "Polar webhook signing secret (yalnızca SSM parametresinin ilk değeri)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "polar_monthly_product_id" {
  description = "Polar ürün ID'si — aylık Cogletta Pro (trial'sız)"
  type        = string
  default     = ""
}

variable "polar_yearly_product_id" {
  description = "Polar ürün ID'si — yıllık Cogletta Pro (trial'sız)"
  type        = string
  default     = ""
}

# ─── Deneme hakki defteri (trial ledger) ──────────────────────────────────────
# Bkz. app-backend/shared/trial-ledger.ts

variable "trial_ledger_secret" {
  description = <<-EOT
    Deneme hakki defterinde e-posta parmak izi uretmek icin kullanilan HMAC anahtari.
    Bos birakilirsa Terraform kalici bir random deger uretir (trial-ledger.tf).
    DIKKAT: bu deger DEGISIRSE mevcut butun defter kayitlari erisilemez hale gelir
    ve daha once deneme kullanmis herkes yeniden deneme alabilir.
  EOT
  type        = string
  sensitive   = true
  default     = ""
}

variable "trial_ledger_retention_days" {
  description = <<-EOT
    Deneme parmak izinin saklanma suresi (gun). 0 = sinirsiz (DynamoDB TTL alani
    yazilmaz). Hesap silindikten sonra ne kadar sure "bu e-posta denemesini
    kullandi" bilgisinin tutulacagini belirler — veri saklama politikasiyla
    birlikte kararlastirilmali.
  EOT
  type        = number
  default     = 0
}

variable "trial_ledger_strict_alias" {
  description = <<-EOT
    true: e-posta normalize edilirken "+etiket" atilir ve gmail icin noktalar
    yok sayilir (ucuz alias kotuye kullanimini kapatir).
    false: yalnizca kucuk harf + trim.
  EOT
  type        = bool
  default     = true
}
