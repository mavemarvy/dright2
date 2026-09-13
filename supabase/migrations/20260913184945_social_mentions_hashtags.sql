-- DRIGHT2 social mentions + hashtags
-- Hashtags are created and counted only from successfully persisted social posts.
-- Mention suggestions are scoped to active users, community membership, or chat participants.

create table if not exists public.hashtags (
  id uuid primary key default gen_random_uuid(),
  tag text not null,
  usage_count bigint not null default 0 check (usage_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hashtags_tag_format check (tag ~ '^[[:alnum:]_]{1,64}$'),
  constraint hashtags_tag_lowercase check (tag = lower(tag)),
  constraint hashtags_tag_unique unique (tag)
);

create table if not exists public.social_post_hashtags (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  hashtag_id uuid not null references public.hashtags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, hashtag_id)
);

create table if not exists public.social_post_mentions (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  mentioned_user_id uuid not null references public.users(id) on delete cascade,
  username_snapshot text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, mentioned_user_id)
);

create table if not exists public.social_comment_mentions (
  comment_id uuid not null references public.social_post_comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.users(id) on delete cascade,
  username_snapshot text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, mentioned_user_id)
);

create table if not exists public.chat_message_mentions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  mentioned_user_id uuid not null references public.users(id) on delete cascade,
  username_snapshot text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, mentioned_user_id)
);

create index if not exists hashtags_usage_idx on public.hashtags (usage_count desc, tag);
create index if not exists hashtags_tag_prefix_idx on public.hashtags (tag text_pattern_ops);
create index if not exists social_post_hashtags_hashtag_idx on public.social_post_hashtags (hashtag_id, post_id);
create index if not exists social_post_mentions_user_idx on public.social_post_mentions (mentioned_user_id, created_at desc);
create index if not exists social_comment_mentions_user_idx on public.social_comment_mentions (mentioned_user_id, created_at desc);
create index if not exists chat_message_mentions_user_idx on public.chat_message_mentions (mentioned_user_id, created_at desc);
create index if not exists users_username_lower_idx on public.users (lower(username));

alter table public.hashtags enable row level security;
alter table public.social_post_hashtags enable row level security;
alter table public.social_post_mentions enable row level security;
alter table public.social_comment_mentions enable row level security;
alter table public.chat_message_mentions enable row level security;

drop policy if exists hashtags_authenticated_read on public.hashtags;
create policy hashtags_authenticated_read on public.hashtags
  for select to authenticated using (true);

grant select on public.hashtags to authenticated;
revoke insert, update, delete on public.hashtags from anon, authenticated;
revoke all on public.social_post_hashtags from anon, authenticated;
revoke all on public.social_post_mentions from anon, authenticated;
revoke all on public.social_comment_mentions from anon, authenticated;
revoke all on public.chat_message_mentions from anon, authenticated;

create or replace function public.extract_social_hashtags(p_text text)
returns table(tag text)
language sql
immutable
set search_path = public
as $$
  select distinct lower(m[2]) as tag
  from regexp_matches(coalesce(p_text, ''), '(^|[^[:alnum:]_])#([[:alnum:]_]{1,64})', 'g') as r(m)
  where length(m[2]) between 1 and 64;
$$;

create or replace function public.extract_social_mentions(p_text text)
returns table(username text)
language sql
immutable
set search_path = public
as $$
  select distinct lower(m[2]) as username
  from regexp_matches(coalesce(p_text, ''), '(^|[^[:alnum:]_.-])@([[:alnum:]_.-]{1,64})', 'g') as r(m)
  where length(m[2]) between 1 and 64;
$$;

create or replace function public.bump_hashtag_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.hashtags
    set usage_count = usage_count + 1,
        updated_at = now()
    where id = new.hashtag_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.hashtags
    set usage_count = greatest(usage_count - 1, 0),
        updated_at = now()
    where id = old.hashtag_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists social_post_hashtag_usage_insert on public.social_post_hashtags;
create trigger social_post_hashtag_usage_insert
  after insert on public.social_post_hashtags
  for each row execute function public.bump_hashtag_usage();

drop trigger if exists social_post_hashtag_usage_delete on public.social_post_hashtags;
create trigger social_post_hashtag_usage_delete
  after delete on public.social_post_hashtags
  for each row execute function public.bump_hashtag_usage();

create or replace function public.sync_social_post_tokens()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_active, true) is not true or new.moderation_status <> 'approved' then
    delete from public.social_post_hashtags where post_id = new.id;
    delete from public.social_post_mentions where post_id = new.id;
    return new;
  end if;

  insert into public.hashtags(tag)
  select x.tag
  from public.extract_social_hashtags(new.body) x
  on conflict (tag) do nothing;

  delete from public.social_post_hashtags sph
  using public.hashtags h
  where sph.post_id = new.id
    and h.id = sph.hashtag_id
    and not exists (
      select 1
      from public.extract_social_hashtags(new.body) x
      where x.tag = h.tag
    );

  insert into public.social_post_hashtags(post_id, hashtag_id)
  select new.id, h.id
  from public.extract_social_hashtags(new.body) x
  join public.hashtags h on h.tag = x.tag
  on conflict do nothing;

  delete from public.social_post_mentions spm
  where spm.post_id = new.id
    and not exists (
      select 1
      from public.extract_social_mentions(new.body) x
      join public.users u
        on u.id = spm.mentioned_user_id
       and lower(u.username) = x.username
       and u.account_status = 'ACTIVE'
      where new.community_id is null
         or exists (
           select 1
           from public.community_members cm
           where cm.community_id = new.community_id
             and cm.user_id = u.id
             and cm.state = 'active'
         )
    );

  with candidates as (
    select distinct u.id as mentioned_user_id, u.username
    from public.extract_social_mentions(new.body) x
    join public.users u
      on lower(u.username) = x.username
     and u.account_status = 'ACTIVE'
    where new.community_id is null
       or exists (
         select 1
         from public.community_members cm
         where cm.community_id = new.community_id
           and cm.user_id = u.id
           and cm.state = 'active'
       )
  ), inserted as (
    insert into public.social_post_mentions(post_id, mentioned_user_id, username_snapshot)
    select new.id, c.mentioned_user_id, c.username
    from candidates c
    on conflict do nothing
    returning mentioned_user_id
  )
  insert into public.social_notifications(user_id, actor_id, notification_type, entity_type, entity_id, metadata)
  select i.mentioned_user_id,
         new.author_id,
         'social_mention',
         'social_post',
         new.id,
         jsonb_strip_nulls(jsonb_build_object('post_id', new.id, 'community_id', new.community_id))
  from inserted i
  where i.mentioned_user_id <> new.author_id;

  return new;
end;
$$;

drop trigger if exists sync_social_post_tokens_trigger on public.social_posts;
create trigger sync_social_post_tokens_trigger
  after insert or update of body, community_id, is_active, moderation_status
  on public.social_posts
  for each row execute function public.sync_social_post_tokens();

create or replace function public.sync_social_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
begin
  select p.community_id into v_community_id
  from public.social_posts p
  where p.id = new.post_id;

  if new.status <> 'visible' then
    delete from public.social_comment_mentions where comment_id = new.id;
    return new;
  end if;

  delete from public.social_comment_mentions scm
  where scm.comment_id = new.id
    and not exists (
      select 1
      from public.extract_social_mentions(new.body) x
      join public.users u
        on u.id = scm.mentioned_user_id
       and lower(u.username) = x.username
       and u.account_status = 'ACTIVE'
      where v_community_id is null
         or exists (
           select 1 from public.community_members cm
           where cm.community_id = v_community_id
             and cm.user_id = u.id
             and cm.state = 'active'
         )
    );

  with candidates as (
    select distinct u.id as mentioned_user_id, u.username
    from public.extract_social_mentions(new.body) x
    join public.users u
      on lower(u.username) = x.username
     and u.account_status = 'ACTIVE'
    where v_community_id is null
       or exists (
         select 1 from public.community_members cm
         where cm.community_id = v_community_id
           and cm.user_id = u.id
           and cm.state = 'active'
       )
  ), inserted as (
    insert into public.social_comment_mentions(comment_id, mentioned_user_id, username_snapshot)
    select new.id, c.mentioned_user_id, c.username
    from candidates c
    on conflict do nothing
    returning mentioned_user_id
  )
  insert into public.social_notifications(user_id, actor_id, notification_type, entity_type, entity_id, metadata)
  select i.mentioned_user_id,
         new.user_id,
         'social_comment_mention',
         'social_post_comment',
         new.id,
         jsonb_build_object('post_id', new.post_id, 'comment_id', new.id)
  from inserted i
  where i.mentioned_user_id <> new.user_id;

  return new;
end;
$$;

drop trigger if exists sync_social_comment_mentions_trigger on public.social_post_comments;
create trigger sync_social_comment_mentions_trigger
  after insert or update of body, status
  on public.social_post_comments
  for each row execute function public.sync_social_comment_mentions();

create or replace function public.sync_chat_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_community_id uuid;
  v_customer_id uuid;
  v_seller_id uuid;
  v_initiator_id uuid;
begin
  select c.community_id, c.customer_id, c.seller_id, c.initiator_id
  into v_community_id, v_customer_id, v_seller_id, v_initiator_id
  from public.chat_conversations c
  where c.id = new.conversation_id;

  if coalesce(new.is_deleted, false) or coalesce(new.deleted_for_everyone, false) then
    delete from public.chat_message_mentions where message_id = new.id;
    return new;
  end if;

  delete from public.chat_message_mentions cmm
  where cmm.message_id = new.id
    and not exists (
      select 1
      from public.extract_social_mentions(new.body) x
      join public.users u
        on u.id = cmm.mentioned_user_id
       and lower(u.username) = x.username
       and u.account_status = 'ACTIVE'
      where (
        v_community_id is not null
        and exists (
          select 1 from public.community_members cm
          where cm.community_id = v_community_id
            and cm.user_id = u.id
            and cm.state = 'active'
        )
      ) or (
        v_community_id is null
        and (u.id = v_customer_id or u.id = v_seller_id or u.id = v_initiator_id)
      )
    );

  with candidates as (
    select distinct u.id as mentioned_user_id, u.username
    from public.extract_social_mentions(new.body) x
    join public.users u
      on lower(u.username) = x.username
     and u.account_status = 'ACTIVE'
    where (
      v_community_id is not null
      and exists (
        select 1 from public.community_members cm
        where cm.community_id = v_community_id
          and cm.user_id = u.id
          and cm.state = 'active'
      )
    ) or (
      v_community_id is null
      and (u.id = v_customer_id or u.id = v_seller_id or u.id = v_initiator_id)
    )
  ), inserted as (
    insert into public.chat_message_mentions(message_id, mentioned_user_id, username_snapshot)
    select new.id, c.mentioned_user_id, c.username
    from candidates c
    on conflict do nothing
    returning mentioned_user_id
  )
  insert into public.social_notifications(user_id, actor_id, notification_type, entity_type, entity_id, metadata)
  select i.mentioned_user_id,
         new.sender_id,
         'chat_mention',
         'chat_message',
         new.id,
         jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id)
  from inserted i
  where i.mentioned_user_id <> new.sender_id;

  return new;
end;
$$;

drop trigger if exists sync_chat_message_mentions_trigger on public.chat_messages;
create trigger sync_chat_message_mentions_trigger
  after insert or update of body, is_deleted, deleted_for_everyone
  on public.chat_messages
  for each row execute function public.sync_chat_message_mentions();

create or replace function public.search_hashtags(
  p_query text default '',
  p_limit integer default 10
)
returns table(tag text, usage_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select lower(regexp_replace(trim(coalesce(p_query, '')), '^#+', '')) as term,
           greatest(1, least(coalesce(p_limit, 10), 20)) as lim
  )
  select h.tag, h.usage_count
  from public.hashtags h, q
  where q.term = '' or h.tag like q.term || '%'
  order by (h.tag = q.term) desc, h.usage_count desc, h.tag asc
  limit (select lim from q);
$$;

create or replace function public.search_social_mentions(
  p_query text default '',
  p_community_id uuid default null,
  p_conversation_id uuid default null,
  p_limit integer default 10
)
returns table(
  user_id uuid,
  username text,
  full_name text,
  avatar_url text,
  is_verified boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_query text := lower(regexp_replace(trim(coalesce(p_query, '')), '^@+', ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 20));
  v_community_id uuid;
  v_customer_id uuid;
  v_seller_id uuid;
  v_initiator_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_conversation_id is not null then
    select c.community_id, c.customer_id, c.seller_id, c.initiator_id
    into v_community_id, v_customer_id, v_seller_id, v_initiator_id
    from public.chat_conversations c
    where c.id = p_conversation_id;

    if not found then
      raise exception 'Conversation not found';
    end if;

    if v_community_id is not null then
      if not public.community_is_active_member(v_community_id, v_uid) then
        raise exception 'Active community membership required';
      end if;

      return query
      select u.id, u.username, u.full_name, u.avatar_url, coalesce(u.is_verified, false)
      from public.community_members cm
      join public.users u on u.id = cm.user_id
      where cm.community_id = v_community_id
        and cm.state = 'active'
        and u.account_status = 'ACTIVE'
        and u.id <> v_uid
        and (v_query = '' or lower(u.username) like v_query || '%')
      order by (lower(u.username) = v_query) desc, lower(u.username), u.id
      limit v_limit;
      return;
    end if;

    if not (v_uid = v_customer_id or v_uid = v_seller_id or v_uid = v_initiator_id) then
      raise exception 'Conversation access denied';
    end if;

    return query
    select u.id, u.username, u.full_name, u.avatar_url, coalesce(u.is_verified, false)
    from public.users u
    where u.account_status = 'ACTIVE'
      and u.id <> v_uid
      and (u.id = v_customer_id or u.id = v_seller_id or u.id = v_initiator_id)
      and (v_query = '' or lower(u.username) like v_query || '%')
    order by (lower(u.username) = v_query) desc, lower(u.username), u.id
    limit v_limit;
    return;
  end if;

  if p_community_id is not null then
    if not public.community_is_active_member(p_community_id, v_uid) then
      raise exception 'Active community membership required';
    end if;

    return query
    select u.id, u.username, u.full_name, u.avatar_url, coalesce(u.is_verified, false)
    from public.community_members cm
    join public.users u on u.id = cm.user_id
    where cm.community_id = p_community_id
      and cm.state = 'active'
      and u.account_status = 'ACTIVE'
      and u.id <> v_uid
      and (v_query = '' or lower(u.username) like v_query || '%')
    order by (lower(u.username) = v_query) desc, lower(u.username), u.id
    limit v_limit;
    return;
  end if;

  return query
  select u.id, u.username, u.full_name, u.avatar_url, coalesce(u.is_verified, false)
  from public.users u
  where u.account_status = 'ACTIVE'
    and u.id <> v_uid
    and (v_query = '' or lower(u.username) like v_query || '%')
  order by (lower(u.username) = v_query) desc, lower(u.username), u.id
  limit v_limit;
end;
$$;

revoke all on function public.search_hashtags(text, integer) from public, anon;
revoke all on function public.search_social_mentions(text, uuid, uuid, integer) from public, anon;
grant execute on function public.search_hashtags(text, integer) to authenticated;
grant execute on function public.search_social_mentions(text, uuid, uuid, integer) to authenticated;

-- Backfill hashtags from already-published social/community/news posts. This does not
-- fabricate counters: each mapping is one real existing post use, and duplicate tags
-- inside one post count once.
insert into public.hashtags(tag)
select distinct x.tag
from public.social_posts p
cross join lateral public.extract_social_hashtags(p.body) x
where coalesce(p.is_active, true) is true
  and p.moderation_status = 'approved'
on conflict (tag) do nothing;

insert into public.social_post_hashtags(post_id, hashtag_id)
select distinct p.id, h.id
from public.social_posts p
cross join lateral public.extract_social_hashtags(p.body) x
join public.hashtags h on h.tag = x.tag
where coalesce(p.is_active, true) is true
  and p.moderation_status = 'approved'
on conflict do nothing;

-- Backfill resolvable existing post mentions without creating historical notifications.
insert into public.social_post_mentions(post_id, mentioned_user_id, username_snapshot)
select distinct p.id, u.id, u.username
from public.social_posts p
cross join lateral public.extract_social_mentions(p.body) x
join public.users u
  on lower(u.username) = x.username
 and u.account_status = 'ACTIVE'
where coalesce(p.is_active, true) is true
  and p.moderation_status = 'approved'
  and (
    p.community_id is null
    or exists (
      select 1 from public.community_members cm
      where cm.community_id = p.community_id
        and cm.user_id = u.id
        and cm.state = 'active'
    )
  )
on conflict do nothing;
