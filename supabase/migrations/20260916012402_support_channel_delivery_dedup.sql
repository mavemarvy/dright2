create unique index if not exists support_channel_delivery_logs_external_message_unique
  on public.support_channel_delivery_logs(channel, direction, external_message_id)
  where external_message_id is not null;