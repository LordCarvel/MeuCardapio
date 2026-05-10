package com.meucardapio.dev.vinis.meuCardapio.domain;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "whatsapp_messages")
public class WhatsappMessage {
    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID storeId;
    @ManyToOne
    @JoinColumn(name = "conversation_id", nullable = false)
    private WhatsappConversation conversation;
    @Column(length = 160)
    private String providerMessageId;
    @Column(nullable = false, length = 160)
    private String remoteJid;
    @Column(nullable = false)
    private boolean fromMe;
    @Column(columnDefinition = "text")
    private String body;
    @Column(length = 40)
    private String status;
    @Column(columnDefinition = "text")
    private String payload;
    @Column(nullable = false)
    private LocalDateTime createdAt;

    protected WhatsappMessage() {
    }

    public WhatsappMessage(UUID id, UUID storeId, WhatsappConversation conversation, String remoteJid, boolean fromMe) {
        this.id = id;
        this.storeId = storeId;
        this.conversation = conversation;
        this.remoteJid = remoteJid;
        this.fromMe = fromMe;
        this.createdAt = LocalDateTime.now();
        this.status = fromMe ? "sent" : "received";
    }

    public UUID getId() { return id; }
    public UUID getStoreId() { return storeId; }
    public WhatsappConversation getConversation() { return conversation; }
    public String getProviderMessageId() { return providerMessageId; }
    public void setProviderMessageId(String providerMessageId) { this.providerMessageId = providerMessageId; }
    public String getRemoteJid() { return remoteJid; }
    public boolean isFromMe() { return fromMe; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getPayload() { return payload; }
    public void setPayload(String payload) { this.payload = payload; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
