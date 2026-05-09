alter table stores add column if not exists service_fee numeric(12,2) not null default 0;
alter table stores add column if not exists lat varchar(40);
alter table stores add column if not exists lng varchar(40);
alter table stores add column if not exists map_label varchar(500);
alter table stores add column if not exists verified_at varchar(40);
