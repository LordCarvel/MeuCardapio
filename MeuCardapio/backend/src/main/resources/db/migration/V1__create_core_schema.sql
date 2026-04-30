create table stores (
    id uuid primary key,
    trade_name varchar(120) not null,
    owner_name varchar(120) not null,
    email varchar(160) not null,
    phone varchar(40) not null,
    tax_id varchar(40) not null,
    category varchar(80) not null,
    street varchar(160),
    number varchar(30),
    district varchar(100),
    city_name varchar(100),
    state varchar(2),
    schedule varchar(160),
    minimum_order numeric(12,2) not null default 0,
    delivery_radius_km numeric(8,2) not null default 5,
    created_at timestamp not null
);

create table store_users (
    id uuid primary key,
    store_id uuid not null references stores(id) on delete cascade,
    name varchar(120) not null,
    email varchar(160) not null unique,
    password_hash varchar(120) not null,
    role varchar(30) not null,
    created_at timestamp not null
);

create table categories (
    id uuid primary key,
    store_id uuid not null references stores(id) on delete cascade,
    name varchar(100) not null,
    active boolean not null default true,
    created_at timestamp not null
);

create table products (
    id uuid primary key,
    store_id uuid not null references stores(id) on delete cascade,
    category_id uuid references categories(id) on delete set null,
    name varchar(120) not null,
    description varchar(500),
    price numeric(12,2) not null,
    stock integer not null default 0,
    active boolean not null default true,
    created_at timestamp not null
);

create table orders (
    id uuid primary key,
    store_id uuid not null references stores(id) on delete cascade,
    customer_name varchar(120) not null,
    customer_phone varchar(40),
    fulfillment varchar(30) not null,
    status varchar(30) not null,
    subtotal numeric(12,2) not null,
    delivery_fee numeric(12,2) not null,
    total numeric(12,2) not null,
    payment varchar(40) not null,
    note varchar(500),
    created_at timestamp not null,
    updated_at timestamp not null
);

create table order_items (
    id uuid primary key,
    order_id uuid not null references orders(id) on delete cascade,
    product_name varchar(120) not null,
    quantity integer not null,
    unit_price numeric(12,2) not null,
    total_price numeric(12,2) not null
);

create table app_logs (
    id uuid primary key,
    store_id uuid references stores(id) on delete set null,
    level varchar(20) not null,
    area varchar(80) not null,
    message varchar(500) not null,
    created_at timestamp not null
);

create index idx_categories_store on categories(store_id);
create index idx_products_store on products(store_id);
create index idx_orders_store_created on orders(store_id, created_at desc);
create index idx_logs_created on app_logs(created_at desc);
