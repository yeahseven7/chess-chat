-- 0002: email-based credentials on profiles (idempotent upgrade for databases
-- created with the pre-email 0001 migration). Fresh databases created with the
-- updated 0001 already include the email column; this migration is a no-op there.
alter table public.profiles add column if not exists email text;
create unique index if not exists profiles_email_unique_idx on public.profiles (email) where email is not null;
