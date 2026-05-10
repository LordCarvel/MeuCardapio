alter table whatsapp_integrations add column bot_enabled boolean not null default true;
alter table whatsapp_integrations add column bot_welcome text;
alter table whatsapp_integrations add column bot_fallback text;
alter table whatsapp_integrations add column bot_menu_url varchar(500);
alter table whatsapp_integrations add column bot_handoff_keywords varchar(500);

alter table whatsapp_conversations add column bot_paused_until timestamp;
alter table whatsapp_conversations add column bot_paused_indefinitely boolean not null default false;
alter table whatsapp_conversations add column bot_last_auto_reply_at timestamp;
alter table whatsapp_conversations add column bot_status varchar(40) not null default 'active';
