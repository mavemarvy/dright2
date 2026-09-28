update public.outreach_email_templates
set headline_template = case
  when segment = 'affiliate' then 'Turn your audience into marketplace opportunities'
  else headline_template
end,
updated_at = now()
where segment = 'affiliate';

insert into public.outreach_auto_reply_rules
(name, description, enabled, priority, trigger_type, keywords, send_reply, safe_for_automatic,
 cooldown_hours, max_replies_per_conversation, reply_subject_template, reply_body_template,
 set_status, stop_processing)
select * from (values
  (
    'Affiliate commission question',
    'Acknowledges commission questions without inventing rates or terms.',
    true,25,'contains_any',
    array['affiliate commission','commission rate','commission percentage','how much commission','referral commission','affiliate payout']::text[],
    true,true,12,2,
    'Re: {{subject}}',
    'Thanks for asking about DRIGHT affiliate commissions. Commission terms can vary by offer, seller and campaign, so we do not want to give you an inaccurate rate. A DRIGHT Partnerships team member will review this thread and share the relevant affiliate details for your use case.',
    'needs_reply',true
  ),
  (
    'Already registered',
    'Acknowledges existing DRIGHT users and routes them for activation or onboarding help.',
    true,27,'contains_any',
    array['already registered','i already registered','i have registered','already signed up','i already signed up','i have an account','already have an account']::text[],
    true,true,12,1,
    'Re: {{subject}}',
    'Great — thanks for joining DRIGHT. Please reply with the role you registered for and, if relevant, the email address on your DRIGHT account. The Partnerships team will review the thread and guide you to the next activation or onboarding step.',
    'interested',true
  ),
  (
    'Country availability question',
    'Answers broad availability safely and routes country-specific limitations to a human.',
    true,28,'contains_any',
    array['what countries','which countries','available in my country','available in nigeria','available worldwide','is dright global','country supported','countries supported']::text[],
    true,true,12,2,
    'Re: {{subject}}',
    'DRIGHT is being built as a global marketplace. Some payment, verification, payout or feature availability can still differ by country, so please reply with your country and the role you are interested in. The Partnerships team will confirm the relevant setup for you.',
    'needs_reply',true
  ),
  (
    'Company legitimacy / verification question',
    'Provides a transparent response and routes verification requests to a human.',
    true,29,'contains_any',
    array['is dright legit','is dright legitimate','is this legitimate','is this real','company information','verify dright','about dright','who is dright']::text[],
    true,true,12,2,
    'Re: {{subject}}',
    'Thanks for checking before proceeding. DRIGHT is the marketplace at https://www.dright.store, and this message was sent through the official DRIGHT Partnerships email system. If you would like specific company, policy, partnership or verification information before joining, reply with what you need and the Partnerships team will provide the relevant details.',
    'needs_reply',true
  ),
  (
    'Media kit / partnership materials',
    'Acknowledges requests for decks, media kits or formal partnership materials without claiming files that may not exist.',
    true,31,'contains_any',
    array['media kit','partnership deck','pitch deck','send deck','company deck','press kit','partnership materials']::text[],
    true,true,12,1,
    'Re: {{subject}}',
    'Thanks for your interest in DRIGHT partnership materials. We will review the type of partnership you are considering and provide the most relevant information rather than sending a generic pack. Please reply with your company or audience type and what you would like to evaluate.',
    'needs_reply',true
  )
) as seed(name,description,enabled,priority,trigger_type,keywords,send_reply,safe_for_automatic,
          cooldown_hours,max_replies_per_conversation,reply_subject_template,reply_body_template,
          set_status,stop_processing)
where not exists (
  select 1 from public.outreach_auto_reply_rules r where r.name = seed.name
);
