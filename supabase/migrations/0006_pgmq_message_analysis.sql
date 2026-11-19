-- 0006: pgmq message-analysis queue plumbing for the production driver.
-- The table `analysis_jobs` remains the source of truth for job state
-- (retry/backoff/janitor). pgmq is the fast wake-up signal.
-- All functions are executable ONLY by service_role — no client exposure.

create or replace function public.message_analysis_send(payload jsonb)
returns bigint
language sql security definer as $$
  select pgmq.send('message_analysis', payload);
$$;

create or replace function public.message_analysis_read(vt integer, qty integer)
returns setof pgmq.message_record
language sql security definer as $$
  select * from pgmq.read('message_analysis', vt, qty);
$$;

create or replace function public.message_analysis_delete(msg_id bigint)
returns boolean
language sql security definer as $$
  select pgmq.delete('message_analysis', msg_id);
$$;

create or replace function public.message_analysis_archive(msg_id bigint)
returns boolean
language sql security definer as $$
  select pgmq.archive('message_analysis', msg_id);
$$;

revoke all on function public.message_analysis_send(jsonb) from public, anon, authenticated;
grant execute on function public.message_analysis_send(jsonb) to service_role;

revoke all on function public.message_analysis_read(integer, integer) from public, anon, authenticated;
grant execute on function public.message_analysis_read(integer, integer) to service_role;

revoke all on function public.message_analysis_delete(bigint) from public, anon, authenticated;
grant execute on function public.message_analysis_delete(bigint) to service_role;

revoke all on function public.message_analysis_archive(bigint) from public, anon, authenticated;
grant execute on function public.message_analysis_archive(bigint) to service_role;

alter table public.analysis_jobs add column if not exists pgmq_msg_id bigint;
