update orders
set source_order_id = null
where trim(coalesce(source_order_id, '')) = '';
