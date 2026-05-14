package com.meucardapio.dev.vinis.meuCardapio.api.dto;

import java.time.LocalDateTime;
import java.util.List;
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
            String webhookUrl,
            Boolean botEnabled,
            String botWelcome,
            String botFallback,
            String botMenuUrl,
            String botHandoffKeywords,
            String botTrainingJson) {
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
            boolean botEnabled,
            String botWelcome,
            String botFallback,
            String botMenuUrl,
            String botHandoffKeywords,
            String botTrainingJson,
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
                    integration.isBotEnabled(),
                    integration.getBotWelcome(),
                    integration.getBotFallback(),
                    integration.getBotMenuUrl(),
                    integration.getBotHandoffKeywords(),
                    integration.getBotTrainingJson(),
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
            String avatarUrl,
            String assignedAgent,
            String label,
            boolean favorite,
            boolean pinned,
            String pinnedNote,
            String lastMessage,
            LocalDateTime lastMessageAt,
            int unreadCount,
            String botStatus,
            LocalDateTime botPausedUntil,
            boolean botPausedIndefinitely,
            LocalDateTime botLastAutoReplyAt) {
        public static WhatsappConversationResponse from(WhatsappConversation conversation) {
            return new WhatsappConversationResponse(
                    conversation.getId(),
                    conversation.getRemoteJid(),
                    conversation.getContactName(),
                    conversation.getPhone(),
                    conversation.getAvatarUrl(),
                    conversation.getAssignedAgent(),
                    conversation.getLabel(),
                    conversation.isFavorite(),
                    conversation.isPinned(),
                    conversation.getPinnedNote(),
                    conversation.getLastMessage(),
                    conversation.getLastMessageAt(),
                    conversation.getUnreadCount(),
                    conversation.getBotStatus(),
                    conversation.getBotPausedUntil(),
                    conversation.isBotPausedIndefinitely(),
                    conversation.getBotLastAutoReplyAt());
        }
    }

    public record WhatsappConversationSyncResponse(
            List<WhatsappConversationResponse> conversations,
            int imported,
            boolean partial,
            String message) {
    }

    public record WhatsappConversationPatchRequest(
            String assignedAgent,
            String label,
            Boolean favorite,
            Boolean pinned,
            String pinnedNote) {
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

    public record WhatsappBotControlRequest(String action) {
    }

    public record WhatsappBotTestRequest(String text, String remoteJid) {
    }

    public record WhatsappBotTestResponse(String intent, int confidence, boolean humanEscalation, String response) {
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
