-- 0005: Supabase Realtime publication for reaction updates.
-- analysis_reactions changes → `realtime.reaction_updates` channel,
-- broadcast so any client subscribed to `analysis-reactions` receives
-- `reaction-updated` events without polling.

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'analysis_reactions') then
    alter publication supabase_realtime add table public.analysis_reactions;
  end if;
end
$$;

-- 0006: pgmq message-analysis queue (used when AI_PROVIDER_QUEUE=pgmq).
-- The app falls back to the analysis_jobs table when this queue is absent,
-- so the migration is optional but recommended for production reliability.
create extension if not exists pgmq;

select case
  when not exists (select 1 from pgmq.a_messages limit 0) then
    pgmq.create('message_analysis')
  end;