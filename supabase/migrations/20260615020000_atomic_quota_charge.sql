create or replace function public.charge_upload_analysis(
  p_user_id uuid,
  p_upload_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage_day date;
  v_usage_month text;
  v_plan_code text := 'free';
  v_daily_limit integer := 3;
  v_monthly_limit integer := 90;
  v_daily_used integer := 0;
  v_monthly_used integer := 0;
  v_free_daily_used integer := 0;
  v_credit_balance integer := 0;
  v_charge_source text := 'none';
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 4815162342));

  v_usage_day := (p_now at time zone 'Asia/Shanghai')::date;
  v_usage_month := to_char((p_now at time zone 'Asia/Shanghai')::date, 'YYYY-MM');

  select up.plan_code
    into v_plan_code
  from public.user_plans up
  where up.user_id = p_user_id
    and up.status = 'active'
    and (up.current_period_end is null or up.current_period_end >= p_now)
  order by up.created_at desc
  limit 1;

  v_plan_code := coalesce(v_plan_code, 'free');
  if v_plan_code = 'balanced' then
    v_daily_limit := 10;
    v_monthly_limit := 300;
  elsif v_plan_code = 'pro' then
    v_daily_limit := 100;
    v_monthly_limit := 3000;
  else
    v_plan_code := 'free';
    v_daily_limit := 3;
    v_monthly_limit := 90;
  end if;

  select coalesce(sum(units), 0)::integer
    into v_daily_used
  from public.usage_events
  where user_id = p_user_id
    and status = 'charged'
    and usage_day = v_usage_day;

  select coalesce(sum(units), 0)::integer
    into v_monthly_used
  from public.usage_events
  where user_id = p_user_id
    and status = 'charged'
    and usage_month = v_usage_month;

  select coalesce(sum(units), 0)::integer
    into v_free_daily_used
  from public.usage_events
  where user_id = p_user_id
    and status = 'charged'
    and usage_day = v_usage_day
    and charge_source = 'free';

  select greatest(coalesce(sum(amount), 0)::integer, 0)
    into v_credit_balance
  from public.credit_transactions
  where user_id = p_user_id;

  if v_plan_code <> 'free' and v_daily_used < v_daily_limit and v_monthly_used < v_monthly_limit then
    v_charge_source := 'subscription';
  elsif v_credit_balance > 0 then
    v_charge_source := 'credits';
  elsif v_free_daily_used < 3 then
    v_charge_source := 'free';
  else
    raise exception '今日或本月额度已用尽，请订阅或充值按量次数。'
      using errcode = 'P0001';
  end if;

  insert into public.usage_events (
    user_id,
    upload_id,
    event_type,
    status,
    charge_source,
    units,
    usage_day,
    usage_month,
    metadata
  )
  values (
    p_user_id,
    p_upload_id,
    'upload_analysis',
    'charged',
    v_charge_source,
    1,
    v_usage_day,
    v_usage_month,
    coalesce(p_metadata, '{}'::jsonb)
  );

  if v_charge_source = 'credits' then
    insert into public.credit_transactions (user_id, amount, reason, provider, metadata)
    values (
      p_user_id,
      -1,
      'upload_analysis',
      'manual',
      jsonb_build_object('uploadId', p_upload_id) || coalesce(p_metadata, '{}'::jsonb)
    );
  end if;

  v_daily_used := v_daily_used + 1;
  v_monthly_used := v_monthly_used + 1;
  if v_charge_source = 'free' then
    v_free_daily_used := v_free_daily_used + 1;
  elsif v_charge_source = 'credits' then
    v_credit_balance := greatest(v_credit_balance - 1, 0);
  end if;

  return jsonb_build_object(
    'planCode', v_plan_code,
    'dailyLimit', v_daily_limit,
    'monthlyLimit', v_monthly_limit,
    'dailyUsed', v_daily_used,
    'monthlyUsed', v_monthly_used,
    'dailyRemaining', greatest(v_daily_limit - v_daily_used, 0),
    'monthlyRemaining', greatest(v_monthly_limit - v_monthly_used, 0),
    'freeDailyLimit', 3,
    'freeDailyUsed', v_free_daily_used,
    'freeDailyRemaining', greatest(3 - v_free_daily_used, 0),
    'creditBalance', v_credit_balance,
    'usageDay', v_usage_day::text,
    'usageMonth', v_usage_month,
    'nextChargeSource', case
      when v_plan_code <> 'free' and v_daily_used < v_daily_limit and v_monthly_used < v_monthly_limit then 'subscription'
      when v_credit_balance > 0 then 'credits'
      when v_free_daily_used < 3 then 'free'
      else 'none'
    end,
    'canAnalyze', (
      (v_plan_code <> 'free' and v_daily_used < v_daily_limit and v_monthly_used < v_monthly_limit)
      or v_credit_balance > 0
      or v_free_daily_used < 3
    )
  );
end;
$$;

grant execute on function public.charge_upload_analysis(uuid, uuid, jsonb, timestamptz) to service_role;
