# ─── E-posta pipeline izleme ──────────────────────────────────────────────────
# Sabah e-postalarının sessizce kesilmesini engelleyen alarm katmanı:
#   1. EmailSendFailures     — SES gönderimi hata verdi (1 saat içinde ≥1)
#   2. EmailsSkippedNoAddr   — kullanıcının email'i yok, e-posta atlandı
#   3. EmailsSkippedNoContent— gönderilecek gerçek makale yok (feed sorunu
#                              veya kategori havuzu üretilememiş), atlandı
#   4. DailyEmailsSent       — son 24 saatte hiç e-posta gitmediyse alarm
# Hepsi SNS topic üzerinden var.alert_email adresine bildirim gönderir.
# NOT: İlk apply'dan sonra SNS'in gönderdiği onay e-postasındaki linke tıklamak gerekir.
#
# E-posta artık İKİ Lambda'dan çıkar: generate-articles (Pro + legacy free) ve
# deliver-daily (havuzlu free). Metric filter'lar for_each ile her iki log
# group'u da kapsar; aynı metrik adına/namespace'ine yazdıkları için alarmlar
# tek kalır. Tek log group izlenseydi deliver-daily'ye taşınan gönderimler
# alarmları yanlış tetikler ya da hatalarını görünmez kılardı.

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
  # E-posta gönderen Lambda'ların log group'ları — resource referansı,
  # apply sırasında log group'un filter'dan önce oluşmasını garanti eder.
  email_sender_log_groups = {
    generate_articles = aws_cloudwatch_log_group.generate_articles.name
    deliver_daily     = aws_cloudwatch_log_group.deliver_daily.name
  }
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
  for_each       = local.email_sender_log_groups
  name           = "${var.project_name}-${var.environment}-email-send-failures-${each.key}"
  log_group_name = each.value
  pattern        = "\"Failed to send email notification\""

  metric_transformation {
    name          = "EmailSendFailures"
    namespace     = "Cogletta/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "emails_skipped_no_address" {
  for_each       = local.email_sender_log_groups
  name           = "${var.project_name}-${var.environment}-emails-skipped-no-address-${each.key}"
  log_group_name = each.value
  pattern        = "\"No email found\""

  metric_transformation {
    name          = "EmailsSkippedNoAddress"
    namespace     = "Cogletta/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "emails_skipped_no_content" {
  for_each       = local.email_sender_log_groups
  name           = "${var.project_name}-${var.environment}-emails-skipped-no-content-${each.key}"
  log_group_name = each.value
  pattern        = "\"No real article to email\""

  metric_transformation {
    name          = "EmailsSkippedNoContent"
    namespace     = "Cogletta/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "daily_emails_sent" {
  for_each       = local.email_sender_log_groups
  name           = "${var.project_name}-${var.environment}-daily-emails-sent-${each.key}"
  log_group_name = each.value
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
  alarm_description   = "Kullanıcıya gönderilecek gerçek makale bulunamadı — feed sağlığını ve kategori havuzunu kontrol et"
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
