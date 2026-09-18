with cat as (
  select id from public.help_categories where slug='getting-started' and is_deleted=false limit 1
)
insert into public.help_articles(category_id,title,slug,content,summary,tags,sort_order,status,is_published,is_deleted,publish_at)
select cat.id,
       v.title,
       v.slug,
       v.content,
       v.summary,
       v.tags,
       v.sort_order,
       'published',
       true,
       false,
       now()
from cat
cross join (values
  (
    'How DRIGHT Support Works',
    'how-dright-support-works',
    '<p>DRIGHT Support uses one ticket conversation for each support issue. Sign in, open the Help Center, and use <strong>My Support</strong> to create a ticket. Choose the relevant department and priority, describe the issue clearly, and submit it.</p><p>Your ticket receives a DRIGHT reference number. You can reopen the conversation from My Support and reply in the same thread. Support agents receive notifications when a new ticket or customer reply needs attention, and you receive a notification when an agent replies.</p><p>If a case needs additional review, support can escalate it. Resolved tickets remain in your support history, and closed tickets are read-only.</p>',
    'Create, track, and reply to DRIGHT support tickets from one conversation.',
    array['support','ticket','customer care','help','agent']::text[],
    1
  ),
  (
    'Using DRIGHT AI Support',
    'using-dright-ai-support',
    '<p>DRIGHT AI Support can answer support questions using published DRIGHT Help Center information and limited authenticated account records relevant to support, such as recent orders, payment status, withdrawal status, and support-ticket status.</p><p>AI Support does not approve refunds, withdrawals, identity verification, disputes, account restrictions, or other privileged actions. It also does not invent a result when the required information is unavailable.</p><p>When a request needs manual investigation, or when you ask to speak with a human, AI Support can create or update a support ticket and notify the DRIGHT support team.</p>',
    'What AI Support can check, what it cannot approve, and when it escalates to a human.',
    array['ai support','support','human agent','escalation','orders','payments']::text[],
    2
  ),
  (
    'Understanding Support Ticket Statuses',
    'understanding-support-ticket-statuses',
    '<p><strong>Open</strong> means the ticket has been created or reopened. <strong>Waiting for Support</strong> means your latest message needs a support response. <strong>Waiting for You</strong> means support replied and is waiting for your response. <strong>Escalated</strong> means the case needs additional review. <strong>Resolved</strong> means support marked the issue as resolved. <strong>Closed</strong> means the conversation has been closed and is read-only.</p><p>If you reply to a resolved ticket, DRIGHT reopens the conversation so support can review the new message.</p>',
    'A guide to Open, Waiting for Support, Waiting for You, Escalated, Resolved, and Closed.',
    array['support','ticket status','resolved','closed','escalated']::text[],
    3
  )
) as v(title,slug,content,summary,tags,sort_order)
on conflict (slug) do update set
  category_id=excluded.category_id,
  title=excluded.title,
  content=excluded.content,
  summary=excluded.summary,
  tags=excluded.tags,
  sort_order=excluded.sort_order,
  status='published',
  is_published=true,
  is_deleted=false,
  publish_at=coalesce(public.help_articles.publish_at, now()),
  updated_at=now();

with cat as (
  select id from public.help_categories where slug='getting-started' and is_deleted=false limit 1
), seed(question,answer,tags,sort_order) as (
  values
    ('How do I open a support ticket?', '<p>Sign in to DRIGHT, open the Help Center, go to <strong>My Support</strong>, choose <strong>New Ticket</strong>, select a department and priority, then submit the subject and details. Your ticket will appear in Ticket History with a DRIGHT reference number.</p>', array['support','ticket','help']::text[], 1),
    ('Can DRIGHT AI Support see my account data?', '<p>When you are signed in, AI Support can use limited authenticated DRIGHT records that are relevant to the support question, including recent order, payment, withdrawal, and support-ticket status. It is not instructed to expose secrets or sensitive payment/account details.</p>', array['ai support','privacy','account data']::text[], 2),
    ('How do I ask for a human support agent?', '<p>Tell DRIGHT AI Support that you want to speak with a human or create a ticket directly in My Support. AI Support can escalate requests that need manual investigation into the same support-ticket system used by DRIGHT support agents.</p>', array['human agent','support','escalation']::text[], 3),
    ('What happens after DRIGHT Support replies?', '<p>You receive a DRIGHT notification and the ticket moves to <strong>Waiting for You</strong>. Open the ticket in My Support to read the response and continue the same conversation.</p>', array['support reply','notification','ticket']::text[], 4),
    ('What do the support ticket statuses mean?', '<p>Open means the case is active. Waiting for Support means your message needs a support response. Waiting for You means support is waiting for your response. Escalated means additional review is required. Resolved means the issue was marked resolved. Closed means the conversation is read-only.</p>', array['ticket status','support','resolved','closed']::text[], 5)
)
insert into public.faq_items(category_id,question,answer,tags,sort_order,status,is_published,is_deleted)
select cat.id, seed.question, seed.answer, seed.tags, seed.sort_order, 'published', true, false
from cat cross join seed
where not exists (
  select 1 from public.faq_items f where lower(f.question)=lower(seed.question) and f.is_deleted=false
);
