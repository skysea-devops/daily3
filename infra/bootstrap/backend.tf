terraform {
  backend "s3" {
    bucket       = "daily3-dev-tfstate"
    key          = "daily3/bootstrap/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}