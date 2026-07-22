resource "aws_dynamodb_table" "users" {
  name         = "${var.project_name}-${var.environment}-users"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "PK"
  range_key = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # Tombstone kayıtları (silinen kullanıcıların LSSUB# eşlemesi) ~90 gün sonra
  # otomatik temizlensin. TTL yalnızca "ttl" alanı OLAN item'ları siler; normal
  # profil/eşleme kayıtlarında bu alan yoktur, etkilenmezler.
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  # Enable point-in-time recovery in prod for data safety
  point_in_time_recovery {
    enabled = var.environment == "prod"
  }

  # Enable deletion protection in prod
  deletion_protection_enabled = var.environment == "prod"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_dynamodb_table" "articles" {
  name         = "${var.project_name}-${var.environment}-articles"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "PK"
  range_key = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  # TTL — items expire automatically after 30 days
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.environment == "prod"
  }

  deletion_protection_enabled = var.environment == "prod"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
