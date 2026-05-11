alter table whatsapp_conversations add column avatar_url varchar(1000);

delete from whatsapp_conversations
where coalesce(last_message, '') = ''
  and unread_count = 0
  and not exists (
    select 1
    from whatsapp_messages
    where whatsapp_messages.conversation_id = whatsapp_conversations.id
  );
