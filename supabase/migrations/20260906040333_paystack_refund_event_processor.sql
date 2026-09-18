create or replace function public.process_paystack_refund_event(p_transaction_reference text, p_gateway_reference text, p_amount numeric, p_currency text, p_status text, p_reason text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tx paystack_transactions%rowtype;
  v_refund refund_records%rowtype;
  v_refund_status text;
  v_order_id uuid;
  v_result jsonb;
  v_amount numeric;
  v_refund_number text;
begin
  if coalesce(trim(p_transaction_reference), '') = '' then
    return jsonb_build_object('success', false, 'error', 'Missing transaction reference');
  end if;

  perform pg_advisory_xact_lock(hashtext('paystack_refund:' || p_transaction_reference));

  select * into v_tx from public.paystack_transactions where reference = p_transaction_reference for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Paystack transaction not found', 'reference', p_transaction_reference);
  end if;

  if v_tx.purpose not in ('product_purchase','escrow') or v_tx.reference_id is null then
    return jsonb_build_object('success', true, 'skipped', true, 'reason', 'Transaction is not a marketplace product payment', 'reference', p_transaction_reference);
  end if;

  v_order_id := v_tx.reference_id;
  v_amount := greatest(coalesce(p_amount, 0), 0);
  if v_amount <= 0 then
    v_amount := coalesce(v_tx.amount, 0);
  end if;

  if p_status in ('processed','reversed','completed') then
    v_refund_status := 'completed';
  elsif p_status in ('pending','processing','needs-attention','reversal_pending') then
    v_refund_status := case when p_status = 'processing' then 'processing' else 'pending' end;
  elsif p_status in ('failed','rejected') then
    v_refund_status := 'rejected';
  else
    return jsonb_build_object('success', false, 'error', 'Unsupported refund event status', 'status', p_status);
  end if;

  if p_gateway_reference is not null then
    select * into v_refund from public.refund_records where gateway_reference = p_gateway_reference for update;
  else
    select * into v_refund from public.refund_records
      where transaction_id = v_tx.id and order_id = v_order_id and refund_method = 'paystack'
        and financial_processed_at is null and status in ('pending','processing')
      order by created_at desc limit 1 for update;
  end if;

  if v_refund.id is null then
    v_refund_number := 'REF-PS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
    insert into public.refund_records (
      refund_number, transaction_id, user_id, order_id, amount, currency, reason, status,
      processed_at, completed_at, refund_method, gateway_reference, timeline, metadata
    ) values (
      v_refund_number, v_tx.id, v_tx.user_id, v_order_id, v_amount, coalesce(p_currency, v_tx.currency, 'NGN'),
      coalesce(p_reason, 'Paystack gateway refund/reversal'), v_refund_status,
      case when v_refund_status = 'completed' then now() else null end,
      case when v_refund_status = 'completed' then now() else null end,
      'paystack', p_gateway_reference,
      jsonb_build_array(jsonb_build_object('at', now(), 'status', v_refund_status, 'source', 'paystack')),
      jsonb_build_object('source','paystack','transaction_reference',p_transaction_reference,'gateway_reference',p_gateway_reference)
    ) returning * into v_refund;
  else
    update public.refund_records
    set amount = case when v_refund_status = 'completed' then greatest(v_refund.amount, v_amount) else v_refund.amount end,
        currency = coalesce(p_currency, currency),
        reason = coalesce(p_reason, reason),
        status = v_refund_status,
        processed_at = case when v_refund_status = 'completed' then coalesce(processed_at, now()) else processed_at end,
        completed_at = case when v_refund_status = 'completed' then coalesce(completed_at, now()) else completed_at end,
        updated_at = now(),
        timeline = coalesce(timeline, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now(), 'status', v_refund_status, 'source', 'paystack')),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('source','paystack','transaction_reference',p_transaction_reference,'gateway_reference',p_gateway_reference)
    where id = v_refund.id
    returning * into v_refund;
  end if;

  update public.paystack_transactions
  set status = case when v_refund_status = 'completed' then 'reversed' when v_refund_status in ('pending','processing') then 'reversal_pending' else 'success' end,
      gateway_response = coalesce(p_reason, gateway_response),
      updated_at = now()
  where id = v_tx.id;

  if v_refund_status = 'completed' then
    select public.process_marketplace_refund(v_refund.id) into v_result;
    if coalesce((v_result->>'success')::boolean, false) = false then
      return jsonb_build_object('success', false, 'refund_id', v_refund.id, 'error', coalesce(v_result->>'error','Financial reversal failed'), 'refund_result', v_result);
    end if;
    return jsonb_build_object('success', true, 'refund_id', v_refund.id, 'processed', true, 'refund_result', v_result);
  end if;

  return jsonb_build_object('success', true, 'refund_id', v_refund.id, 'processed', false, 'status', v_refund_status);
end;
$$;
revoke all on function public.process_paystack_refund_event(text,text,numeric,text,text,text) from public, anon, authenticated;
grant execute on function public.process_paystack_refund_event(text,text,numeric,text,text,text) to service_role;