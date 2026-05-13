package com.meucardapio.dev.vinis.meuCardapio.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappConversation;

public interface WhatsappConversationRepository extends JpaRepository<WhatsappConversation, UUID> {
    List<WhatsappConversation> findByStoreIdOrderByLastMessageAtDesc(UUID storeId);
    @Query(value = """
            select c.* from whatsapp_conversations c
            where c.store_id = :storeId
            order by
              case
                when coalesce(c.last_message, '') <> ''
                  or c.unread_count > 0
                  or exists (select 1 from whatsapp_messages m where m.conversation_id = c.id)
                then 0
                else 1
              end,
              c.last_message_at desc,
              lower(coalesce(c.contact_name, c.phone, c.remote_jid))
            """, nativeQuery = true)
    List<WhatsappConversation> findVisibleByStoreIdOrderByLastMessageAtDesc(@Param("storeId") UUID storeId);
    Optional<WhatsappConversation> findByStoreIdAndRemoteJid(UUID storeId, String remoteJid);
    Optional<WhatsappConversation> findFirstByStoreIdAndPhone(UUID storeId, String phone);
    @Modifying
    @Query(value = """
            delete from whatsapp_conversations
            where store_id = :storeId
              and coalesce(last_message, '') = ''
              and unread_count = 0
              and not exists (
                select 1 from whatsapp_messages
                where whatsapp_messages.conversation_id = whatsapp_conversations.id
              )
            """, nativeQuery = true)
    int deleteEmptyWithoutMessagesByStoreId(@Param("storeId") UUID storeId);
}
