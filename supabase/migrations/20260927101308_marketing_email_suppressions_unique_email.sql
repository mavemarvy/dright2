create unique index if not exists marketing_email_suppressions_recipient_email_idx
  on public.marketing_email_suppressions (recipient_email);
