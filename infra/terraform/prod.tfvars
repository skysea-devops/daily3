environment          = "prod"
app_url              = "https://www.cogletta.com"
contact_email        = "read@cogletta.com"
app_name             = "Cogletta"
ses_from_email       = "read@cogletta.com"
cors_origin          = "https://cogletta.com,https://www.cogletta.com"
cors_allowed_origins = ["https://www.cogletta.com","https://cogletta.com" ]
domain_name          = "cogletta.com"
domain_aliases       = ["cogletta.com", "www.cogletta.com"]

# Polar — production (api.polar.sh).
# Tek ürün: Cogletta Pro yıllık $48, TRIAL'SIZ (deneme bizde). ID gizli değildir.
# Sandbox ID'si (dev.tfvars) prod'da GEÇERSİZ; bu production ürünüdür.
polar_server     = "production"
polar_product_id = "4dff6dfd-4f6b-4067-8282-212f39b9186a"
