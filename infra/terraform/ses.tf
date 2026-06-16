# ==============================================================================
# SES — cogletta.com domain verification + DKIM
# ==============================================================================

resource "aws_ses_domain_identity" "cogletta" {
  domain = "cogletta.com"
}

resource "aws_ses_domain_dkim" "cogletta" {
  domain = aws_ses_domain_identity.cogletta.domain
}

# Route53'e DKIM kayıtları ekle (otomatik)
resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = data.aws_route53_zone.cogletta.zone_id
  name    = "${aws_ses_domain_dkim.cogletta.dkim_tokens[count.index]}._domainkey.cogletta.com"
  type    = "CNAME"
  ttl     = 300
  records = ["${aws_ses_domain_dkim.cogletta.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# SES domain verification TXT kaydı
resource "aws_route53_record" "ses_verification" {
  zone_id = data.aws_route53_zone.cogletta.zone_id
  name    = "_amazonses.cogletta.com"
  type    = "TXT"
  ttl     = 300
  records = [aws_ses_domain_identity.cogletta.verification_token]
}

resource "aws_ses_domain_identity_verification" "cogletta" {
  domain     = aws_ses_domain_identity.cogletta.id
  depends_on = [aws_route53_record.ses_verification]
}

# MX kaydı — read@cogletta.com'a email alabilmek için
resource "aws_route53_record" "mx" {
  zone_id = data.aws_route53_zone.cogletta.zone_id
  name    = "cogletta.com"
  type    = "MX"
  ttl     = 300
  records = ["10 inbound-smtp.eu-central-1.amazonaws.com"]
}

# SPF kaydı — email deliverability
resource "aws_route53_record" "spf" {
  zone_id = data.aws_route53_zone.cogletta.zone_id
  name    = "cogletta.com"
  type    = "TXT"
  ttl     = 300
  records = ["v=spf1 include:amazonses.com ~all"]
}

# DMARC kaydı
resource "aws_route53_record" "dmarc" {
  zone_id = data.aws_route53_zone.cogletta.zone_id
  name    = "_dmarc.cogletta.com"
  type    = "TXT"
  ttl     = 300
  records = ["v=DMARC1; p=quarantine; rua=mailto:read@cogletta.com"]
}
