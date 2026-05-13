package com.meucardapio.dev.vinis.meuCardapio.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import com.meucardapio.dev.vinis.meuCardapio.domain.CustomerOrder;
import com.meucardapio.dev.vinis.meuCardapio.domain.Product;
import com.meucardapio.dev.vinis.meuCardapio.domain.Store;
import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappConversation;
import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappIntegration;
import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappMessage;
import com.meucardapio.dev.vinis.meuCardapio.repository.CustomerOrderRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.ProductRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.WhatsappConversationRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.WhatsappIntegrationRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.WhatsappMessageRepository;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class WasenderApiService {
    private static final int CONTACT_SYNC_PAGE_LIMIT = 100;
    private static final int CONTACT_SYNC_MAX_PAGES = 10;
    private static final int MESSAGE_LOG_SYNC_PAGE_LIMIT = 50;
    private static final int MESSAGE_LOG_SYNC_MAX_PAGES = 10;
    private static final List<String> MIRROR_WEBHOOK_EVENTS = List.of(
            "chats.upsert",
            "chats.update",
            "contacts.upsert",
            "contacts.update",
            "messages.received",
            "messages.upsert",
            "message.sent",
            "messages.update",
            "session.status");

    private final StoreRepository stores;
    private final WhatsappIntegrationRepository integrations;
    private final WhatsappConversationRepository conversations;
    private final WhatsappMessageRepository messages;
    private final CustomerOrderRepository customerOrders;
    private final ProductRepository products;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public WasenderApiService(
            StoreRepository stores,
            WhatsappIntegrationRepository integrations,
            WhatsappConversationRepository conversations,
            WhatsappMessageRepository messages,
            CustomerOrderRepository customerOrders,
            ProductRepository products,
            ObjectMapper objectMapper,
            @Value("${app.wasender.base-url:https://www.wasenderapi.com}") String baseUrl) {
        this.stores = stores;
        this.integrations = integrations;
        this.conversations = conversations;
        this.messages = messages;
        this.customerOrders = customerOrders;
        this.products = products;
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
    public WhatsappIntegration saveConfig(
            UUID storeId,
            String personalToken,
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
            String botHandoffKeywords) {
        WhatsappIntegration integration = getOrCreate(storeId);
        if (hasText(personalToken)) integration.setPersonalAccessToken(personalToken.trim());
        if (hasText(apiKey)) integration.setApiKey(apiKey.trim());
        if (hasText(sessionId)) integration.setSessionId(normalizeSessionId(sessionId));
        if (hasText(sessionName)) integration.setSessionName(sessionName.trim());
        if (hasText(phoneNumber)) integration.setPhoneNumber(normalizeInternationalPhone(phoneNumber));
        if (hasText(webhookSecret)) integration.setWebhookSecret(webhookSecret.trim());
        if (hasText(webhookUrl)) integration.setWebhookUrl(webhookUrl.trim());
        if (botEnabled != null) integration.setBotEnabled(botEnabled);
        if (botWelcome != null) integration.setBotWelcome(botWelcome.trim());
        if (botFallback != null) integration.setBotFallback(botFallback.trim());
        if (botMenuUrl != null) integration.setBotMenuUrl(botMenuUrl.trim());
        if (botHandoffKeywords != null) integration.setBotHandoffKeywords(botHandoffKeywords.trim());
        integration.touch();
        WhatsappIntegration saved = integrations.save(integration);
        if (hasText(saved.getPersonalAccessToken()) && hasText(saved.getSessionId())) {
            try {
                if (hasText(saved.getWebhookUrl())) {
                    updateSessionWebhook(saved, saved.getWebhookUrl());
                } else {
                    fetchSessionDetails(saved);
                }
            } catch (RestClientException ex) {
                if (hasText(personalToken) || hasText(sessionId) || hasText(webhookUrl)) {
                    throw wasenderBadRequest("A WaSenderAPI recusou o Personal Access Token ou o ID da sessao.", ex);
                }
            }
        }
        return saved;
    }

    @Transactional
    public JsonNode createSession(UUID storeId, String sessionName, String phoneNumber, String webhookUrl) {
        WhatsappIntegration integration = getOrCreate(storeId);
        if (hasText(integration.getSessionId())) {
            String hook = hasText(webhookUrl) ? webhookUrl.trim() : integration.getWebhookUrl();
            if (hasText(integration.getPersonalAccessToken())) {
                if (hasText(hook)) {
                    updateSessionWebhook(integration, hook);
                } else {
                    fetchSessionDetails(integration);
                }
            }
            return objectMapper.createObjectNode()
                    .put("success", true)
                    .put("message", "Sessao existente reutilizada com webhooks de espelho atualizados.")
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
                        "webhook_events", MIRROR_WEBHOOK_EVENTS))
                .retrieve()
                .body(JsonNode.class);

        applySessionData(integration, response == null ? objectMapper.createObjectNode() : response.path("data"));
        integration.touch();
        integrations.save(integration);
        return response;
    }

    private WhatsappIntegration fetchSessionDetails(WhatsappIntegration integration) {
        String token = require(integration.getPersonalAccessToken(), "Informe o Personal Access Token da WaSenderAPI.");
        String sessionId = normalizeSessionId(require(integration.getSessionId(), "Informe o ID numerico da sessao WaSenderAPI."));
        JsonNode response = restClient.get()
                .uri("/api/whatsapp-sessions/{id}", sessionId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .retrieve()
                .body(JsonNode.class);

        applySessionData(integration, response == null ? objectMapper.createObjectNode() : response.path("data"));
        integration.touch();
        return integrations.save(integration);
    }

    private JsonNode updateSessionWebhook(WhatsappIntegration integration, String webhookUrl) {
        String token = require(integration.getPersonalAccessToken(), "Informe o Personal Access Token da WaSenderAPI.");
        String sessionId = normalizeSessionId(require(integration.getSessionId(), "Crie ou informe o ID da sessao antes de atualizar webhooks."));
        Map<String, Object> body = new LinkedHashMap<>();
        if (hasText(integration.getSessionName())) {
            body.put("name", integration.getSessionName());
        }
        if (hasText(integration.getPhoneNumber())) {
            body.put("phone_number", integration.getPhoneNumber());
        }
        body.put("account_protection", true);
        body.put("log_messages", true);
        body.put("read_incoming_messages", false);
        body.put("webhook_url", webhookUrl == null ? "" : webhookUrl);
        body.put("webhook_enabled", hasText(webhookUrl));
        body.put("webhook_events", MIRROR_WEBHOOK_EVENTS);

        JsonNode response = restClient.put()
                .uri("/api/whatsapp-sessions/{id}", sessionId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .body(body)
                .retrieve()
                .body(JsonNode.class);

        applySessionData(integration, response == null ? objectMapper.createObjectNode() : response.path("data"));
        integration.touch();
        integrations.save(integration);
        return response;
    }

    private void applySessionData(WhatsappIntegration integration, JsonNode data) {
        if (data == null || data.isMissingNode() || data.isNull()) {
            return;
        }
        if (data.hasNonNull("id")) integration.setSessionId(data.path("id").asText());
        if (data.hasNonNull("name")) integration.setSessionName(data.path("name").asText());
        if (data.hasNonNull("phone_number")) integration.setPhoneNumber(data.path("phone_number").asText());
        if (data.hasNonNull("api_key")) integration.setApiKey(data.path("api_key").asText());
        if (data.hasNonNull("webhook_secret")) integration.setWebhookSecret(data.path("webhook_secret").asText());
        if (data.hasNonNull("webhook_url")) integration.setWebhookUrl(data.path("webhook_url").asText());
        if (data.hasNonNull("status")) integration.setStatus(data.path("status").asText());
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
        String apiKey = requireSessionApiKey(integration);
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

    public List<WhatsappConversation> conversations(UUID storeId) {
        getOrCreate(storeId);
        return conversations.findVisibleByStoreIdOrderByLastMessageAtDesc(storeId);
    }

    public List<WhatsappMessage> messages(UUID storeId, String remoteJid) {
        WhatsappConversation conversation = resolveDisplayConversation(storeId, remoteJid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversa nao encontrada"));
        List<WhatsappMessage> savedMessages = messages.findByConversationOrderByCreatedAtAsc(conversation);
        if (!savedMessages.isEmpty() || !hasText(conversation.getLastMessage())) {
            return savedMessages;
        }

        WhatsappMessage summary = new WhatsappMessage(UUID.randomUUID(), storeId, conversation, conversation.getRemoteJid(), false);
        summary.setProviderMessageId("summary:" + conversation.getId());
        summary.setBody(conversation.getLastMessage());
        summary.setStatus("summary");
        summary.setCreatedAt(Optional.ofNullable(conversation.getLastMessageAt()).orElse(LocalDateTime.now()));
        return List.of(summary);
    }

    @Transactional
    public void markRead(UUID storeId, String remoteJid) {
        WhatsappConversation conversation = resolveDisplayConversation(storeId, remoteJid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversa nao encontrada"));
        conversation.setUnreadCount(0);
        conversations.save(conversation);
    }

    @Transactional
    public WhatsappMessage send(UUID storeId, String to, String text) {
        return sendOutboundMessage(storeId, to, text, true, true, false);
    }

    private WhatsappMessage sendBotMessage(UUID storeId, String to, String text) {
        return sendOutboundMessage(storeId, to, text, false, false, true);
    }

    private WhatsappMessage sendOutboundMessage(UUID storeId, String to, String text, boolean validateRecipient, boolean pauseAsManual, boolean botMessage) {
        WhatsappIntegration integration = getOrCreate(storeId);
        String apiKey = requireSessionApiKey(integration);
        if (!hasText(to) || !hasText(text)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe destinatario e mensagem.");
        }
        String recipient = normalizeRecipient(to);
        Optional<WhatsappConversation> knownConversation = findKnownConversation(storeId, recipient);
        if (validateRecipient && knownConversation.isEmpty() && isPhoneAddress(recipient) && !isPhoneRegisteredOnWhatsapp(apiKey, recipient)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Este numero nao esta cadastrado no WhatsApp. A conversa nao foi criada.");
        }

        JsonNode response = restClient.post()
                .uri("/api/send-message")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .body(Map.of("to", recipient, "text", text.trim()))
                .retrieve()
                .body(JsonNode.class);

        WhatsappConversation conversation = knownConversation
                .map(existing -> upsertConversation(
                        storeId,
                        existing.getRemoteJid(),
                        existing.getPhone(),
                        existing.getContactName(),
                        text.trim(),
                        LocalDateTime.now(),
                        false,
                        null))
                .orElseGet(() -> upsertConversation(
                        storeId,
                        recipient,
                        isPhoneAddress(recipient) ? cleanWhatsappPhone(recipient) : "",
                        recipient,
                        text.trim(),
                        LocalDateTime.now(),
                        false,
                        null));
        if (pauseAsManual) {
            pauseConversationForToday(conversation, "human");
        }
        if (botMessage) {
            conversation.setBotLastAutoReplyAt(LocalDateTime.now());
            conversations.save(conversation);
        }
        WhatsappMessage message = new WhatsappMessage(UUID.randomUUID(), storeId, conversation, conversation.getRemoteJid(), true);
        message.setBody(text.trim());
        if (response != null && response.path("data").hasNonNull("msgId")) {
            message.setProviderMessageId(response.path("data").path("msgId").asText());
        }
        message.setStatus(response != null ? response.path("data").path("status").asText("sent") : "sent");
        message.setPayload(toJson(response));
        return messages.save(message);
    }

    @Transactional
    public WhatsappConversationSyncResult syncConversations(UUID storeId) {
        WhatsappIntegration integration = getOrCreate(storeId);
        String apiKey = requireSessionApiKey(integration);
        int page = 1;
        int totalPages = 1;
        int enriched = 0;
        int importedLogs = 0;
        boolean partial = false;
        String message = "";
        if (hasText(integration.getPersonalAccessToken()) && hasText(integration.getSessionId()) && hasText(integration.getWebhookUrl())) {
            try {
                updateSessionWebhook(integration, integration.getWebhookUrl());
            } catch (RestClientException ex) {
                partial = true;
                message = "Credenciais salvas, mas nao consegui atualizar o webhook na WaSenderAPI agora. Confira o Personal token e o ID da sessao.";
            }
        }

        do {
            int currentPage = page;
            JsonNode response;
            try {
                response = fetchContactPage(apiKey, currentPage);
            } catch (RestClientResponseException ex) {
                partial = true;
                message = contactSyncFailureMessage(ex.getResponseBodyAsString(), ex);
                break;
            } catch (RestClientException ex) {
                partial = true;
                message = contactSyncFailureMessage("", ex);
                break;
            }
            if (response != null && !response.path("success").asBoolean(true)) {
                partial = true;
                message = contactSyncFailureMessage(response);
                break;
            }
            List<JsonNode> contacts = contactItems(response);
            for (JsonNode contact : contacts) {
                if (enrichContactConversation(storeId, contact)) {
                    enriched += 1;
                }
            }
            totalPages = Math.min(CONTACT_SYNC_MAX_PAGES, Math.max(totalPages, contactPageCount(response)));
            page += 1;
        } while (page <= totalPages && page <= CONTACT_SYNC_MAX_PAGES);

        try {
            importedLogs = importMessageLogs(storeId, integration);
        } catch (RestClientResponseException ex) {
            partial = true;
            message = hasText(message) ? message : messageLogFailureMessage(ex.getResponseBodyAsString(), ex);
        } catch (RestClientException ex) {
            partial = true;
            message = hasText(message) ? message : "Nao foi possivel carregar logs de mensagens da WaSenderAPI agora.";
        }

        if (enriched > 0) {
            integration.touch();
            integrations.save(integration);
        }
        List<WhatsappConversation> visibleConversations = conversations.findVisibleByStoreIdOrderByLastMessageAtDesc(storeId);
        return new WhatsappConversationSyncResult(
                visibleConversations,
                enriched + importedLogs,
                partial,
                hasText(message)
                        ? message
                        : visibleConversations.size() + " conversa(s)/contato(s) carregado(s). " + importedLogs + " mensagem(ns) de log importada(s); " + enriched + " contato(s) atualizaram nome/foto.");
    }

    private JsonNode fetchContactPage(String apiKey, int page) {
        return restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/api/contacts")
                        .queryParam("paginated", "true")
                        .queryParam("page", page)
                        .queryParam("limit", CONTACT_SYNC_PAGE_LIMIT)
                        .build())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .retrieve()
                .body(JsonNode.class);
    }

    private int importMessageLogs(UUID storeId, WhatsappIntegration integration) {
        if (hasText(integration.getPersonalAccessToken()) && hasText(integration.getSessionId()) && !hasText(integration.getApiKey())) {
            integration = fetchSessionDetails(integration);
        }
        if (!hasText(integration.getSessionId()) || (!hasText(integration.getApiKey()) && !hasText(integration.getPersonalAccessToken()))) {
            return 0;
        }
        String sessionId = normalizeSessionId(integration.getSessionId());
        String primaryToken = hasText(integration.getPersonalAccessToken()) ? integration.getPersonalAccessToken().trim() : integration.getApiKey().trim();
        String fallbackToken = hasText(integration.getApiKey()) && !integration.getApiKey().trim().equals(primaryToken)
                ? integration.getApiKey().trim()
                : "";
        try {
            return importMessageLogsWithToken(storeId, sessionId, primaryToken);
        } catch (RestClientResponseException ex) {
            if (hasText(fallbackToken)) {
                return importMessageLogsWithToken(storeId, sessionId, fallbackToken);
            }
            throw ex;
        }
    }

    private int importMessageLogsWithToken(UUID storeId, String sessionId, String token) {
        int page = 1;
        int totalPages = 1;
        int imported = 0;

        do {
            int currentPage = page;
            JsonNode response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/whatsapp-sessions/{sessionId}/message-logs")
                            .queryParam("page", currentPage)
                            .queryParam("per_page", MESSAGE_LOG_SYNC_PAGE_LIMIT)
                            .build(sessionId))
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .retrieve()
                    .body(JsonNode.class);
            for (JsonNode item : paginatedDataItems(response)) {
                if (saveMessageLog(storeId, item)) {
                    imported += 1;
                }
            }
            totalPages = Math.min(MESSAGE_LOG_SYNC_MAX_PAGES, Math.max(totalPages, contactPageCount(response)));
            page += 1;
        } while (page <= totalPages && page <= MESSAGE_LOG_SYNC_MAX_PAGES);

        return imported;
    }

    @Transactional
    public WhatsappConversation controlBot(UUID storeId, String remoteJid, String action) {
        WhatsappConversation conversation = resolveDisplayConversation(storeId, remoteJid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversa nao encontrada"));
        String normalizedAction = Optional.ofNullable(action).orElse("").trim().toLowerCase();

        switch (normalizedAction) {
            case "pause_today" -> pauseConversationForToday(conversation, "paused_today");
            case "pause_forever" -> pauseConversationIndefinitely(conversation);
            case "resume" -> resumeConversationBot(conversation);
            case "send_menu" -> sendMenuToConversation(storeId, conversation);
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Acao do robo invalida.");
        }

        return resolveDisplayConversation(storeId, remoteJid).orElse(conversation);
    }

    @Transactional
    public Optional<WhatsappMessage> notifyOrderCreated(CustomerOrder order) {
        if (order == null || !hasText(order.getCustomerPhone())) {
            return Optional.empty();
        }
        WhatsappIntegration integration = integrations.findById(order.getStore().getId()).orElse(null);
        if (integration == null || !integration.isBotEnabled()) {
            return Optional.empty();
        }
        String apiKey = requireSessionApiKey(integration);
        String recipient = normalizeBrazilianWhatsappPhone(order.getCustomerPhone());
        Optional<WhatsappConversation> knownConversation = findKnownConversation(order.getStore().getId(), recipient);
        if (knownConversation.isEmpty() && !isPhoneRegisteredOnWhatsapp(apiKey, recipient)) {
            return Optional.empty();
        }
        return Optional.of(sendOutboundMessage(order.getStore().getId(), recipient, buildOrderCreatedMessage(order), false, false, true));
    }

    @Transactional
    public void receiveWebhook(UUID storeId, String signature, JsonNode payload) {
        WhatsappIntegration integration = getOrCreate(storeId);
        if (hasText(integration.getWebhookSecret()) && !integration.getWebhookSecret().equals(signature)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Assinatura do webhook invalida.");
        }
        String event = payload.path("event").asText("");
        if (event.equals("session.status")) {
            updateSessionStatus(integration, payload);
            return;
        }
        if (event.equals("messages.update")) {
            updateMessageStatus(storeId, payload);
            return;
        }
        if (event.startsWith("chats.")) {
            for (JsonNode item : webhookItems(payload, "")) {
                saveChatWebhook(storeId, item, payload);
            }
            return;
        }
        if (event.startsWith("contacts.")) {
            for (JsonNode item : webhookItems(payload, "")) {
                enrichContactConversation(storeId, item);
            }
            return;
        }
        for (JsonNode item : webhookItems(payload, "messages")) {
            saveWebhookMessage(storeId, integration, item, payload);
        }
    }

    private void updateSessionStatus(WhatsappIntegration integration, JsonNode payload) {
        String status = firstText(
                payload.path("data").path("status"),
                payload.path("data").path("connection"),
                payload.path("status"));
        if (!hasText(status)) {
            return;
        }
        integration.setStatus(status);
        integration.touch();
        integrations.save(integration);
    }

    private void updateMessageStatus(UUID storeId, JsonNode payload) {
        String messageId = payload.path("data").path("key").path("id").asText("");
        if (!hasText(messageId)) return;
        messages.findFirstByStoreIdAndProviderMessageId(storeId, messageId).ifPresent(message -> {
            message.setStatus(String.valueOf(payload.path("data").path("update").path("status").asInt()));
            messages.save(message);
        });
    }

    private void saveWebhookMessage(UUID storeId, WhatsappIntegration integration, JsonNode item, JsonNode payload) {
        JsonNode key = item.path("key");
        String remoteJid = firstText(
                key.path("remoteJid"),
                item.path("remoteJid"),
                item.path("chatId"),
                item.path("to"),
                item.path("from"),
                item.path("jid"),
                item.path("id"));
        if (!hasText(remoteJid)) return;
        boolean fromMe = key.path("fromMe").asBoolean(item.path("fromMe").asBoolean(payload.path("event").asText("").equals("message.sent")));
        String messageId = firstText(key.path("id"), item.path("id"), item.path("messageId"), item.path("msgId"));
        if (hasText(messageId) && messages.findFirstByStoreIdAndProviderMessageId(storeId, messageId).isPresent()) {
            return;
        }
        String phone = firstText(
                key.path("cleanedSenderPn"),
                key.path("cleanedParticipantPn"),
                key.path("senderPn"),
                key.path("participantPn"),
                item.path("cleanedSenderPn"),
                item.path("cleanedParticipantPn"),
                item.path("senderPn"),
                item.path("participantPn"),
                item.path("phone"),
                item.path("to"),
                item.path("sender"));
        String contactName = fromMe ? "" : firstText(
                item.path("pushName"),
                item.path("verifiedBizName"),
                item.path("notifyName"),
                item.path("contactName"),
                item.path("name"),
                payload.path("data").path("pushName"));
        if (!hasText(contactName)) {
            contactName = fromMe ? "" : hasText(phone) ? phone : remoteJid;
        }
        String body = messageText(item);
        if (!hasText(body)) {
            body = mediaMessageLabel(item);
        }
        if (!hasText(body)) {
            return;
        }
        LocalDateTime messageAt = extractTimestamp(item, payload);
        WhatsappConversation conversation = upsertConversation(storeId, remoteJid, phone, contactName, body, messageAt, !fromMe, null, !fromMe);
        applyConversationAvatar(conversation, item, payload.path("data"));
        WhatsappMessage message = new WhatsappMessage(UUID.randomUUID(), storeId, conversation, remoteJid, fromMe);
        message.setProviderMessageId(messageId);
        message.setBody(body);
        if (item.hasNonNull("status")) {
            message.setStatus(item.path("status").asText());
        }
        message.setCreatedAt(messageAt);
        message.setPayload(toJson(payload));
        messages.save(message);
        if (!fromMe) {
            runBotIfNeeded(storeId, integration, conversation, body);
        }
    }

    private void saveChatWebhook(UUID storeId, JsonNode item, JsonNode payload) {
        String remoteJid = firstText(
                item.path("id"),
                item.path("jid"),
                item.path("remoteJid"),
                item.path("chatId"));
        if (!hasText(remoteJid)) {
            return;
        }
        String contactName = firstText(
                item.path("name"),
                item.path("pushName"),
                item.path("notify"),
                item.path("verifiedName"),
                item.path("subject"));
        String phone = firstText(item.path("phone"), item.path("number"), item.path("cleanedSenderPn"), item.path("senderPn"), item.path("id"));
        String lastMessage = firstText(item.path("lastMessage"), item.path("messageBody"), item.path("body"));
        Integer unreadCount = item.hasNonNull("unreadCount") ? Math.max(0, item.path("unreadCount").asInt(0)) : null;
        WhatsappConversation conversation = upsertConversation(storeId, remoteJid, phone, contactName, lastMessage, extractTimestamp(item, payload), false, unreadCount);
        applyConversationAvatar(conversation, item);
    }

    private boolean enrichContactConversation(UUID storeId, JsonNode contact) {
        String remoteJid = normalizeContactAddress(firstText(
                contact.path("jid"),
                contact.path("id"),
                contact.path("remoteJid"),
                contact.path("phone"),
                contact.path("number")));
        if (!hasText(remoteJid)) {
            return false;
        }
        String phone = firstText(contact.path("phone"), contact.path("number"), contact.path("jid"), contact.path("id"));
        Optional<WhatsappConversation> existing = findKnownConversation(storeId, hasText(phone) ? phone : remoteJid);
        if (existing.isEmpty()) {
            existing = conversations.findByStoreIdAndRemoteJid(storeId, remoteJid);
        }
        String contactName = firstText(
                contact.path("name"),
                contact.path("notify"),
                contact.path("verifiedName"),
                contact.path("verifiedBizName"),
                contact.path("pushName"),
                contact.path("displayName"));
        String avatarUrl = firstText(
                contact.path("imgUrl"),
                contact.path("profilePicUrl"),
                contact.path("profilePictureUrl"),
                contact.path("profilePicture"),
                contact.path("profilePicture").path("url"),
                contact.path("profilePicture").path("eurl"),
                contact.path("profilePic"),
                contact.path("profilePic").path("url"),
                contact.path("profilePic").path("eurl"),
                contact.path("picture"),
                contact.path("picture").path("url"),
                contact.path("pictureUrl"),
                contact.path("avatarUrl"),
                contact.path("avatar"),
                contact.path("avatar").path("url"),
                contact.path("photo"),
                contact.path("photo").path("url"),
                contact.path("photoUrl"),
                contact.path("image"));
        WhatsappConversation conversation = existing.orElseGet(() -> {
            WhatsappConversation created = new WhatsappConversation(UUID.randomUUID(), storeId, remoteJid);
            created.setLastMessage("");
            created.setLastMessageAt(extractTimestamp(contact, contact));
            return created;
        });
        if (hasText(phone)) {
            conversation.setPhone(cleanWhatsappPhone(phone));
        } else if (!hasText(conversation.getPhone())) {
            conversation.setPhone(cleanWhatsappPhone(remoteJid));
        }
        if (hasText(contactName)) {
            applyConversationName(conversation, contactName);
        } else if (!hasText(conversation.getContactName())) {
            conversation.setContactName(cleanWhatsappAddress(hasText(phone) ? phone : remoteJid));
        }
        if (hasText(avatarUrl)) {
            conversation.setAvatarUrl(avatarUrl.trim());
        }
        if (!hasText(conversation.getLastMessage())) {
            conversation.setLastMessage("");
        }
        conversations.save(conversation);
        return true;
    }

    private boolean saveMessageLog(UUID storeId, JsonNode item) {
        String id = firstText(item.path("id"), item.path("message_id"), item.path("msgId"));
        if (!hasText(id)) {
            return false;
        }
        String providerMessageId = "log:" + id;
        if (messages.findFirstByStoreIdAndProviderMessageId(storeId, providerMessageId).isPresent()) {
            return false;
        }
        String recipient = firstText(item.path("to"), item.path("recipient"), item.path("phone"), item.path("remoteJid"));
        String body = messageLogText(item.path("content"));
        if (!hasText(recipient) || !hasText(body)) {
            return false;
        }
        String normalizedRecipient = normalizeRecipient(recipient);
        LocalDateTime createdAt = extractTimestamp(item, item);
        Optional<WhatsappConversation> existing = findKnownConversation(storeId, normalizedRecipient);
        if (existing.isEmpty()) {
            return false;
        }
        WhatsappConversation conversation = upsertConversation(
                storeId,
                existing.get().getRemoteJid(),
                existing.get().getPhone(),
                existing.get().getContactName(),
                body,
                createdAt,
                false,
                null);
        WhatsappMessage message = new WhatsappMessage(UUID.randomUUID(), storeId, conversation, conversation.getRemoteJid(), true);
        message.setProviderMessageId(providerMessageId);
        message.setBody(body);
        message.setStatus(firstText(item.path("status"), item.path("state")));
        message.setCreatedAt(createdAt);
        message.setPayload(toJson(item));
        messages.save(message);
        return true;
    }

    private WhatsappConversation upsertConversation(UUID storeId, String remoteJid, String phone, String contactName, String lastMessage, LocalDateTime lastMessageAt, boolean unread, Integer unreadCount) {
        return upsertConversation(storeId, remoteJid, phone, contactName, lastMessage, lastMessageAt, unread, unreadCount, false);
    }

    private WhatsappConversation upsertConversation(UUID storeId, String remoteJid, String phone, String contactName, String lastMessage, LocalDateTime lastMessageAt, boolean unread, Integer unreadCount, boolean allowNameOverwrite) {
        WhatsappConversation conversation = conversations.findByStoreIdAndRemoteJid(storeId, remoteJid)
                .or(() -> findKnownConversation(storeId, hasText(phone) ? phone : remoteJid))
                .orElseGet(() -> new WhatsappConversation(UUID.randomUUID(), storeId, remoteJid));
        if (hasText(phone)) conversation.setPhone(cleanWhatsappPhone(phone));
        if (hasText(contactName)) applyConversationName(conversation, contactName, allowNameOverwrite);
        if (hasText(lastMessage) || !hasText(conversation.getLastMessage())) {
            conversation.setLastMessage(lastMessage == null ? "" : lastMessage);
        }
        conversation.setLastMessageAt(lastMessageAt == null ? LocalDateTime.now() : lastMessageAt);
        if (unreadCount != null) {
            conversation.setUnreadCount(unreadCount);
        } else if (unread) {
            conversation.setUnreadCount(conversation.getUnreadCount() + 1);
        }
        return conversations.save(conversation);
    }

    private void applyConversationName(WhatsappConversation conversation, String candidate) {
        applyConversationName(conversation, candidate, false);
    }

    private void applyConversationName(WhatsappConversation conversation, String candidate, boolean allowOverwrite) {
        String name = cleanWhatsappAddress(candidate);
        if (!hasText(name)) {
            return;
        }
        String current = conversation.getContactName();
        if (!hasText(current) || looksLikePhone(current)) {
            conversation.setContactName(name);
            return;
        }
        if (allowOverwrite && !looksLikePhone(name) && !name.equalsIgnoreCase(current)) {
            conversation.setContactName(name);
        }
    }

    private void applyConversationAvatar(WhatsappConversation conversation, JsonNode... nodes) {
        String avatarUrl = "";
        for (JsonNode node : nodes) {
            avatarUrl = firstText(
                    node.path("imgUrl"),
                    node.path("profilePicUrl"),
                    node.path("profilePictureUrl"),
                    node.path("profilePicture"),
                    node.path("profilePicture").path("url"),
                    node.path("profilePicture").path("eurl"),
                    node.path("profilePic"),
                    node.path("profilePic").path("url"),
                    node.path("profilePic").path("eurl"),
                    node.path("picture"),
                    node.path("picture").path("url"),
                    node.path("pictureUrl"),
                    node.path("avatarUrl"),
                    node.path("avatar"),
                    node.path("avatar").path("url"),
                    node.path("photo"),
                    node.path("photo").path("url"),
                    node.path("photoUrl"),
                    node.path("image"));
            if (hasText(avatarUrl)) {
                break;
            }
        }
        if (hasText(avatarUrl)) {
            conversation.setAvatarUrl(avatarUrl.trim());
            conversations.save(conversation);
        }
    }

    private void runBotIfNeeded(UUID storeId, WhatsappIntegration integration, WhatsappConversation conversation, String inboundText) {
        if (!integration.isBotEnabled() || !hasText(integration.getApiKey()) || !hasText(inboundText) || isBotPaused(conversation)) {
            return;
        }
        BotDecision decision = decideBotReply(storeId, integration, conversation, inboundText);
        if (!hasText(decision.text())) {
            return;
        }
        WhatsappMessage reply = sendBotMessage(storeId, conversation.getRemoteJid(), decision.text());
        if (decision.pauseAfterReply()) {
            pauseConversationForToday(reply.getConversation(), "human");
        }
    }

    private BotDecision decideBotReply(UUID storeId, WhatsappIntegration integration, WhatsappConversation conversation, String inboundText) {
        String normalized = normalizeText(inboundText);

        if (containsAny(normalized, handoffKeywords(integration))) {
            return new BotDecision("Certo, vou chamar um atendente para continuar por aqui. O robo fica pausado nesta conversa hoje.", true);
        }
        if (containsAny(normalized, "cardapio", "menu", "link", "fazer pedido", "pedir", "comprar")) {
            return new BotDecision(buildMenuMessage(storeId, integration), false);
        }
        if (containsAny(normalized, "acompanhar", "andamento", "status", "meu pedido", "pedido", "saiu", "entrega", "pronto")) {
            return new BotDecision(buildLatestOrderMessage(storeId, conversation), false);
        }
        if (containsAny(normalized, "pagamento", "pagar", "pix", "cartao", "cartao", "dinheiro", "troco")) {
            return new BotDecision("Aceitamos cartao, dinheiro e combinacao pelo atendimento. Se for dinheiro, informe se precisa de troco no fechamento do pedido.", false);
        }
        if (containsAny(normalized, "horario", "abre", "fecha", "funciona", "aberto")) {
            return new BotDecision(buildScheduleMessage(storeId), false);
        }
        if (containsAny(normalized, "entrega", "delivery", "retirada", "balcao", "endereco")) {
            return new BotDecision("Fazemos retirada no balcao e delivery nas areas atendidas. No cardapio digital voce informa o endereco e ve a taxa antes de finalizar.", false);
        }

        String productReply = buildProductReply(storeId, normalized);
        if (hasText(productReply)) {
            return new BotDecision(productReply, false);
        }

        return new BotDecision(defaultText(integration.getBotFallback(), "Posso te mandar o cardapio, consultar seu pedido ou chamar um atendente. Escreva cardapio, pedido ou atendente."), false);
    }

    private void sendMenuToConversation(UUID storeId, WhatsappConversation conversation) {
        WhatsappIntegration integration = getOrCreate(storeId);
        sendBotMessage(storeId, conversation.getRemoteJid(), buildMenuMessage(storeId, integration));
    }

    private String buildMenuMessage(UUID storeId, WhatsappIntegration integration) {
        String menuUrl = integration.getBotMenuUrl();
        if (!hasText(menuUrl)) {
            menuUrl = stores.findById(storeId)
                    .map(store -> "/loja/" + store.getId())
                    .orElse("");
        }
        return hasText(menuUrl)
                ? "Segue o cardapio digital para fazer seu pedido: " + menuUrl
                : "O link do cardapio digital ainda nao esta configurado. Um atendente pode enviar para voce por aqui.";
    }

    private String buildLatestOrderMessage(UUID storeId, WhatsappConversation conversation) {
        String phone = cleanWhatsappPhone(hasText(conversation.getPhone()) ? conversation.getPhone() : conversation.getRemoteJid());
        Optional<CustomerOrder> latestOrder = customerOrders.findByStoreIdOrderByCreatedAtDesc(storeId).stream()
                .filter(order -> phoneMatches(phone, order.getCustomerPhone()))
                .findFirst();
        if (latestOrder.isEmpty()) {
            return "Nao encontrei um pedido recente vinculado a este WhatsApp. Se voce acabou de pedir pelo cardapio, me envie o numero do pedido ou chame um atendente.";
        }
        return buildOrderStatusMessage(latestOrder.get());
    }

    private String buildOrderCreatedMessage(CustomerOrder order) {
        return "Pedido recebido: " + orderReference(order) + "\n" +
                "Status: " + orderStatusLabel(order.getStatus()) + "\n" +
                "Total: " + formatMoney(order.getTotal()) + "\n" +
                "Vamos avisar por aqui quando ele avancar.";
    }

    private String buildOrderStatusMessage(CustomerOrder order) {
        return orderReference(order) + "\n" +
                "Status: " + orderStatusLabel(order.getStatus()) + "\n" +
                "Entrega: " + fulfillmentLabel(order.getFulfillment()) + "\n" +
                "Total: " + formatMoney(order.getTotal()) + "\n" +
                "Se precisar alterar algo, escreva atendente.";
    }

    private String buildScheduleMessage(UUID storeId) {
        return stores.findById(storeId)
                .map(store -> hasText(store.getSchedule())
                        ? "Nosso horario de atendimento: " + store.getSchedule()
                        : "O horario da loja ainda nao esta configurado no sistema. Posso chamar um atendente se voce precisar confirmar.")
                .orElse("Nao consegui consultar o horario da loja agora.");
    }

    private String buildProductReply(UUID storeId, String normalizedText) {
        if (!hasText(normalizedText) || normalizedText.length() < 3) {
            return "";
        }
        List<String> tokens = List.of(normalizedText.split("\\s+")).stream()
                .filter(token -> token.length() >= 3)
                .toList();
        if (tokens.isEmpty()) {
            return "";
        }
        List<Product> matches = products.findByStoreIdOrderByNameAsc(storeId).stream()
                .filter(Product::isActive)
                .filter(product -> {
                    String productName = normalizeText(product.getName());
                    return tokens.stream().anyMatch(productName::contains);
                })
                .limit(3)
                .toList();
        if (matches.isEmpty()) {
            return "";
        }
        String items = matches.stream()
                .map(product -> product.getName() + " - " + formatMoney(product.getPrice()))
                .reduce((left, right) -> left + "\n" + right)
                .orElse("");
        return "Encontrei no cardapio:\n" + items + "\n\nPara finalizar, peca pelo cardapio digital ou escreva atendente.";
    }

    private boolean isBotPaused(WhatsappConversation conversation) {
        if (conversation.isBotPausedIndefinitely()) {
            return true;
        }
        LocalDateTime pausedUntil = conversation.getBotPausedUntil();
        if (pausedUntil == null) {
            return false;
        }
        if (pausedUntil.isAfter(LocalDateTime.now())) {
            return true;
        }
        resumeConversationBot(conversation);
        return false;
    }

    private void pauseConversationForToday(WhatsappConversation conversation, String status) {
        conversation.setBotPausedIndefinitely(false);
        conversation.setBotPausedUntil(LocalDateTime.now().toLocalDate().plusDays(1).atStartOfDay().minusSeconds(1));
        conversation.setBotStatus(status);
        conversations.save(conversation);
    }

    private void pauseConversationIndefinitely(WhatsappConversation conversation) {
        conversation.setBotPausedIndefinitely(true);
        conversation.setBotPausedUntil(null);
        conversation.setBotStatus("paused");
        conversations.save(conversation);
    }

    private void resumeConversationBot(WhatsappConversation conversation) {
        conversation.setBotPausedIndefinitely(false);
        conversation.setBotPausedUntil(null);
        conversation.setBotStatus("active");
        conversations.save(conversation);
    }

    private static List<String> handoffKeywords(WhatsappIntegration integration) {
        String value = defaultText(integration.getBotHandoffKeywords(), "humano, atendente, ajuda, suporte, pessoa, falar com alguem");
        return List.of(value.split(",")).stream().map(WasenderApiService::normalizeText).filter(WasenderApiService::hasText).toList();
    }

    private static boolean containsAny(String normalized, String... terms) {
        return containsAny(normalized, List.of(terms));
    }

    private static boolean containsAny(String normalized, List<String> terms) {
        return terms.stream().map(WasenderApiService::normalizeText).anyMatch(term -> hasText(term) && normalized.contains(term));
    }

    private static boolean phoneMatches(String left, String right) {
        String a = cleanWhatsappPhone(left);
        String b = cleanWhatsappPhone(right);
        return a.length() >= 8 && b.length() >= 8 && (a.endsWith(b) || b.endsWith(a));
    }

    private static String normalizeText(String value) {
        String text = Normalizer.normalize(Optional.ofNullable(value).orElse(""), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return text.toLowerCase().replaceAll("[^a-z0-9\\s]", " ").replaceAll("\\s+", " ").trim();
    }

    private static String defaultText(String value, String fallback) {
        return hasText(value) ? value.trim() : fallback;
    }

    private static String orderReference(CustomerOrder order) {
        return "Pedido #" + order.getId().toString().substring(0, 8);
    }

    private static String orderStatusLabel(String status) {
        return switch (Optional.ofNullable(status).orElse("")) {
            case "analysis" -> "em analise";
            case "production" -> "em preparo";
            case "ready" -> "pronto";
            case "completed" -> "finalizado";
            case "cancelled" -> "cancelado";
            default -> hasText(status) ? status : "recebido";
        };
    }

    private static String fulfillmentLabel(String fulfillment) {
        return switch (Optional.ofNullable(fulfillment).orElse("")) {
            case "delivery" -> "delivery";
            case "dinein" -> "consumo no local";
            default -> "retirada no balcao";
        };
    }

    private static String formatMoney(BigDecimal value) {
        BigDecimal amount = value == null ? BigDecimal.ZERO : value;
        return "R$ " + amount.setScale(2, RoundingMode.HALF_UP).toPlainString().replace(".", ",");
    }

    public record WhatsappConversationSyncResult(
            List<WhatsappConversation> conversations,
            int imported,
            boolean partial,
            String message) {
    }

    private record BotDecision(String text, boolean pauseAfterReply) {
    }

    private String requireSessionApiKey(WhatsappIntegration integration) {
        if (!hasText(integration.getApiKey()) && hasText(integration.getPersonalAccessToken()) && hasText(integration.getSessionId())) {
            try {
                integration = fetchSessionDetails(integration);
            } catch (RestClientException ex) {
                throw wasenderBadRequest("Nao consegui buscar a API key da sessao na WaSenderAPI.", ex);
            }
        }
        return require(integration.getApiKey(), "Informe a API key da sessao ou salve um Personal Access Token valido junto com o ID numerico da sessao.");
    }

    private Optional<WhatsappConversation> findKnownConversation(UUID storeId, String recipient) {
        Optional<WhatsappConversation> bestMatch = bestMatchingConversation(storeId, recipient);
        if (bestMatch.isPresent()) {
            return bestMatch;
        }
        Optional<WhatsappConversation> byRemoteJid = conversations.findByStoreIdAndRemoteJid(storeId, recipient);
        if (byRemoteJid.isPresent()) {
            return byRemoteJid;
        }
        String phone = cleanWhatsappPhone(recipient);
        if (!hasText(phone)) {
            return Optional.empty();
        }
        Optional<WhatsappConversation> byPhone = conversations.findFirstByStoreIdAndPhone(storeId, phone);
        if (byPhone.isPresent()) {
            return byPhone;
        }
        Optional<WhatsappConversation> byPlusPhone = conversations.findFirstByStoreIdAndPhone(storeId, "+" + phone);
        if (byPlusPhone.isPresent()) {
            return byPlusPhone;
        }
        return Optional.empty();
    }

    private Optional<WhatsappConversation> resolveDisplayConversation(UUID storeId, String address) {
        return bestMatchingConversation(storeId, address)
                .or(() -> conversations.findByStoreIdAndRemoteJid(storeId, address));
    }

    private Optional<WhatsappConversation> bestMatchingConversation(UUID storeId, String address) {
        String lookupAddress = Optional.ofNullable(address).orElse("").trim();
        String lookupPhone = cleanWhatsappPhone(lookupAddress);

        return conversations.findByStoreIdOrderByLastMessageAtDesc(storeId).stream()
                .filter(conversation -> sameWhatsappAddress(conversation, lookupAddress, lookupPhone))
                .sorted((left, right) -> {
                    int contentCompare = Boolean.compare(hasConversationContent(right), hasConversationContent(left));
                    if (contentCompare != 0) {
                        return contentCompare;
                    }
                    return Optional.ofNullable(right.getLastMessageAt()).orElse(LocalDateTime.MIN)
                            .compareTo(Optional.ofNullable(left.getLastMessageAt()).orElse(LocalDateTime.MIN));
                })
                .findFirst();
    }

    private boolean hasConversationContent(WhatsappConversation conversation) {
        return hasText(conversation.getLastMessage())
                || conversation.getUnreadCount() > 0
                || messages.existsByConversation(conversation);
    }

    private static boolean sameWhatsappAddress(WhatsappConversation conversation, String lookupAddress, String lookupPhone) {
        if (!hasText(lookupAddress)) {
            return false;
        }
        String remoteJid = Optional.ofNullable(conversation.getRemoteJid()).orElse("");
        String phone = Optional.ofNullable(conversation.getPhone()).orElse("");
        String cleanRemote = cleanWhatsappAddress(remoteJid);
        String cleanLookup = cleanWhatsappAddress(lookupAddress);

        return remoteJid.equalsIgnoreCase(lookupAddress)
                || cleanRemote.equalsIgnoreCase(cleanLookup)
                || (hasText(lookupPhone) && (
                    phoneMatches(lookupPhone, phone)
                    || phoneMatches(lookupPhone, remoteJid)
                    || phoneMatches(lookupPhone, cleanRemote)
                ));
    }

    private boolean isPhoneRegisteredOnWhatsapp(String apiKey, String recipient) {
        JsonNode response = restClient.get()
                .uri("/api/on-whatsapp/{phone_number}", normalizeInternationalPhone(recipient))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .retrieve()
                .body(JsonNode.class);
        return response != null && response.path("data").path("exists").asBoolean(false);
    }

    private static List<JsonNode> webhookItems(JsonNode payload, String nestedKey) {
        JsonNode items = hasText(nestedKey) ? payload.path("data").path(nestedKey) : payload.path("data");
        if (items.isMissingNode() || items.isNull()) {
            items = payload.path("data");
        }
        List<JsonNode> result = new ArrayList<>();
        if (items.isArray()) {
            items.forEach(result::add);
        } else if (!items.isMissingNode() && !items.isNull()) {
            result.add(items);
        }
        return result;
    }

    private static List<JsonNode> contactItems(JsonNode response) {
        return paginatedDataItems(response);
    }

    private static List<JsonNode> paginatedDataItems(JsonNode response) {
        JsonNode data = response == null ? null : response.path("data");
        JsonNode items = data == null ? null : data.path("items");
        if (items == null || items.isMissingNode()) {
            items = data == null ? null : data.path("data");
        }
        if (items == null || items.isMissingNode()) {
            items = data;
        }
        List<JsonNode> result = new ArrayList<>();
        if (items != null && items.isArray()) {
            items.forEach(result::add);
        }
        return result;
    }

    private String contactSyncFailureMessage(String responseBody, Exception ex) {
        if (hasText(responseBody)) {
            try {
                return contactSyncFailureMessage(objectMapper.readTree(responseBody));
            } catch (Exception ignored) {
                if (responseBody.toLowerCase().contains("took longer")) {
                    return contactSyncTimeoutMessage();
                }
                return "A WaSenderAPI recusou a listagem de contatos. Tente novamente em alguns instantes.";
            }
        }
        String detail = ex == null ? "" : Optional.ofNullable(ex.getMessage()).orElse("");
        if (detail.toLowerCase().contains("timed out") || detail.toLowerCase().contains("timeout")) {
            return contactSyncTimeoutMessage();
        }
        return "Nao foi possivel listar contatos na WaSenderAPI agora. As conversas recebidas por webhook continuam salvas.";
    }

    private String messageLogFailureMessage(String responseBody, Exception ex) {
        if (hasText(responseBody)) {
            try {
                JsonNode response = objectMapper.readTree(responseBody);
                String providerMessage = firstText(
                        response.path("message"),
                        response.path("error"),
                        response.path("detail"));
                return hasText(providerMessage)
                        ? providerMessage
                        : "Nao foi possivel carregar logs de mensagens da WaSenderAPI agora.";
            } catch (Exception ignored) {
                return "Nao foi possivel carregar logs de mensagens da WaSenderAPI agora.";
            }
        }
        String detail = ex == null ? "" : Optional.ofNullable(ex.getMessage()).orElse("");
        if (detail.toLowerCase().contains("timed out") || detail.toLowerCase().contains("timeout")) {
            return "A WaSenderAPI demorou para carregar logs de mensagens. Tente sincronizar novamente em instantes.";
        }
        return "Nao foi possivel carregar logs de mensagens da WaSenderAPI agora.";
    }

    private ResponseStatusException wasenderBadRequest(String fallback, RestClientException ex) {
        String providerMessage = providerMessage(ex);
        String message = hasText(providerMessage) ? fallback + " " + providerMessage : fallback;
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private String providerMessage(RestClientException ex) {
        if (ex instanceof RestClientResponseException responseEx) {
            String body = responseEx.getResponseBodyAsString();
            if (hasText(body)) {
                try {
                    JsonNode response = objectMapper.readTree(body);
                    String message = firstText(
                            response.path("message"),
                            response.path("error"),
                            response.path("detail"));
                    if (hasText(message)) {
                        return message;
                    }
                } catch (Exception ignored) {
                    return body;
                }
            }
        }
        return Optional.ofNullable(ex.getMessage()).orElse("");
    }

    private static String contactSyncFailureMessage(JsonNode response) {
        String providerMessage = firstText(
                response.path("message"),
                response.path("error"),
                response.path("detail"));
        if (providerMessage.toLowerCase().contains("took longer")) {
            return contactSyncTimeoutMessage();
        }
        return hasText(providerMessage)
                ? providerMessage
                : "A WaSenderAPI nao conseguiu concluir a listagem de contatos agora.";
    }

    private static String contactSyncTimeoutMessage() {
        return "A WaSenderAPI demorou para listar contatos. Mantive as conversas ja salvas; novas conversas entram pelo webhook.";
    }

    private static int contactPageCount(JsonNode response) {
        JsonNode data = response == null ? null : response.path("data");
        JsonNode pagination = data == null ? null : data.path("pagination");
        int totalPages = firstPositiveInt(
                pagination == null ? null : pagination.path("totalPages"),
                pagination == null ? null : pagination.path("total_pages"),
                pagination == null ? null : pagination.path("lastPage"),
                pagination == null ? null : pagination.path("last_page"),
                data == null ? null : data.path("last_page"));
        return totalPages <= 0 ? 1 : totalPages;
    }

    private static int firstPositiveInt(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            if (node != null && !node.isMissingNode() && node.asInt(0) > 0) {
                return node.asInt();
            }
        }
        return 0;
    }

    private static LocalDateTime extractTimestamp(JsonNode item, JsonNode payload) {
        JsonNode timestamp = firstPresent(
                item.path("messageTimestamp"),
                item.path("timestamp"),
                item.path("conversationTimestamp"),
                item.path("createdAt"),
                item.path("created_at"),
                payload.path("timestamp"));
        if (timestamp == null || timestamp.isMissingNode() || timestamp.isNull()) {
            return LocalDateTime.now();
        }
        if (timestamp.isNumber()) {
            long raw = timestamp.asLong();
            if (raw <= 0) {
                return LocalDateTime.now();
            }
            long millis = raw > 9_999_999_999L ? raw : raw * 1000L;
            return LocalDateTime.ofInstant(Instant.ofEpochMilli(millis), ZoneOffset.UTC);
        }
        String text = timestamp.asText("");
        if (!hasText(text)) {
            return LocalDateTime.now();
        }
        try {
            return LocalDateTime.parse(text.replace(' ', 'T'));
        } catch (DateTimeParseException ignored) {
            return LocalDateTime.now();
        }
    }

    private static JsonNode firstPresent(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            if (node != null && !node.isMissingNode() && !node.isNull() && hasText(node.asText())) {
                return node;
            }
        }
        return null;
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            return "{}";
        }
    }

    private static String messageText(JsonNode item) {
        JsonNode message = item.path("message");
        return firstText(
                item.path("messageBody"),
                item.path("body"),
                item.path("text"),
                item.path("content"),
                item.path("caption"),
                message.path("conversation"),
                message.path("extendedTextMessage").path("text"),
                message.path("imageMessage").path("caption"),
                message.path("videoMessage").path("caption"),
                message.path("documentMessage").path("caption"),
                message.path("buttonsResponseMessage").path("selectedDisplayText"),
                message.path("listResponseMessage").path("title"));
    }

    private static String mediaMessageLabel(JsonNode item) {
        JsonNode message = item.path("message");
        if (message.path("imageMessage").isObject()) return "[imagem]";
        if (message.path("videoMessage").isObject()) return "[video]";
        if (message.path("audioMessage").isObject()) return "[audio]";
        if (message.path("documentMessage").isObject()) return "[documento]";
        if (message.path("stickerMessage").isObject()) return "[figurinha]";
        if (message.path("locationMessage").isObject()) return "[localizacao]";
        if (message.path("contactMessage").isObject() || message.path("contactsArrayMessage").isObject()) return "[contato]";
        return "";
    }

    private String messageLogText(JsonNode content) {
        if (content == null || content.isMissingNode() || content.isNull()) {
            return "";
        }
        if (content.isObject()) {
            return firstText(
                    content.path("text"),
                    content.path("body"),
                    content.path("message"),
                    content.path("caption"),
                    content.path("conversation"));
        }
        String raw = content.asText("");
        if (!hasText(raw)) {
            return "";
        }
        String trimmed = raw.trim();
        if (trimmed.startsWith("{")) {
            try {
                JsonNode parsed = objectMapper.readTree(trimmed);
                String parsedText = firstText(
                        parsed.path("text"),
                        parsed.path("body"),
                        parsed.path("message"),
                        parsed.path("caption"),
                        parsed.path("conversation"));
                if (hasText(parsedText)) {
                    return parsedText;
                }
            } catch (Exception ignored) {
                return trimmed;
            }
        }
        return trimmed;
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

    private static String normalizeBrazilianWhatsappPhone(String value) {
        String phone = Optional.ofNullable(value).orElse("").replaceAll("\\D", "");
        if (phone.length() == 10 || phone.length() == 11) {
            phone = "55" + phone;
        }
        if (phone.length() < 12 || phone.length() > 15) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe um WhatsApp valido para notificacao do pedido.");
        }
        return "+" + phone;
    }

    private static String normalizeRecipient(String value) {
        String recipient = Optional.ofNullable(value).orElse("").trim();
        if (!hasText(recipient) || recipient.contains("@")) {
            return recipient;
        }
        return normalizeInternationalPhone(recipient);
    }

    private static String normalizeContactAddress(String value) {
        String contact = Optional.ofNullable(value).orElse("").trim();
        if (!hasText(contact) || contact.contains("@")) {
            return contact;
        }
        String phone = cleanWhatsappPhone(contact);
        return hasText(phone) ? phone : contact;
    }

    private static boolean isPhoneAddress(String value) {
        return hasText(value) && !value.contains("@") && value.replaceAll("\\D", "").length() >= 10;
    }

    private static boolean looksLikePhone(String value) {
        String phone = Optional.ofNullable(value).orElse("").replaceAll("\\D", "");
        return phone.length() >= 8 && phone.length() >= Optional.ofNullable(value).orElse("").replaceAll("\\s", "").length() - 2;
    }

    private static String cleanWhatsappPhone(String value) {
        String text = cleanWhatsappAddress(value);
        return text.replaceAll("[^\\d+]", "");
    }

    private static String cleanWhatsappAddress(String value) {
        return Optional.ofNullable(value).orElse("")
                .replace("@s.whatsapp.net", "")
                .replace("@c.us", "")
                .replace("@lid", "")
                .replace("@g.us", "")
                .trim();
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
