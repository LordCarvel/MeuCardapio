package com.meucardapio.dev.vinis.meuCardapio.api.dto;

import java.time.LocalDateTime;
import java.util.UUID;

import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappConversation;
import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappIntegration;
import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappMessage;

import tools.jackson.databind.JsonNode;

public final class WhatsappDtos {
    private WhatsappDtos() {
    }

    public record WhatsappConfigRequest(
            String personalAccessToken,
            String apiKey,
            String sessionId,
            String sessionName,
            String phoneNumber,
            String webhookSecret,
            String webhookUrl) {
    }

    public record WhatsappConfigResponse(
            UUID storeId,
            String sessionId,
            String sessionName,
            String phoneNumber,
            boolean hasPersonalAccessToken,
            boolean hasApiKey,
            boolean hasWebhookSecret,
            String webhookUrl,
            String status,
            LocalDateTime updatedAt) {
        public static WhatsappConfigResponse from(WhatsappIntegration integration) {
            return new WhatsappConfigResponse(
                    integration.getStoreId(),
                    integration.getSessionId(),
                    integration.getSessionName(),
                    integration.getPhoneNumber(),
                    hasText(integration.getPersonalAccessToken()),
                    hasText(integration.getApiKey()),
                    hasText(integration.getWebhookSecret()),
                    integration.getWebhookUrl(),
                    integration.getStatus(),
                    integration.getUpdatedAt());
        }
    }

    public record WhatsappSessionRequest(String sessionName, String phoneNumber, String webhookUrl) {
    }

    public record WhatsappQrResponse(String status, String qrCode, JsonNode raw) {
    }

    public record WhatsappStatusResponse(String status, JsonNode raw) {
    }

    public record WhatsappConversationResponse(
            UUID id,
            String remoteJid,
            String contactName,
            String phone,
            String lastMessage,
            LocalDateTime lastMessageAt,
            int unreadCount) {
        public static WhatsappConversationResponse from(WhatsappConversation conversation) {
            return new WhatsappConversationResponse(
                    conversation.getId(),
                    conversation.getRemoteJid(),
                    conversation.getContactName(),
                    conversation.getPhone(),
                    conversation.getLastMessage(),
                    conversation.getLastMessageAt(),
                    conversation.getUnreadCount());
        }
    }

    public record WhatsappMessageResponse(
            UUID id,
            String providerMessageId,
            String remoteJid,
            boolean fromMe,
            String body,
            String status,
            LocalDateTime createdAt) {
        public static WhatsappMessageResponse from(WhatsappMessage message) {
            return new WhatsappMessageResponse(
                    message.getId(),
                    message.getProviderMessageId(),
                    message.getRemoteJid(),
                    message.isFromMe(),
                    message.getBody(),
                    message.getStatus(),
                    message.getCreatedAt());
        }
    }

    public record WhatsappSendMessageRequest(String to, String text) {
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
