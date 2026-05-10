package com.meucardapio.dev.vinis.meuCardapio.domain;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "whatsapp_integrations")
public class WhatsappIntegration {
    @Id
    private UUID storeId;
    @Column(length = 80)
    private String sessionId;
    @Column(length = 120)
    private String sessionName;
    @Column(length = 40)
    private String phoneNumber;
    @Column(columnDefinition = "text")
    private String personalAccessToken;
    @Column(columnDefinition = "text")
    private String apiKey;
    @Column(length = 160)
    private String webhookSecret;
    @Column(length = 500)
    private String webhookUrl;
    @Column(length = 40)
    private String status;
    @Column(nullable = false)
    private boolean botEnabled = true;
    @Column(columnDefinition = "text")
    private String botWelcome;
    @Column(columnDefinition = "text")
    private String botFallback;
    @Column(length = 500)
    private String botMenuUrl;
    @Column(length = 500)
    private String botHandoffKeywords;
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    protected WhatsappIntegration() {
    }

    public WhatsappIntegration(UUID storeId) {
        this.storeId = storeId;
        this.status = "not_configured";
        this.updatedAt = LocalDateTime.now();
    }

    public UUID getStoreId() { return storeId; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getSessionName() { return sessionName; }
    public void setSessionName(String sessionName) { this.sessionName = sessionName; }
    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }
    public String getPersonalAccessToken() { return personalAccessToken; }
    public void setPersonalAccessToken(String personalAccessToken) { this.personalAccessToken = personalAccessToken; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public String getWebhookSecret() { return webhookSecret; }
    public void setWebhookSecret(String webhookSecret) { this.webhookSecret = webhookSecret; }
    public String getWebhookUrl() { return webhookUrl; }
    public void setWebhookUrl(String webhookUrl) { this.webhookUrl = webhookUrl; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public boolean isBotEnabled() { return botEnabled; }
    public void setBotEnabled(boolean botEnabled) { this.botEnabled = botEnabled; }
    public String getBotWelcome() { return botWelcome; }
    public void setBotWelcome(String botWelcome) { this.botWelcome = botWelcome; }
    public String getBotFallback() { return botFallback; }
    public void setBotFallback(String botFallback) { this.botFallback = botFallback; }
    public String getBotMenuUrl() { return botMenuUrl; }
    public void setBotMenuUrl(String botMenuUrl) { this.botMenuUrl = botMenuUrl; }
    public String getBotHandoffKeywords() { return botHandoffKeywords; }
    public void setBotHandoffKeywords(String botHandoffKeywords) { this.botHandoffKeywords = botHandoffKeywords; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void touch() { this.updatedAt = LocalDateTime.now(); }
}
