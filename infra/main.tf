terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "consultant-agent-tfstate-us-east-1"
    key            = "infra/staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "consultant-agent-tflock-us-east-1"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "consultant-agent"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
