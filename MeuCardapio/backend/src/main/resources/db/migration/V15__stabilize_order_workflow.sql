alter table orders add column source_order_id varchar(80);

create unique index idx_orders_store_source_order on orders(store_id, source_order_id);
create index idx_orders_store_status_created on orders(store_id, status, created_at desc);
