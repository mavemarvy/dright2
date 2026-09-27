create table if not exists public.outreach_settings (
  singleton boolean primary key default true check (singleton = true),
  auto_reply_enabled boolean not null default true,
  safe_auto_reply_only boolean not null default true,
  max_auto_replies_per_conversation_per_day integer not null default 2
    check (max_auto_replies_per_conversation_per_day between 0 and 20),
  reply_from_name text not null default 'DRIGHT Partnerships',
  reply_from_email text not null default 'partnerships@mail.dright.store',
  reply_to_email text not null default 'partnerships@dright.store',
  inbox_email text not null default 'partnerships@dright.store',
  logo_url text not null default 'https://www.dright.store/dright-logo.webp',
  website_url text not null default 'https://www.dright.store',
  signup_url text not null default 'https://www.dright.store/sign-up',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

insert into public.outreach_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.outreach_conversations (
  id uuid primary key default gen_random_uuid(),
  prospect_email text not null,
  prospect_name text,
  company_name text,
  role_segment text not null default 'general',
  status text not null default 'new'
    check (status in ('new','interested','needs_reply','follow_up','not_interested','unsubscribed','archived')),
  source text not null default 'email',
  subject text,
  assigned_admin_id uuid references public.users(id) on delete set null,
  unread_count integer not null default 0 check (unread_count >= 0),
  auto_reply_enabled boolean not null default true,
  auto_replies_sent integer not null default 0 check (auto_replies_sent >= 0),
  last_auto_reply_at timestamptz,
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists outreach_conversations_email_unique
  on public.outreach_conversations (lower(prospect_email));
create index if not exists outreach_conversations_status_last_idx
  on public.outreach_conversations (status, last_message_at desc nulls last);

create table if not exists public.outreach_auto_reply_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  enabled boolean not null default true,
  priority integer not null default 100,
  trigger_type text not null default 'contains_any'
    check (trigger_type in ('contains_any','contains_all','regex','always')),
  keywords text[] not null default '{}'::text[],
  segment text,
  send_reply boolean not null default true,
  safe_for_automatic boolean not null default true,
  cooldown_hours integer not null default 24 check (cooldown_hours between 0 and 720),
  max_replies_per_conversation integer not null default 1
    check (max_replies_per_conversation between 0 and 20),
  reply_subject_template text,
  reply_body_template text,
  set_status text
    check (set_status is null or set_status in ('new','interested','needs_reply','follow_up','not_interested','unsubscribed','archived')),
  stop_processing boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_auto_reply_rules_priority_idx
  on public.outreach_auto_reply_rules (enabled, priority asc);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.outreach_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  provider text not null default 'resend',
  provider_message_id text,
  internet_message_id text,
  in_reply_to text,
  from_email text not null,
  to_email text not null,
  subject text,
  text_body text,
  html_body text,
  auto_generated boolean not null default false,
  auto_reply_rule_id uuid references public.outreach_auto_reply_rules(id) on delete set null,
  delivery_status text not null default 'received',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists outreach_messages_provider_message_unique
  on public.outreach_messages(provider, provider_message_id)
  where provider_message_id is not null;
create index if not exists outreach_messages_conversation_created_idx
  on public.outreach_messages(conversation_id, created_at asc);

create table if not exists public.outreach_email_templates (
  id uuid primary key default gen_random_uuid(),
  segment text not null unique,
  name text not null,
  enabled boolean not null default true,
  subject_template text not null,
  preheader_template text,
  headline_template text not null,
  body_template text not null,
  benefits jsonb not null default '[]'::jsonb,
  cta_label text not null default 'Join DRIGHT',
  cta_url text not null default 'https://www.dright.store/sign-up',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

create table if not exists public.outreach_webhook_config (
  singleton boolean primary key default true check (singleton = true),
  resend_webhook_id text,
  signing_secret text,
  endpoint_url text,
  enabled boolean not null default false,
  configured_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.outreach_webhook_config (singleton)
values (true)
on conflict (singleton) do nothing;

insert into public.outreach_auto_reply_rules
(name, description, enabled, priority, trigger_type, keywords, send_reply, safe_for_automatic,
 cooldown_hours, max_replies_per_conversation, reply_subject_template, reply_body_template,
 set_status, stop_processing)
select * from (values
  ('Unsubscribe / stop contact',
   'Suppresses the address immediately and does not send another marketing reply.',
   true,5,'contains_any',
   array['unsubscribe','remove me','stop emailing','stop email','do not email','don''t email','no more emails']::text[],
   false,true,0,0,null::text,null::text,'unsubscribed',true),
  ('Not interested',
   'Marks a clear rejection without generating another message.',
   true,10,'contains_any',
   array['not interested','no thanks','no thank you','not for me','we will pass','we''ll pass']::text[],
   false,true,0,0,null::text,null::text,'not_interested',true),
  ('Interested / wants details',
   'Replies to clear positive intent with a concise next step and signup link.',
   true,20,'contains_any',
   array['i am interested','i''m interested','we are interested','we''re interested','tell me more','sounds good','how do i join','how can i join','send more information','send more info']::text[],
   true,true,12,2,
   'Re: {{subject}}',
   'Thanks for your interest in DRIGHT. We would be glad to have you explore the opportunity. You can create your account here: https://www.dright.store/sign-up

If you reply with the role you are most interested in — affiliate/promoter, seller/vendor, employer, freelancer, course creator, task creator, advertiser, or buyer — our Partnerships team can guide you to the right setup.',
   'interested',true),
  ('Pricing / fees question',
   'Acknowledges a pricing or fee question without inventing role-specific terms.',
   true,30,'contains_any',
   array['how much','pricing','price','fee','fees','cost','commission rate','commission percentage']::text[],
   true,true,12,2,
   'Re: {{subject}}',
   'Thanks for asking. DRIGHT has different terms depending on the role and activity, so we do not want to give you the wrong figure. Please reply with the role you are considering (for example seller, affiliate/promoter, employer, freelancer, advertiser, or course creator), and the Partnerships team will send the relevant details.',
   'needs_reply',true),
  ('Call / meeting request',
   'Acknowledges requests to talk and routes the thread for human follow-up.',
   true,40,'contains_any',
   array['book a call','schedule a call','schedule a meeting','book a meeting','can we talk','can we call','meeting time','call me']::text[],
   true,true,12,1,
   'Re: {{subject}}',
   'Absolutely. Thanks for wanting to speak with DRIGHT Partnerships. A team member will review this thread and follow up with the appropriate next step for a call or meeting.',
   'needs_reply',true)
) as seed(name,description,enabled,priority,trigger_type,keywords,send_reply,safe_for_automatic,
          cooldown_hours,max_replies_per_conversation,reply_subject_template,reply_body_template,
          set_status,stop_processing)
where not exists (
  select 1 from public.outreach_auto_reply_rules r where r.name = seed.name
);

insert into public.outreach_email_templates
(segment, name, subject_template, preheader_template, headline_template, body_template, benefits, cta_label, cta_url)
values
('affiliate','Affiliate & Promoter','A partnership opportunity with DRIGHT','Promote marketplace opportunities and grow with DRIGHT.','Turn your audience into marketplace opportunity','DRIGHT is expanding its affiliate, creator and referral network. We are inviting selected promoters to introduce relevant audiences to products, services and marketplace opportunities on DRIGHT.','["Affiliate and referral opportunities","Marketplace offers to promote","A direct partnership channel with DRIGHT"]'::jsonb,'Join DRIGHT','https://www.dright.store/sign-up'),
('seller','Seller & Vendor','Expand your business with DRIGHT','Create a seller presence and reach new marketplace audiences.','Bring your products and services to DRIGHT','DRIGHT is onboarding sellers and vendors for its global marketplace. Build a marketplace presence, publish relevant listings and connect with buyers and promotion opportunities.','["Create a seller presence","List products and services","Access marketplace promotion opportunities"]'::jsonb,'Start on DRIGHT','https://www.dright.store/sign-up'),
('employer','Employer','A new hiring channel on DRIGHT','Publish opportunities and connect with talent.','Reach talent through DRIGHT','DRIGHT supports employers, job opportunities, freelancers and service providers. We are inviting organizations to join the employer side of the marketplace.','["Publish job opportunities","Reach freelancers and service providers","Build an employer presence"]'::jsonb,'Join as an Employer','https://www.dright.store/sign-up'),
('freelancer','Freelancer & Service Provider','Offer your skills on DRIGHT','Create your professional presence and discover opportunities.','Put your skills in front of new opportunities','DRIGHT is growing its freelancer and service-provider marketplace. Create your profile, offer services and connect with work and task opportunities.','["Create a professional profile","Offer services","Discover work and task opportunities"]'::jsonb,'Join DRIGHT','https://www.dright.store/sign-up'),
('course_creator','Course Creator','Bring your courses to DRIGHT','Connect training with learners and marketplace opportunities.','Teach, grow and connect on DRIGHT','DRIGHT is inviting educators and training organizations to establish a course presence alongside its wider marketplace, jobs and creator ecosystem.','["Publish learning offers","Reach learners","Connect training with marketplace opportunities"]'::jsonb,'Join DRIGHT','https://www.dright.store/sign-up'),
('task_creator','Task Creator','Create earning opportunities on DRIGHT','Bring structured tasks and earning opportunities to the marketplace.','Create opportunities people can act on','DRIGHT is expanding its task marketplace and is inviting organizations and creators that can publish legitimate, clearly defined earning opportunities.','["Create structured tasks","Reach eligible participants","Manage opportunities through DRIGHT"]'::jsonb,'Join DRIGHT','https://www.dright.store/sign-up'),
('advertiser','Advertiser','Explore advertising opportunities with DRIGHT','Connect campaigns with relevant marketplace audiences.','Grow with DRIGHT advertising opportunities','DRIGHT is building its marketplace advertising and promotion ecosystem. We are speaking with advertisers and partners interested in reaching commerce, creator, job and service audiences.','["Marketplace-focused audiences","Campaign and promotion opportunities","Direct partnership support"]'::jsonb,'Explore DRIGHT','https://www.dright.store'),
('general','General Partnership','Explore a partnership with DRIGHT','DRIGHT is expanding its marketplace partnerships.','Let’s build marketplace opportunity together','DRIGHT is a global marketplace connecting commerce, services, jobs, creators, affiliates and earning opportunities. We are expanding our partner network and would like to explore where your organization fits.','["Multiple marketplace roles","Global growth focus","Direct partnership channel"]'::jsonb,'Explore DRIGHT','https://www.dright.store')
on conflict (segment) do nothing;

alter table public.outreach_settings enable row level security;
alter table public.outreach_conversations enable row level security;
alter table public.outreach_auto_reply_rules enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.outreach_email_templates enable row level security;
alter table public.outreach_webhook_config enable row level security;

drop policy if exists "active admins manage outreach settings" on public.outreach_settings;
create policy "active admins manage outreach settings"
on public.outreach_settings for all
using (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'))
with check (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'));

drop policy if exists "active admins manage outreach conversations" on public.outreach_conversations;
create policy "active admins manage outreach conversations"
on public.outreach_conversations for all
using (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'))
with check (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'));

drop policy if exists "active admins manage outreach rules" on public.outreach_auto_reply_rules;
create policy "active admins manage outreach rules"
on public.outreach_auto_reply_rules for all
using (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'))
with check (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'));

drop policy if exists "active admins manage outreach messages" on public.outreach_messages;
create policy "active admins manage outreach messages"
on public.outreach_messages for all
using (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'))
with check (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'));

drop policy if exists "active admins manage outreach templates" on public.outreach_email_templates;
create policy "active admins manage outreach templates"
on public.outreach_email_templates for all
using (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'))
with check (exists (select 1 from public.users u where u.id=auth.uid() and u.is_admin=true and u.admin_status='active'));

revoke all on table public.outreach_webhook_config from anon, authenticated;

update public.email_delivery_settings
set marketing_reply_to='partnerships@dright.store', updated_at=now()
where singleton=true;
