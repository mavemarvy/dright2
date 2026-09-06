create or replace function public.run_weekly_sales_progression()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_now timestamptz := now();
  v_period_start date;
  v_period_end date := (v_now at time zone 'UTC')::date;
  v_processed integer := 0;
  v_upgrades integer := 0;
  v_downgrades integer := 0;
  v_target integer;
  v_next_target integer;
  v_streak_before integer;
  v_streak_after integer;
  v_fail_before integer;
  v_fail_after integer;
  v_weekly_sales integer;
  v_total_sales integer;
  v_level integer;
  v_next_level integer;
  v_grade text;
  v_next_grade text;
  v_action text;
  v_stage_before text;
  v_stage_after text;
  v_target_met boolean;
  v_req_total integer;
  v_downgrade_to text;
  u record;
begin
  for u in
    select id, marketer_level, advertiser_grade, weekly_sales_count, total_sales_count,
           consecutive_weeks_streak, consecutive_week_failures, marketer_status,
           advertiser_status, last_weekly_reset_at
    from public.users
    where marketer_status = 'approved' or advertiser_status = 'approved'
    for update
  loop
    if u.last_weekly_reset_at is not null and u.last_weekly_reset_at >= v_now - interval '6 days 23 hours 59 minutes' then
      continue;
    end if;
    v_period_start := coalesce((u.last_weekly_reset_at at time zone 'UTC')::date, (v_period_end - 7));
    v_weekly_sales := coalesce(u.weekly_sales_count, 0);
    v_total_sales := coalesce(u.total_sales_count, 0);
    v_streak_before := coalesce(u.consecutive_weeks_streak, 0);
    v_fail_before := coalesce(u.consecutive_week_failures, 0);
    v_streak_after := v_streak_before;
    v_fail_after := v_fail_before;
    v_action := 'none';
    v_target := 0;
    v_target_met := false;
    v_level := greatest(0, least(5, coalesce(u.marketer_level, 0)));
    v_next_level := v_level;
    v_grade := u.advertiser_grade;
    v_next_grade := v_grade;
    v_stage_before := case when coalesce(u.advertiser_status,'none') = 'approved' and u.advertiser_grade is not null then 'Advertiser ' || u.advertiser_grade else 'Marketer ' || v_level end;
    v_stage_after := v_stage_before;
    if u.advertiser_status = 'approved' and u.advertiser_grade is not null then
      if v_grade = 'A' then v_target := 500; v_downgrade_to := 'marketer';
      elsif v_grade = 'B' then v_target := 500; v_downgrade_to := 'A';
      elsif v_grade = 'C' then v_target := 600; v_downgrade_to := 'B';
      elsif v_grade = 'Pro' then v_target := 1000; v_downgrade_to := 'B';
      elsif v_grade = 'Super' then v_target := 1000; v_downgrade_to := 'Pro';
      elsif v_grade = 'Partnership' then v_target := 4000; v_downgrade_to := 'Super';
      else v_target := 0; v_downgrade_to := null;
      end if;
      v_target_met := v_weekly_sales >= v_target;
      if v_target_met then
        v_streak_after := v_streak_before + 1;
        v_fail_after := 0;
        if v_grade = 'A' then v_next_grade := 'B'; v_req_total := 5000;
        elsif v_grade = 'B' then v_next_grade := 'C'; v_req_total := 10000;
        elsif v_grade = 'C' then v_next_grade := 'Pro'; v_req_total := 50000;
        elsif v_grade = 'Pro' then v_next_grade := 'Super'; v_req_total := 50000;
        elsif v_grade = 'Super' then v_next_grade := 'Partnership'; v_req_total := 100000;
        else v_next_grade := null; v_req_total := null; end if;
        if v_next_grade is not null and v_streak_after >= 4 and v_total_sales >= v_req_total then
          v_action := 'upgrade';
          v_stage_after := 'Advertiser ' || v_next_grade;
          v_streak_after := 0;
          v_fail_after := 0;
          v_upgrades := v_upgrades + 1;
        end if;
      else
        v_streak_after := 0;
        v_fail_after := v_fail_before + 1;
        if v_fail_after >= 4 and v_downgrade_to is not null then
          v_action := 'downgrade';
          v_downgrades := v_downgrades + 1;
          v_fail_after := 0;
          if v_downgrade_to = 'marketer' then
            v_next_grade := null;
            v_next_level := 5;
            v_stage_after := 'Marketer 5';
          else
            v_next_grade := v_downgrade_to;
            v_stage_after := 'Advertiser ' || v_downgrade_to;
          end if;
        end if;
      end if;
    else
      v_target := case v_level when 0 then 10 when 1 then 50 when 2 then 200 when 3 then 250 when 4 then 350 when 5 then 500 else 0 end;
      v_target_met := v_weekly_sales >= v_target;
      if v_target_met then
        v_streak_after := v_streak_before + 1;
        v_fail_after := 0;
        if v_level < 5 then
          v_next_level := v_level + 1;
          v_next_target := case v_next_level when 1 then 50 when 2 then 200 when 3 then 250 when 4 then 350 when 5 then 500 else 0 end;
          if v_weekly_sales >= v_next_target then
            v_action := 'upgrade';
            v_upgrades := v_upgrades + 1;
          end if;
        end if;
      else
        v_streak_after := 0;
        v_fail_after := v_fail_before + 1;
      end if;
      v_stage_after := 'Marketer ' || v_next_level;
    end if;
    insert into public.sales_progression_weekly(
      user_id, period_start, period_end, stage_before, stage_after,
      marketer_level_before, marketer_level_after, advertiser_grade_before, advertiser_grade_after,
      weekly_sales, weekly_target, target_met, streak_before, streak_after,
      failure_streak_before, failure_streak_after, action, evaluated_at, metadata
    ) values (
      u.id, v_period_start, v_period_end, v_stage_before, v_stage_after,
      coalesce(u.marketer_level,0), v_next_level, u.advertiser_grade, v_next_grade,
      v_weekly_sales, v_target, v_target_met, v_streak_before, v_streak_after,
      v_fail_before, v_fail_after, v_action, v_now,
      jsonb_build_object('total_sales_count', v_total_sales)
    ) on conflict (user_id, period_start) do nothing;
    if v_action = 'upgrade' and u.advertiser_status = 'approved' and u.advertiser_grade is not null then
      update public.users set advertiser_grade=v_next_grade, consecutive_weeks_streak=v_streak_after, consecutive_week_failures=v_fail_after, weekly_sales_count=0, last_weekly_reset_at=v_now, downgraded_at=null where id=u.id;
    elsif v_action = 'downgrade' and v_downgrade_to = 'marketer' then
      update public.users set advertiser_grade=null, advertiser_status='none', marketer_status='approved', marketer_level=5, consecutive_weeks_streak=0, consecutive_week_failures=0, weekly_sales_count=0, last_weekly_reset_at=v_now, downgraded_at=v_now where id=u.id;
    elsif v_action = 'downgrade' then
      update public.users set advertiser_grade=v_next_grade, consecutive_weeks_streak=0, consecutive_week_failures=0, weekly_sales_count=0, last_weekly_reset_at=v_now, downgraded_at=v_now where id=u.id;
    else
      update public.users set marketer_level=v_next_level, consecutive_weeks_streak=v_streak_after, consecutive_week_failures=v_fail_after, weekly_sales_count=0, last_weekly_reset_at=v_now where id=u.id;
    end if;
    v_processed := v_processed + 1;
  end loop;
  return jsonb_build_object('success', true, 'processed', v_processed, 'upgrades', v_upgrades, 'downgrades', v_downgrades, 'reset_at', v_now);
end;
$function$;
revoke execute on function public.run_weekly_sales_progression() from public, anon, authenticated;
grant execute on function public.run_weekly_sales_progression() to service_role;
