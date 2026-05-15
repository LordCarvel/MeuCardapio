alter table orders add column order_number integer;

create unique index idx_orders_store_order_number on orders(store_id, order_number);
