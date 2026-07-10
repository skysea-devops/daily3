# ─── E-posta pipeline izleme ──────────────────────────────────────────────────
# Sabah e-postalarının sessizce kesilmesini engelleyen alarm katmanı:
#   1. EmailSendFailures     — SES gönderimi hata verdi (1 saat içinde ≥1)
#   2. EmailsSkippedNoAddr   — kullanıcının email'i yok, e-posta atlandı
#   3. EmailsSkippedNoContent— makale üretilemedi (feed sorunu), e-posta atlandı
#   4. DailyEmailsSent       — son 24 saatte hiç e-posta gitmediyse alarm
# Hepsi SNS topic üzerinden var.alert_email adresine bildirim gönderir.
# NOT: İlk apply'dan sonra SNS'in gönderdiği onay e-postasındaki linke tıklamak gerekir.

variable "alert_email" {
  description = "CloudWatch alarmlarının gönderileceği e-posta adresi"
  type        = string
  default     = "admin@cogletta.com"
}

variable "min_daily_emails" {
  description = "24 saatte beklenen minimum e-posta sayısı (altına düşerse alarm)"
  type        = number
  default     = 1
}

locals {
  generate_articles_log_group = "/aws/lambda/${var.project_name}-${var.environment}-generate-articles"
}

# ── SNS ───────────────────────────────────────────────────────────────────────

resource "aws_sns_topic" "email_pipeline_alerts" {
  name = "${var.project_name}-${var.environment}-email-pipeline-alerts"
}

resource "aws_sns_topic_subscription" "email_pipeline_alerts" {
  topic_arn = aws_sns_topic.email_pipeline_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# ── Metric filters ────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_metric_filter" "email_send_failures" {
  name           = "${var.project_name}-${var.environment}-email-send-failures"
  log_group_name = local.generate_articles_log_group
  pattern        = "\"Failed to send email notification\""

  metric_transformation {
    name          = "EmailSendFailures"
    namespace     = "Cogletta/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "emails_skipped_no_address" {
  name           = "${var.project_name}-${var.environment}-emails-skipped-no-address"
  log_group_name = local.generate_articles_log_group
  pattern        = "\"No email found\""

  metric_transformation {
    name          = "EmailsSkippedNoAddress"
    namespace     = "Cogletta/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "emails_skipped_no_content" {
  name           = "${var.project_name}-${var.environment}-emails-skipped-no-content"
  log_group_name = local.generate_articles_log_group
  pattern        = "\"No real article to email\""

  metric_transformation {
    name          = "EmailsSkippedNoContent"
    namespace     = "Cogletta/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "daily_emails_sent" {
  name           = "${var.project_name}-${var.environment}-daily-emails-sent"
  log_group_name = local.generate_articles_log_group
  pattern        = "\"Email sent to\""

  metric_transformation {
    name          = "DailyEmailsSent"
    namespace     = "Cogletta/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

# ── Alarmlar ──────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "email_send_failures" {
  alarm_name          = "${var.project_name}-${var.environment}-email-send-failures"
  alarm_description   = "SES e-posta gönderimi hata verdi — CloudWatch loglarını kontrol et"
  namespace           = "Cogletta/${var.environment}"
  metric_name         = "EmailSendFailures"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.email_pipeline_alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "emails_skipped_no_address" {
  alarm_name          = "${var.project_name}-${var.environment}-emails-skipped-no-address"
  alarm_description   = "Bir kullanıcının profilinde email yok — e-posta atlandı. Veri sorunu olabilir."
  namespace           = "Cogletta/${var.environment}"
  metric_name         = "EmailsSkippedNoAddress"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.email_pipeline_alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "emails_skipped_no_content" {
  alarm_name          = "${var.project_name}-${var.environment}-emails-skipped-no-content"
  alarm_description   = "Kullanıcıya gönderilecek gerçek makale bulunamadı — feed sağlığını kontrol et"
  namespace           = "Cogletta/${var.environment}"
  metric_name         = "EmailsSkippedNoContent"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.email_pipeline_alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "no_daily_emails" {
  alarm_name          = "${var.project_name}-${var.environment}-no-daily-emails"
  alarm_description   = "Son 24 saatte hiç günlük e-posta gönderilmedi — pipeline tamamen durmuş olabilir"
  namespace           = "Cogletta/${var.environment}"
  metric_name         = "DailyEmailsSent"
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = var.min_daily_emails
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.email_pipeline_alerts.arn]
}
