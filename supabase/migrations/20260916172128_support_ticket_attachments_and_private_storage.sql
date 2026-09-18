create table if not exists public.support_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  reply_id uuid references public.ticket_replies(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  uploaded_by uuid references public.users(id) on delete set null,
  uploaded_by_role text not null default 'user' check (uploaded_by_role in ('user','admin','system')),
  channel text not null default 'web' check (channel in ('web','in_app','ai','email','sms','whatsapp','telegram','phone')),
  direction text not null default 'inbound' check (direction in ('inbound','outbound')),
  media_type text not null check (media_type in ('image','video','audio','document')),
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size >= 0 and file_size <= 20971520),
  storage_bucket text not null default 'support-attachments',
  storage_path text not null,
  telegram_file_id text,
  telegram_file_unique_id text,
  external_message_id text,
  caption text,
  status text not null default 'stored' check (status in ('stored','sent','failed','rejected')),
  error_code text,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint support_attachments_storage_object_unique unique (storage_bucket, storage_path)
);

create index if not exists support_attachments_ticket_created_idx on public.support_attachments(ticket_id, created_at);
create index if not exists support_attachments_reply_idx on public.support_attachments(reply_id) where reply_id is not null;
create index if not exists support_attachments_user_idx on public.support_attachments(user_id, created_at desc);
create index if not exists support_attachments_telegram_file_idx on public.support_attachments(telegram_file_unique_id) where telegram_file_unique_id is not null;

alter table public.support_attachments enable row level security;

drop policy if exists support_attachments_read on public.support_attachments;
create policy support_attachments_read
on public.support_attachments for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_support_staff((select auth.uid()))
);

drop policy if exists support_attachments_insert on public.support_attachments;
create policy support_attachments_insert
on public.support_attachments for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1
    from public.support_tickets t
    where t.id = ticket_id
      and t.user_id = user_id
      and (
        (uploaded_by_role = 'user' and t.user_id = (select auth.uid()))
        or (uploaded_by_role = 'admin' and public.is_support_staff((select auth.uid())))
      )
  )
);

drop policy if exists support_attachments_update on public.support_attachments;
create policy support_attachments_update
on public.support_attachments for update
to authenticated
using (public.is_support_staff((select auth.uid())))
with check (public.is_support_staff((select auth.uid())));

drop policy if exists support_attachments_delete on public.support_attachments;
create policy support_attachments_delete
on public.support_attachments for delete
to authenticated
using (public.is_support_staff((select auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  20971520,
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'video/mp4','video/webm','video/quicktime',
    'audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/webm','audio/mp4',
    'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/rtf','application/zip','application/x-zip-compressed','text/plain','text/csv'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists support_attachment_storage_read on storage.objects;
create policy support_attachment_storage_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'support-attachments'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_support_staff((select auth.uid()))
  )
);

drop policy if exists support_attachment_storage_insert on storage.objects;
create policy support_attachment_storage_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'support-attachments'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.is_support_staff((select auth.uid()))
  )
);

drop policy if exists support_attachment_storage_delete on storage.objects;
create policy support_attachment_storage_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'support-attachments'
  and public.is_support_staff((select auth.uid()))
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_attachments'
  ) then
    alter publication supabase_realtime add table public.support_attachments;
  end if;
end $$;