alter table if exists public.flyway_schema_history enable row level security;
alter table if exists public.stores enable row level security;
alter table if exists public.store_users enable row level security;
alter table if exists public.categories enable row level security;
alter table if exists public.products enable row level security;
alter table if exists public.orders enable row level security;
alter table if exists public.order_items enable row level security;
alter table if exists public.app_logs enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
