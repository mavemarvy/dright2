begin;

create or replace function public.get_dright_starter_signup_eligibility(
  p_reference text,
  p_email text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
declare
  v_reference text:=trim(coalesce(p_reference,''));
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_purchase public.dright_starter_purchases%rowtype;
begin
  if v_reference='' or v_reference !~ '^DRG_STARTER_' then
    return jsonb_build_object(
      'eligible',false,
      'reason','invalid_reference',
      'message','A verified DRIGHT Starter payment is required before Starter signup.'
    );
  end if;

  if v_email='' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object(
      'eligible',false,
      'reason','invalid_email',
      'message','Enter the same email address used for the DRIGHT Starter payment.'
    );
  end if;

  select * into v_purchase
  from public.dright_starter_purchases
  where payment_reference=v_reference
  limit 1;

  if not found then
    return jsonb_build_object(
      'eligible',false,
      'reason','not_found',
      'message','This DRIGHT Starter payment reference was not found.'
    );
  end if;

  if v_purchase.payment_status<>'success'
     or v_purchase.processed_at is null
     or v_purchase.paid_at is null then
    return jsonb_build_object(
      'eligible',false,
      'reason','payment_not_verified',
      'message','Payment has not been verified yet. Complete payment and wait for DRIGHT to confirm it before signing up.'
    );
  end if;

  if lower(v_purchase.buyer_email)<>v_email then
    return jsonb_build_object(
      'eligible',false,
      'reason','email_mismatch',
      'message','Use the same email address that was used to pay for DRIGHT Starter Access.'
    );
  end if;

  if v_purchase.buyer_user_id is not null
     or v_purchase.claimed_at is not null
     or v_purchase.status='claimed' then
    return jsonb_build_object(
      'eligible',false,
      'reason','already_claimed',
      'message','This DRIGHT Starter purchase has already been claimed. Sign in with the account that claimed it.'
    );
  end if;

  return jsonb_build_object(
    'eligible',true,
    'reason','verified',
    'reference',v_purchase.payment_reference,
    'purchase_id',v_purchase.id,
    'included_trial_days',v_purchase.included_trial_days,
    'message','Payment verified. Starter signup is unlocked for this purchase email.'
  );
end;
$$;

revoke all on function public.get_dright_starter_signup_eligibility(text,text) from public;
grant execute on function public.get_dright_starter_signup_eligibility(text,text) to anon,authenticated,service_role;

comment on function public.get_dright_starter_signup_eligibility(text,text) is
  'Public-safe eligibility check for the paid DRIGHT Starter signup funnel. Returns no purchase email or financial details.';

commit;