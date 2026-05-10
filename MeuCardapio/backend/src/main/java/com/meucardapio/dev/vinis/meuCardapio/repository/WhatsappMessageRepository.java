package com.meucardapio.dev.vinis.meuCardapio.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappConversation;
import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappMessage;

public interface WhatsappMessageRepository extends JpaRepository<WhatsappMessage, UUID> {
    List<WhatsappMessage> findByConversationOrderByCreatedAtAsc(WhatsappConversation conversation);
    Optional<WhatsappMessage> findFirstByStoreIdAndProviderMessageId(UUID storeId, String providerMessageId);
}
