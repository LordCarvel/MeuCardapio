package com.meucardapio.dev.vinis.meuCardapio.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappConversation;

public interface WhatsappConversationRepository extends JpaRepository<WhatsappConversation, UUID> {
    List<WhatsappConversation> findByStoreIdOrderByLastMessageAtDesc(UUID storeId);
    Optional<WhatsappConversation> findByStoreIdAndRemoteJid(UUID storeId, String remoteJid);
}
