terraform {
  backend "s3" {
    bucket       = "daily3-tfstate"
    key          = "daily3/dev/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}