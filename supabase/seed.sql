-- Development fixtures for a LOCAL Supabase instance (supabase db reset).
-- Synthetic identities only — do NOT run against a hosted production project.
-- Passwords are managed by Supabase Auth; these fixture profiles carry no password_hash.

insert into public.profiles (id, username, display_name, bio, avatar_color, created_at, last_seen_at) values
  ('11111111-1111-1111-1111-111111111111', 'aisha', 'Aisha Bekova', 'Designer. Probably reading.', '#81b64c', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'timur', 'Timur Rakhimov', 'Backend engineer. Coffee first.', '#4a9ae8', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'dana',  'Dana Sarsenova', 'Product manager.',           '#e8a33d', now(), now())
on conflict (id) do nothing;

insert into public.friendships (id, requester_id, addressee_id, status, created_at, updated_at) values
  ('44444444-4444-4444-4444-444444444441', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'accepted', now(), now()),
  ('44444444-4444-4444-4444-444444444442', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'accepted', now(), now()),
  ('44444444-4444-4444-4444-444444444443', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'pending',  now(), now())
on conflict (id) do nothing;

insert into public.conversations (id, type, name, avatar_color, created_by, direct_key, created_at, updated_at) values
  ('55555555-5555-5555-5555-555555555551', 'direct', null, '#4a6b8a', '11111111-1111-1111-1111-111111111111', 'dir:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222', now(), now()),
  ('55555555-5555-5555-5555-555555555552', 'group',  'Study Group', '#81b64c', '11111111-1111-1111-1111-111111111111', null, now(), now())
on conflict (id) do nothing;

insert into public.conversation_members (conversation_id, user_id, role, joined_at, last_read_at) values
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'owner',  now(), now()),
  ('55555555-5555-5555-5555-555555555551', '22222222-2222-2222-2222-222222222222', 'member', now(), now()),
  ('55555555-5555-5555-5555-555555555552', '11111111-1111-1111-1111-111111111111', 'owner',  now(), now()),
  ('55555555-5555-5555-5555-555555555552', '22222222-2222-2222-2222-222222222222', 'member', now(), now()),
  ('55555555-5555-5555-5555-555555555552', '33333333-3333-3333-3333-333333333333', 'member', now(), now())
on conflict (conversation_id, user_id) do nothing;

insert into public.messages (id, conversation_id, sender_id, content, analysis_status, created_at) values
  ('66666666-6666-6666-6666-666666666661', '55555555-5555-5555-5555-555555555551', '22222222-2222-2222-2222-222222222222', 'Hello, how are you?',            'completed', now() - interval '60 minutes'),
  ('66666666-6666-6666-6666-666666666662', '55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'Thank you for helping me!',      'completed', now() - interval '55 minutes'),
  ('66666666-6666-6666-6666-666666666663', '55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'That''s genuinely interesting.', 'completed', now() - interval '50 minutes'),
  ('66666666-6666-6666-6666-666666666664', '55555555-5555-5555-5555-555555555551', '22222222-2222-2222-2222-222222222222', '2 + 2 = 9',                     'completed', now() - interval '45 minutes'),
  ('66666666-6666-6666-6666-666666666665', '55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', 'nice weather today',            'completed', now() - interval '40 minutes'),
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555551', '22222222-2222-2222-2222-222222222222', 'What the hell is this?',        'completed', now() - interval '35 minutes')
on conflict (id) do nothing;

insert into public.analysis_reactions (message_id, category, confidence, provider, model, reason, language, created_at, updated_at) values
  ('66666666-6666-6666-6666-666666666661', 'excellent', 0.90, 'seed', 'seed-fixtures', 'Friendly greeting.',              'en', now(), now()),
  ('66666666-6666-6666-6666-666666666662', 'best',      0.94, 'seed', 'seed-fixtures', 'Supportive or appreciative.',     'en', now(), now()),
  ('66666666-6666-6666-6666-666666666663', 'great',     0.88, 'seed', 'seed-fixtures', 'Interesting or noteworthy.',      'en', now(), now()),
  ('66666666-6666-6666-6666-666666666664', 'mistake',   0.95, 'seed', 'seed-fixtures', 'Arithmetic is incorrect.',        'en', now(), now()),
  ('66666666-6666-6666-6666-666666666665', 'miss',      0.85, 'seed', 'seed-fixtures', 'Off-topic reply to a question.',  'en', now(), now()),
  ('66666666-6666-6666-6666-666666666666', 'blunder',   0.96, 'seed', 'seed-fixtures', 'Contains profanity.',             'en', now(), now())
on conflict (message_id) do nothing;

insert into public.messages (id, conversation_id, sender_id, content, analysis_status, created_at) values
  ('66666666-6666-6666-6666-666666666667', '55555555-5555-5555-5555-555555555552', '11111111-1111-1111-1111-111111111111', 'Welcome to the study group!', 'completed', now() - interval '30 minutes')
on conflict (id) do nothing;

insert into public.analysis_reactions (message_id, category, confidence, provider, model, reason, language, created_at, updated_at) values
  ('66666666-6666-6666-6666-666666666667', 'excellent', 0.90, 'seed', 'seed-fixtures', 'Friendly greeting.', 'en', now(), now())
on conflict (message_id) do nothing;
