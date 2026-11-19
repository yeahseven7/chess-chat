-- ═══════════════════════════════════════════════════════════════
-- ChessChat — initial schema
-- Mirrors src/lib/server/schema.ts (embedded local driver).
-- Apply with: supabase db push  (or paste in the SQL editor)
-- ═══════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── profiles ──────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text unique,
  display_name text not null,
  bio text not null default '',
  avatar_color text not null default '#81b64c',
  avatar_url text,
  password_hash text,               -- local mode only; Supabase Auth manages passwords
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,24}$')
);
create unique index if not exists profiles_email_unique_idx on public.profiles (email) where email is not null;

-- ── friendships ───────────────────────────────────────────────
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, addressee_id)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);

-- ── blocks / reports ──────────────────────────────────────────
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

-- ── conversations / members ───────────────────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct','group')),
  name text,
  avatar_color text not null default '#4a6b8a',
  created_by uuid references public.profiles(id) on delete set null,
  direct_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists members_user_idx on public.conversation_members (user_id);

-- ── messages ──────────────────────────────────────────────────
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  reply_to_id uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  analysis_status text not null default 'pending'
    check (analysis_status in ('pending','processing','completed','failed')),
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_created_idx on public.messages (conversation_id, created_at);
create index if not exists messages_sender_idx on public.messages (sender_id);
create index if not exists messages_deleted_idx on public.messages (deleted_at);

-- ── attachments ───────────────────────────────────────────────
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('image','file')),
  name text not null,
  mime_type text not null,
  size integer not null check (size >= 0),
  path text not null,
  created_at timestamptz not null default now()
);
create index if not exists attachments_message_idx on public.attachments (message_id);

-- ── AI analysis reactions (the six categories) ────────────────
create table if not exists public.analysis_reactions (
  message_id uuid primary key references public.messages(id) on delete cascade,
  conversation_id uuid not null,
  category text not null check (category in ('great','best','excellent','mistake','miss','blunder')),
  confidence real not null check (confidence >= 0 and confidence <= 1),
  provider text not null,
  model text not null,
  reason text not null default '',
  language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reactions_category_idx on public.analysis_reactions (category);
create index if not exists reactions_provider_idx on public.analysis_reactions (provider);
create index if not exists reactions_conversation_idx on public.analysis_reactions (conversation_id);

-- ── manual emoji reactions ────────────────────────────────────
create table if not exists public.emoji_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- ── analysis jobs queue ───────────────────────────────────────
create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 4,
  run_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Duplicate-job prevention: at most one active job per message.
create unique index if not exists jobs_active_message_idx
  on public.analysis_jobs (message_id) where status in ('pending','processing');
create index if not exists jobs_queue_idx on public.analysis_jobs (status, run_at);

-- ── notifications ─────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null default '',
  conversation_id uuid references public.conversations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- ── user settings ─────────────────────────────────────────────
create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  settings_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── reaction_statistics (maintained read cache) ───────────────
-- Statistics are computed live by the app; this table is an optional,
-- trigger-maintained cache for cheap reporting queries / dashboards.
create table if not exists public.reaction_statistics (
  scope text not null check (scope in ('conversation','user','global')),
  scope_id uuid not null default '00000000-0000-0000-0000-000000000000',   -- conversation/user id; sentinel for global
  category text not null check (category in ('great','best','excellent','mistake','miss','blunder')),
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope, scope_id, category)
);

create or replace function public.refresh_global_reaction_statistics()
returns void language sql security definer as $$
  insert into public.reaction_statistics (scope, scope_id, category, count, updated_at)
  select 'global', '00000000-0000-0000-0000-000000000000', category, count(*), now()
  from public.analysis_reactions
  group by category
  on conflict (scope, scope_id, category)
  do update set count = excluded.count, updated_at = excluded.updated_at;
$$;

create or replace function public.touch_reaction_statistics()
returns trigger language plpgsql security definer as $$
begin
  perform public.refresh_global_reaction_statistics();
  return null;
end;
$$;

drop trigger if exists analysis_reactions_stats_trigger on public.analysis_reactions;
create trigger analysis_reactions_stats_trigger
after insert or update or delete on public.analysis_reactions
for each statement execute function public.touch_reaction_statistics();

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security — defense in depth. The Next.js server uses the
-- service role key (which bypasses RLS) after performing its own
-- authorization checks; these policies protect any direct PostgREST access.
-- ═══════════════════════════════════════════════════════════════
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.analysis_reactions enable row level security;
alter table public.emoji_reactions enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.notifications enable row level security;
alter table public.user_settings enable row level security;
alter table public.reaction_statistics enable row level security;

-- profiles: readable by signed-in users; writable only by owner
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- friendships: visible to participants only; writable by requester/addressee
create policy friendships_select on public.friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
create policy friendships_insert on public.friendships for insert to authenticated
  with check (auth.uid() = requester_id);
create policy friendships_update on public.friendships for update to authenticated
  using (auth.uid() = addressee_id or auth.uid() = requester_id);
create policy friendships_delete on public.friendships for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- blocks/reports: only the owner can see and manage them
create policy blocks_select on public.blocks for select to authenticated using (auth.uid() = blocker_id);
create policy blocks_insert on public.blocks for insert to authenticated with check (auth.uid() = blocker_id);
create policy blocks_delete on public.blocks for delete to authenticated using (auth.uid() = blocker_id);
create policy reports_select on public.reports for select to authenticated using (auth.uid() = reporter_id);
create policy reports_insert on public.reports for insert to authenticated with check (auth.uid() = reporter_id);

-- helper: is the current user a member of a conversation?
create or replace function public.is_conversation_member(conv uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conv and m.user_id = auth.uid()
  );
$$;

-- conversations: members only
create policy conversations_select on public.conversations for select to authenticated
  using (public.is_conversation_member(id));
create policy conversations_insert on public.conversations for insert to authenticated
  with check (auth.uid() = created_by);
create policy conversations_update on public.conversations for update to authenticated
  using (public.is_conversation_member(id));

-- members: visible to fellow members; join-only-self for insert
create policy members_select on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy members_insert on public.conversation_members for insert to authenticated
  with check (auth.uid() = user_id);
create policy members_delete on public.conversation_members for delete to authenticated
  using (auth.uid() = user_id or public.is_conversation_member(conversation_id));

-- messages: read members; insert self as sender; modify only own messages
create policy messages_select on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (auth.uid() = sender_id and public.is_conversation_member(conversation_id));
create policy messages_update on public.messages for update to authenticated
  using (auth.uid() = sender_id) with check (auth.uid() = sender_id);
create policy messages_delete on public.messages for delete to authenticated
  using (auth.uid() = sender_id);

-- attachments: read conversation members; upload by self
create policy attachments_select on public.attachments for select to authenticated using (
  uploader_id = auth.uid()
  or exists (
    select 1 from public.messages m
    where m.id = attachments.message_id and public.is_conversation_member(m.conversation_id)
  )
);
create policy attachments_insert on public.attachments for insert to authenticated
  with check (auth.uid() = uploader_id);

-- reactions: read conversation members; NO direct client inserts
create policy reactions_select on public.analysis_reactions for select to authenticated using (
  exists (
    select 1 from public.messages m
    where m.id = analysis_reactions.message_id and public.is_conversation_member(m.conversation_id)
  )
);

-- emoji reactions: members only
create policy emoji_select on public.emoji_reactions for select to authenticated using (
  exists (
    select 1 from public.messages m
    where m.id = emoji_reactions.message_id and public.is_conversation_member(m.conversation_id)
  )
);
create policy emoji_modify on public.emoji_reactions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- analysis jobs: never readable/writable from the client (server-side only)
create policy jobs_deny_all on public.analysis_jobs for select to authenticated using (false);

-- notifications: only the recipient
create policy notifications_select on public.notifications for select to authenticated
  using (auth.uid() = user_id);
create policy notifications_update on public.notifications for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy notifications_delete on public.notifications for delete to authenticated
  using (auth.uid() = user_id);

-- settings: only the owner
create policy settings_select on public.user_settings for select to authenticated using (auth.uid() = user_id);
create policy settings_modify on public.user_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- statistics cache: readable by all signed-in users, writable only by trigger/server
create policy stats_select on public.reaction_statistics for select to authenticated using (true);
