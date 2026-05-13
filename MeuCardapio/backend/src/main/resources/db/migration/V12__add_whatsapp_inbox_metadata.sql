alter table whatsapp_conversations add column assigned_agent varchar(80);
alter table whatsapp_conversations add column label varchar(80);
alter table whatsapp_conversations add column favorite boolean not null default false;
alter table whatsapp_conversations add column pinned boolean not null default false;
alter table whatsapp_conversations add column pinned_note varchar(1000);
