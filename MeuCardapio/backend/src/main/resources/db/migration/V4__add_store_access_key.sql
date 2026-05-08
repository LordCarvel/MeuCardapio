alter table stores add column if not exists access_key varchar(120);

create index if not exists idx_stores_access_key on stores(access_key);
