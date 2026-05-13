package com.meucardapio.dev.vinis.meuCardapio.domain;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "whatsapp_conversations")
public class WhatsappConversation {
    @Id
    private UUID id;
    @Column(nullable = false)
    private UUID storeId;
    @Column(nullable = false, length = 160)
    private String remoteJid;
    @Column(length = 160)
    private String contactName;
    @Column(length = 60)
    private String phone;
    @Column(length = 1000)
    private String avatarUrl;
    @Column(length = 80)
    private String assignedAgent;
    @Column(length = 80)
    private String label;
    @Column(nullable = false)
    private boolean favorite;
    @Column(nullable = false)
    private boolean pinned;
    @Column(length = 1000)
    private String pinnedNote;
    @Column(length = 1000)
    private String lastMessage;
    @Column(nullable = false)
    private LocalDateTime lastMessageAt;
    @Column(nullable = false)
    private int unreadCount;
    private LocalDateTime botPausedUntil;
    @Column(nullable = false)
    private boolean botPausedIndefinitely;
    private LocalDateTime botLastAutoReplyAt;
    @Column(nullable = false, length = 40)
    private String botStatus = "active";

    protected WhatsappConversation() {
    }

    public WhatsappConversation(UUID id, UUID storeId, String remoteJid) {
        this.id = id;
        this.storeId = storeId;
        this.remoteJid = remoteJid;
        this.lastMessageAt = LocalDateTime.now();
    }

    public UUID getId() { return id; }
    public UUID getStoreId() { return storeId; }
    public String getRemoteJid() { return remoteJid; }
    public String getContactName() { return contactName; }
    public void setContactName(String contactName) { this.contactName = contactName; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }
    public String getAssignedAgent() { return assignedAgent; }
    public void setAssignedAgent(String assignedAgent) { this.assignedAgent = assignedAgent; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public boolean isFavorite() { return favorite; }
    public void setFavorite(boolean favorite) { this.favorite = favorite; }
    public boolean isPinned() { return pinned; }
    public void setPinned(boolean pinned) { this.pinned = pinned; }
    public String getPinnedNote() { return pinnedNote; }
    public void setPinnedNote(String pinnedNote) { this.pinnedNote = pinnedNote; }
    public String getLastMessage() { return lastMessage; }
    public void setLastMessage(String lastMessage) { this.lastMessage = lastMessage; }
    public LocalDateTime getLastMessageAt() { return lastMessageAt; }
    public void setLastMessageAt(LocalDateTime lastMessageAt) { this.lastMessageAt = lastMessageAt; }
    public int getUnreadCount() { return unreadCount; }
    public void setUnreadCount(int unreadCount) { this.unreadCount = unreadCount; }
    public LocalDateTime getBotPausedUntil() { return botPausedUntil; }
    public void setBotPausedUntil(LocalDateTime botPausedUntil) { this.botPausedUntil = botPausedUntil; }
    public boolean isBotPausedIndefinitely() { return botPausedIndefinitely; }
    public void setBotPausedIndefinitely(boolean botPausedIndefinitely) { this.botPausedIndefinitely = botPausedIndefinitely; }
    public LocalDateTime getBotLastAutoReplyAt() { return botLastAutoReplyAt; }
    public void setBotLastAutoReplyAt(LocalDateTime botLastAutoReplyAt) { this.botLastAutoReplyAt = botLastAutoReplyAt; }
    public String getBotStatus() { return botStatus; }
    public void setBotStatus(String botStatus) { this.botStatus = botStatus; }
}
