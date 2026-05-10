create table whatsapp_integrations (
    store_id uuid primary key references stores(id) on delete cascade,
    session_id varchar(80),
    session_name varchar(120),
    phone_number varchar(40),
    personal_access_token text,
    api_key text,
    webhook_secret varchar(160),
    webhook_url varchar(500),
    status varchar(40),
    updated_at timestamp not null
);

create table whatsapp_conversations (
    id uuid primary key,
    store_id uuid not null references stores(id) on delete cascade,
    remote_jid varchar(160) not null,
    contact_name varchar(160),
    phone varchar(60),
    last_message varchar(1000),
    last_message_at timestamp not null,
    unread_count integer not null default 0
);

create unique index idx_whatsapp_conversations_store_remote on whatsapp_conversations(store_id, remote_jid);
create index idx_whatsapp_conversations_store_updated on whatsapp_conversations(store_id, last_message_at desc);

create table whatsapp_messages (
    id uuid primary key,
    store_id uuid not null references stores(id) on delete cascade,
    conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
    provider_message_id varchar(160),
    remote_jid varchar(160) not null,
    from_me boolean not null default false,
    body text,
    status varchar(40),
    payload text,
    created_at timestamp not null
);

create index idx_whatsapp_messages_conversation_created on whatsapp_messages(conversation_id, created_at asc);
create index idx_whatsapp_messages_provider on whatsapp_messages(store_id, provider_message_id);
