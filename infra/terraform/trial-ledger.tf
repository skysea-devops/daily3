# infra/terraform/trial-ledger.tf
#
# Deneme hakki defterinin (TRIAL#<hmac(email)> / LEDGER) HMAC anahtari.
#
# NEDEN AYRI BIR SIR:
# Defterde duz metin e-posta tutulmuyor; hesap silindikten sonra geriye yalnizca
# parmak izi kaliyor. Anahtarsiz SHA-256 yetersiz olurdu — bilinen bir e-postanin
# defterde olup olmadigi deneme yanilma ile bulunabilirdi. Sunucu tarafinda
# saklanan bir anahtarla HMAC bunu engelliyor.
#
# NEDEN random_password:
# Yeni bir GitHub secret tanimlamayi gerektirmesin diye anahtar Terraform
# tarafindan bir kez uretiliyor ve state'te (sifreli S3 backend) duruyor.
# Kendi degerini kullanmak istersen TF_VAR_trial_ledger_secret ile gecebilirsin.
#
# UYARI — ANAHTAR DEGISMEMELI:
# Anahtar degisirse butun mevcut defter kayitlari erisilemez hale gelir ve daha
# once deneme kullanmis herkes yeniden 14 gunluk deneme alabilir. Bu yuzden
# lifecycle.ignore_changes ile korunuyor; bilerek rotate etmek gerekirse once
# tasima plani yapilmali.

resource "random_password" "trial_ledger_secret" {
  length  = 48
  special = false

  lifecycle {
    ignore_changes = all
  }
}

locals {
  # Disaridan bir deger verildiyse onu kullan, yoksa uretilen degeri.
  trial_ledger_secret = (
    var.trial_ledger_secret != ""
    ? var.trial_ledger_secret
    : random_password.trial_ledger_secret.result
  )

  trial_ledger_env = {
    TRIAL_LEDGER_SECRET           = local.trial_ledger_secret
    TRIAL_LEDGER_RETENTION_DAYS   = tostring(var.trial_ledger_retention_days)
    TRIAL_LEDGER_STRICT_ALIAS     = var.trial_ledger_strict_alias ? "true" : "false"
  }
}
