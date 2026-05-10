package com.meucardapio.dev.vinis.meuCardapio.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import com.meucardapio.dev.vinis.meuCardapio.domain.Store;
import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappConversation;
import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappIntegration;
import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappMessage;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.WhatsappConversationRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.WhatsappIntegrationRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.WhatsappMessageRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class WasenderApiService {
    private final StoreRepository stores;
    private final WhatsappIntegrationRepository integrations;
    private final WhatsappConversationRepository conversations;
    private final WhatsappMessageRepository messages;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public WasenderApiService(
            StoreRepository stores,
            WhatsappIntegrationRepository integrations,
            WhatsappConversationRepository conversations,
            WhatsappMessageRepository messages,
            ObjectMapper objectMapper,
            @Value("${app.wasender.base-url:https://www.wasenderapi.com}") String baseUrl) {
        this.stores = stores;
        this.integrations = integrations;
        this.conversations = conversations;
        this.messages = messages;
        this.objectMapper = objectMapper;
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
                .build();
    }

    public WhatsappIntegration getOrCreate(UUID storeId) {
        stores.findById(storeId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loja nao encontrada"));
        return integrations.findById(storeId).orElseGet(() -> integrations.save(new WhatsappIntegration(storeId)));
    }

    @Transactional
    public WhatsappIntegration saveConfig(UUID storeId, String personalToken, String apiKey, String sessionId, String sessionName, String phoneNumber, String webhookSecret, String webhookUrl) {
        WhatsappIntegration integration = getOrCreate(storeId);
        if (hasText(personalToken)) integration.setPersonalAccessToken(personalToken.trim());
        if (hasText(apiKey)) integration.setApiKey(apiKey.trim());
        if (hasText(sessionId)) integration.setSessionId(normalizeSessionId(sessionId));
        if (hasText(sessionName)) integration.setSessionName(sessionName.trim());
        if (hasText(phoneNumber)) integration.setPhoneNumber(normalizeInternationalPhone(phoneNumber));
        if (hasText(webhookSecret)) integration.setWebhookSecret(webhookSecret.trim());
        if (hasText(webhookUrl)) integration.setWebhookUrl(webhookUrl.trim());
        integration.touch();
        return integrations.save(integration);
    }

    @Transactional
    public JsonNode createSession(UUID storeId, String sessionName, String phoneNumber, String webhookUrl) {
        WhatsappIntegration integration = getOrCreate(storeId);
        if (hasText(integration.getSessionId())) {
            return objectMapper.createObjectNode()
                    .put("success", true)
                    .put("message", "Sessao existente reutilizada.")
                    .set("data", objectMapper.createObjectNode()
                            .put("id", integration.getSessionId())
                            .put("name", Optional.ofNullable(integration.getSessionName()).orElse("MeuCardapio"))
                            .put("phone_number", Optional.ofNullable(integration.getPhoneNumber()).orElse(""))
                            .put("status", Optional.ofNullable(integration.getStatus()).orElse("")));
        }
        String token = require(integration.getPersonalAccessToken(), "Informe o Personal Access Token da WaSenderAPI.");
        String name = hasText(sessionName) ? sessionName.trim() : Optional.ofNullable(integration.getSessionName()).orElse("MeuCardapio");
        String phone = normalizeInternationalPhone(hasText(phoneNumber) ? phoneNumber : require(integration.getPhoneNumber(), "Informe o telefone internacional da sessao."));
        String hook = hasText(webhookUrl) ? webhookUrl.trim() : integration.getWebhookUrl();

        JsonNode response = restClient.post()
                .uri("/api/whatsapp-sessions")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .body(Map.of(
                        "name", name,
                        "phone_number", phone,
                        "account_protection", true,
                        "log_messages", true,
                        "read_incoming_messages", false,
                        "webhook_url", hook == null ? "" : hook,
                        "webhook_enabled", hasText(hook),
                        "webhook_events", List.of("messages.received", "messages.upsert", "message.sent", "messages.update", "session.status")))
                .retrieve()
                .body(JsonNode.class);

        JsonNode data = response == null ? objectMapper.createObjectNode() : response.path("data");
        if (data.hasNonNull("id")) integration.setSessionId(data.path("id").asText());
        if (data.hasNonNull("name")) integration.setSessionName(data.path("name").asText());
        if (data.hasNonNull("phone_number")) integration.setPhoneNumber(data.path("phone_number").asText());
        if (data.hasNonNull("api_key")) integration.setApiKey(data.path("api_key").asText());
        if (data.hasNonNull("webhook_secret")) integration.setWebhookSecret(data.path("webhook_secret").asText());
        if (data.hasNonNull("webhook_url")) integration.setWebhookUrl(data.path("webhook_url").asText());
        if (data.hasNonNull("status")) integration.setStatus(data.path("status").asText());
        integration.touch();
        integrations.save(integration);
        return response;
    }

    public JsonNode connect(UUID storeId) {
        WhatsappIntegration integration = getOrCreate(storeId);
        String token = require(integration.getPersonalAccessToken(), "Informe o Personal Access Token da WaSenderAPI.");
        String sessionId = normalizeSessionId(require(integration.getSessionId(), "Crie ou informe o ID da sessao antes de conectar."));
        JsonNode response = restClient.post()
                .uri("/api/whatsapp-sessions/{id}/connect", sessionId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .body(JsonNode.class);
        if (response != null && response.path("data").hasNonNull("status")) {
            integration.setStatus(response.path("data").path("status").asText());
            integration.touch();
            integrations.save(integration);
        }
        return response;
    }

    public JsonNode qrCode(UUID storeId) {
        WhatsappIntegration integration = getOrCreate(storeId);
        String token = require(integration.getPersonalAccessToken(), "Informe o Personal Access Token da WaSenderAPI.");
        String sessionId = normalizeSessionId(require(integration.getSessionId(), "Crie ou informe o ID da sessao antes de pedir o QR Code."));
        return restClient.get()
                .uri("/api/whatsapp-sessions/{id}/qrcode", sessionId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .body(JsonNode.class);
    }

    public JsonNode status(UUID storeId) {
        WhatsappIntegration integration = getOrCreate(storeId);
        String apiKey = require(integration.getApiKey(), "Informe a API key da sessao.");
        JsonNode response = restClient.get()
                .uri("/api/status")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .retrieve()
                .body(JsonNode.class);
        if (response != null && response.hasNonNull("status")) {
            integration.setStatus(response.path("status").asText());
            integration.touch();
            integrations.save(integration);
        }
        return response;
    }

    @Transactional
    public WhatsappMessage send(UUID storeId, String to, String text) {
        WhatsappIntegration integration = getOrCreate(storeId);
        String apiKey = require(integration.getApiKey(), "Informe a API key da sessao.");
        if (!hasText(to) || !hasText(text)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe destinatario e mensagem.");
        }
        JsonNode response = restClient.post()
                .uri("/api/send-message")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .body(Map.of("to", to.trim(), "text", text.trim()))
                .retrieve()
                .body(JsonNode.class);

        WhatsappConversation conversation = upsertConversation(storeId, to.trim(), to.trim(), to.trim(), text.trim(), true);
        WhatsappMessage message = new WhatsappMessage(UUID.randomUUID(), storeId, conversation, to.trim(), true);
        message.setBody(text.trim());
        if (response != null && response.path("data").hasNonNull("msgId")) {
            message.setProviderMessageId(response.path("data").path("msgId").asText());
        }
        message.setStatus(response != null ? response.path("data").path("status").asText("sent") : "sent");
        message.setPayload(toJson(response));
        return messages.save(message);
    }

    @Transactional
    public void receiveWebhook(UUID storeId, String signature, JsonNode payload) {
        WhatsappIntegration integration = getOrCreate(storeId);
        if (hasText(integration.getWebhookSecret()) && !integration.getWebhookSecret().equals(signature)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Assinatura do webhook invalida.");
        }
        String event = payload.path("event").asText("");
        if (event.equals("messages.update")) {
            updateMessageStatus(storeId, payload);
            return;
        }
        JsonNode items = payload.path("data").path("messages");
        if (items.isMissingNode()) {
            items = payload.path("data");
        }
        if (items.isArray()) {
            items.forEach(item -> saveWebhookMessage(storeId, item, payload));
        } else {
            saveWebhookMessage(storeId, items, payload);
        }
    }

    private void updateMessageStatus(UUID storeId, JsonNode payload) {
        String messageId = payload.path("data").path("key").path("id").asText("");
        if (!hasText(messageId)) return;
        messages.findFirstByStoreIdAndProviderMessageId(storeId, messageId).ifPresent(message -> {
            message.setStatus(String.valueOf(payload.path("data").path("update").path("status").asInt()));
            messages.save(message);
        });
    }

    private void saveWebhookMessage(UUID storeId, JsonNode item, JsonNode payload) {
        JsonNode key = item.path("key");
        String remoteJid = key.path("remoteJid").asText("");
        if (!hasText(remoteJid)) return;
        boolean fromMe = key.path("fromMe").asBoolean(false);
        String messageId = key.path("id").asText("");
        if (hasText(messageId) && messages.findFirstByStoreIdAndProviderMessageId(storeId, messageId).isPresent()) {
            return;
        }
        String phone = firstText(key.path("cleanedSenderPn"), key.path("senderPn"), key.path("participantPn"));
        String body = firstText(item.path("messageBody"), item.path("message").path("conversation"));
        WhatsappConversation conversation = upsertConversation(storeId, remoteJid, phone, phone, body, !fromMe);
        WhatsappMessage message = new WhatsappMessage(UUID.randomUUID(), storeId, conversation, remoteJid, fromMe);
        message.setProviderMessageId(messageId);
        message.setBody(body);
        message.setPayload(toJson(payload));
        messages.save(message);
    }

    private WhatsappConversation upsertConversation(UUID storeId, String remoteJid, String phone, String contactName, String lastMessage, boolean unread) {
        WhatsappConversation conversation = conversations.findByStoreIdAndRemoteJid(storeId, remoteJid)
                .orElseGet(() -> new WhatsappConversation(UUID.randomUUID(), storeId, remoteJid));
        if (hasText(phone)) conversation.setPhone(phone.replace("@s.whatsapp.net", ""));
        if (hasText(contactName)) conversation.setContactName(contactName.replace("@s.whatsapp.net", ""));
        conversation.setLastMessage(lastMessage == null ? "" : lastMessage);
        conversation.setLastMessageAt(LocalDateTime.now());
        conversation.setUnreadCount(unread ? conversation.getUnreadCount() + 1 : conversation.getUnreadCount());
        return conversations.save(conversation);
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "{}";
        }
    }

    private static String firstText(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            if (node != null && !node.isMissingNode() && hasText(node.asText())) {
                return node.asText();
            }
        }
        return "";
    }

    private static String require(String value, String message) {
        if (!hasText(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return value.trim();
    }

    private static String normalizeInternationalPhone(String value) {
        String phone = Optional.ofNullable(value).orElse("").replaceAll("\\D", "");
        if (phone.length() < 10 || phone.length() > 15) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o telefone com DDI. Exemplo: +5547999999999.");
        }
        return "+" + phone;
    }

    private static String normalizeSessionId(String value) {
        String sessionId = Optional.ofNullable(value).orElse("").trim();
        if (!sessionId.matches("\\d+")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe o ID numerico da sessao WaSenderAPI, nao a API key.");
        }
        return sessionId;
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
