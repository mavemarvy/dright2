drop index if exists public.support_channel_delivery_logs_external_message_unique;
create unique index if not exists support_channel_delivery_logs_external_message_unique
  on public.support_channel_delivery_logs(channel, direction, external_chat_id, external_message_id)
  where external_chat_id is not null and external_message_id is not null;