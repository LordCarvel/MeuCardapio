alter table if exists public.auth_codes enable row level security;

revoke all on table public.auth_codes from anon;
revoke all on table public.auth_codes from authenticated;
