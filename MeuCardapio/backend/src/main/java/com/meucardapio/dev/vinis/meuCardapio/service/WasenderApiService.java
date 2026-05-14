package com.meucardapio.dev.vinis.meuCardapio.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
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

import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappConversationPatchRequest;
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
            "message-receipt.update",
            "messages.delete",
            "session.status");

    private final StoreRepository stores;
    private final WhatsappIntegrationRepository integrations;
    private final WhatsappConversationRepository conversations;
    private final WhatsappMessageRepository messages;
    private final CustomerOrderRepository customerOrders;
    private final ProductRepository products;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final RestClient externalRestClient;

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
        this.externalRestClient = RestClient.builder().build();
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
            String botHandoffKeywords,
            String botTrainingJson) {
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
        if (botTrainingJson != null) integration.setBotTrainingJson(normalizeBotTrainingJson(botTrainingJson));
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
    public WhatsappConversation updateConversation(UUID storeId, String remoteJid, WhatsappConversationPatchRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe os dados da conversa.");
        }
        WhatsappConversation conversation = resolveDisplayConversation(storeId, remoteJid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversa nao encontrada"));
        if (request.assignedAgent() != null) {
            conversation.setAssignedAgent(trimToNull(request.assignedAgent(), 80));
        }
        if (request.label() != null) {
            conversation.setLabel(trimToNull(request.label(), 80));
        }
        if (request.favorite() != null) {
            conversation.setFavorite(request.favorite());
        }
        if (request.pinned() != null) {
            conversation.setPinned(request.pinned());
        }
        if (request.pinnedNote() != null) {
            conversation.setPinnedNote(trimToNull(request.pinnedNote(), 1000));
        }
        return conversations.save(conversation);
    }

    @Transactional
    public WhatsappConversation refreshConversationAvatar(UUID storeId, String remoteJid) {
        WhatsappIntegration integration = getOrCreate(storeId);
        WhatsappConversation conversation = resolveDisplayConversation(storeId, remoteJid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversa nao encontrada"));
        String apiKey;
        try {
            apiKey = requireSessionApiKey(integration);
        } catch (ResponseStatusException ex) {
            return conversation;
        }
        String avatarUrl = fetchProfilePictureUrl(apiKey, conversation);
        if (hasText(avatarUrl)) {
            conversation.setAvatarUrl(avatarUrl.trim());
            return conversations.save(conversation);
        }
        return conversation;
    }

    @Transactional
    public WhatsappAvatarImage avatarImage(UUID storeId, String remoteJid) {
        WhatsappConversation conversation = refreshConversationAvatar(storeId, remoteJid);
        String avatarUrl = conversation.getAvatarUrl();
        if (!hasText(avatarUrl)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Foto de perfil nao encontrada.");
        }
        URI uri = URI.create(avatarUrl.trim());
        if (!"https".equalsIgnoreCase(uri.getScheme()) && !"http".equalsIgnoreCase(uri.getScheme())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "URL de foto invalida.");
        }
        try {
            var response = externalRestClient.get()
                    .uri(uri)
                    .retrieve()
                    .toEntity(byte[].class);
            byte[] content = response.getBody();
            if (content == null || content.length == 0) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Foto de perfil vazia.");
            }
            String contentType = Optional.ofNullable(response.getHeaders().getContentType())
                    .map(MediaType::toString)
                    .orElse(MediaType.IMAGE_JPEG_VALUE);
            return new WhatsappAvatarImage(content, contentType);
        } catch (RestClientException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Nao consegui carregar a foto de perfil.");
        }
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
        if (order == null) {
            return Optional.empty();
        }
        return notifyOrderByWhatsapp(order, buildOrderCreatedMessage(order));
    }

    @Transactional
    public Optional<WhatsappMessage> notifyOrderStatusChanged(CustomerOrder order) {
        if (order == null) {
            return Optional.empty();
        }
        return notifyOrderByWhatsapp(order, buildOrderStatusChangedMessage(order));
    }

    private Optional<WhatsappMessage> notifyOrderByWhatsapp(CustomerOrder order, String text) {
        if (order == null || !hasText(order.getCustomerPhone())) {
            return Optional.empty();
        }
        WhatsappIntegration integration = integrations.findById(order.getStore().getId()).orElse(null);
        if (integration == null || !integration.isBotEnabled() || !hasText(text)) {
            return Optional.empty();
        }
        String apiKey = requireSessionApiKey(integration);
        String recipient = normalizeBrazilianWhatsappPhone(order.getCustomerPhone());
        Optional<WhatsappConversation> knownConversation = findKnownConversation(order.getStore().getId(), recipient);
        if (knownConversation.isEmpty() && !isPhoneRegisteredOnWhatsapp(apiKey, recipient)) {
            return Optional.empty();
        }
        WhatsappMessage sent = sendOutboundMessage(order.getStore().getId(), recipient, text, false, false, true);
        applyConversationName(sent.getConversation(), order.getCustomerName(), true);
        conversations.save(sent.getConversation());
        return Optional.of(sent);
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
        if (event.equals("messages.update") || event.equals("message-receipt.update")) {
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
        JsonNode data = payload.path("data");
        String messageId = firstText(
                data.path("key").path("id"),
                data.path("id"),
                data.path("messageId"),
                data.path("msgId"));
        if (!hasText(messageId)) return;
        messages.findFirstByStoreIdAndProviderMessageId(storeId, messageId).ifPresent(message -> {
            String status = firstText(
                    data.path("update").path("status"),
                    data.path("status"),
                    data.path("receipt"),
                    data.path("type"));
            message.setStatus(hasText(status) ? status : message.getStatus());
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
        String phone = extractedPhone(remoteJid, key, item);
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
        String phone = extractedPhone(remoteJid, item);
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
        String phone = extractedPhone(remoteJid, contact);
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
            avatarUrl = avatarUrlFrom(node);
            if (hasText(avatarUrl)) {
                break;
            }
        }
        if (hasText(avatarUrl)) {
            conversation.setAvatarUrl(avatarUrl.trim());
            conversations.save(conversation);
        }
    }

    private String fetchProfilePictureUrl(String apiKey, WhatsappConversation conversation) {
        String remoteJid = Optional.ofNullable(conversation.getRemoteJid()).orElse("");
        if (isGroupAddress(remoteJid)) {
            try {
                JsonNode response = restClient.get()
                        .uri("/api/groups/{groupJid}/picture", remoteJid)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                        .retrieve()
                        .body(JsonNode.class);
                JsonNode payload = response == null ? objectMapper.createObjectNode() : response;
                String avatarUrl = avatarUrlFrom(payload.path("data"));
                return hasText(avatarUrl) ? avatarUrl : avatarUrlFrom(payload);
            } catch (RestClientException ex) {
                return "";
            }
        }

        for (String contact : profilePictureContactAddresses(apiKey, conversation)) {
            try {
                JsonNode response = restClient.get()
                        .uri("/api/contacts/{contactPhoneNumber}/picture", contact)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                        .retrieve()
                        .body(JsonNode.class);
                JsonNode payload = response == null ? objectMapper.createObjectNode() : response;
                String avatarUrl = avatarUrlFrom(payload.path("data"));
                if (hasText(avatarUrl)) {
                    return avatarUrl;
                }
                avatarUrl = avatarUrlFrom(payload);
                if (hasText(avatarUrl)) {
                    return avatarUrl;
                }
            } catch (RestClientException ex) {
                // Try the next address shape; WaSenderAPI may require phone, +phone, or JID.
            }
        }
        return "";
    }

    private List<String> profilePictureContactAddresses(String apiKey, WhatsappConversation conversation) {
        List<String> candidates = new ArrayList<>();
        String remoteJid = Optional.ofNullable(conversation.getRemoteJid()).orElse("").trim();
        if (remoteJid.toLowerCase().contains("@lid")) {
            String resolvedPhone = phoneNumberFromLid(apiKey, remoteJid);
            if (hasText(resolvedPhone)) {
                conversation.setPhone(resolvedPhone);
                conversations.save(conversation);
                addProfilePictureCandidate(candidates, resolvedPhone);
            }
        }
        addProfilePictureCandidate(candidates, conversation.getPhone());
        addProfilePictureCandidate(candidates, remoteJid);
        String cleanRemote = cleanWhatsappAddress(remoteJid);
        addProfilePictureCandidate(candidates, cleanRemote);
        if (hasText(cleanRemote) && cleanRemote.replaceAll("\\D", "").length() >= 10) {
            addProfilePictureCandidate(candidates, cleanRemote + "@s.whatsapp.net");
        }
        return candidates;
    }

    private static void addProfilePictureCandidate(List<String> candidates, String value) {
        String candidate = Optional.ofNullable(value).orElse("").trim();
        if (!hasText(candidate)) {
            return;
        }
        if (candidate.contains("@")) {
            if (!candidates.contains(candidate)) {
                candidates.add(candidate);
            }
            String phone = cleanWhatsappPhone(candidate);
            if (hasText(phone)) {
                addProfilePictureCandidate(candidates, phone);
            }
            return;
        }
        String phone = cleanWhatsappPhone(candidate);
        if (!hasText(phone)) {
            return;
        }
        String digits = phone.replace("+", "");
        for (String option : List.of(digits, "+" + digits, digits + "@s.whatsapp.net")) {
            if (hasText(option) && !candidates.contains(option)) {
                candidates.add(option);
            }
        }
    }

    private String phoneNumberFromLid(String apiKey, String lid) {
        try {
            JsonNode response = restClient.get()
                    .uri("/api/pn-from-lid/{lid}", lid)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .retrieve()
                    .body(JsonNode.class);
            return cleanWhatsappPhone(firstText(
                    response == null ? null : response.path("data").path("phone"),
                    response == null ? null : response.path("data").path("pn"),
                    response == null ? null : response.path("data").path("jid"),
                    response == null ? null : response.path("phone"),
                    response == null ? null : response.path("pn"),
                    response == null ? null : response.path("jid")));
        } catch (RestClientException ex) {
            return "";
        }
    }

    private static String avatarUrlFrom(JsonNode node) {
        return firstText(
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
    }

    private void runBotIfNeeded(UUID storeId, WhatsappIntegration integration, WhatsappConversation conversation, String inboundText) {
        if (!integration.isBotEnabled() || !hasText(integration.getApiKey()) || !hasText(inboundText) || isBotPaused(conversation)) {
            return;
        }
        BotDecision decision = decideBotReply(storeId, integration, conversation, inboundText);
        decision = applyUnknownFallbackPolicy(conversation, decision);
        if (!hasText(decision.text())) {
            return;
        }
        WhatsappMessage reply = sendBotMessage(storeId, conversation.getRemoteJid(), decision.text());
        if (decision.pauseAfterReply()) {
            pauseConversationForToday(reply.getConversation(), "human");
        }
    }

    private BotDecision applyUnknownFallbackPolicy(WhatsappConversation conversation, BotDecision decision) {
        if (!"UNKNOWN".equals(decision.intent())) {
            if (Optional.ofNullable(conversation.getBotStatus()).orElse("").startsWith("unknown_")) {
                conversation.setBotStatus("active");
                conversations.save(conversation);
            }
            return decision;
        }
        int attempts = unknownAttemptCount(conversation) + 1;
        if (attempts >= 3) {
            conversation.setBotStatus("human");
            conversations.save(conversation);
            return new BotDecision("HUMAN_SUPPORT", 100, buildHandoffMessage("Ainda nao consegui entender sua solicitacao. Vou chamar um atendente."), true);
        }
        conversation.setBotStatus("unknown_" + attempts);
        conversations.save(conversation);
        return decision;
    }

    private static int unknownAttemptCount(WhatsappConversation conversation) {
        String status = Optional.ofNullable(conversation.getBotStatus()).orElse("");
        if (!status.startsWith("unknown_")) {
            return 0;
        }
        try {
            return Integer.parseInt(status.substring("unknown_".length()));
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    public WhatsappBotTestResult testBot(UUID storeId, String inboundText, String remoteJid) {
        WhatsappIntegration integration = getOrCreate(storeId);
        WhatsappConversation conversation = null;
        if (hasText(remoteJid)) {
            conversation = resolveDisplayConversation(storeId, remoteJid).orElse(null);
        }
        if (conversation == null) {
            conversation = new WhatsappConversation(UUID.randomUUID(), storeId, hasText(remoteJid) ? remoteJid : "5511999999999@s.whatsapp.net");
            conversation.setContactName("Cliente teste");
            conversation.setPhone(cleanWhatsappPhone(conversation.getRemoteJid()));
        }
        BotDecision decision = decideBotReply(storeId, integration, conversation, inboundText);
        return new WhatsappBotTestResult(decision.intent(), decision.confidence(), decision.pauseAfterReply(), decision.text());
    }

    private BotDecision decideBotReply(UUID storeId, WhatsappIntegration integration, WhatsappConversation conversation, String inboundText) {
        String normalized = normalizeText(inboundText);
        if (!hasText(normalized)) {
            return new BotDecision("UNKNOWN", 0, "", false);
        }

        if (isMediaMessage(inboundText, normalized)) {
            return new BotDecision("UNKNOWN", 62, buildMediaReply(normalized), false);
        }

        JsonNode training = botTraining(integration);
        BotIntentMatch customMatch = bestCustomIntentMatch(training, normalized);
        BotIntentMatch faqMatch = bestFaqMatch(training, normalized);
        BotIntentMatch fixedMatch = bestFixedIntentMatch(training, normalized);

        if (containsAny(normalized, handoffKeywords(integration, training))) {
            return new BotDecision("HUMAN_SUPPORT", 100, buildIntentResponse(storeId, integration, conversation, "HUMAN_SUPPORT", inboundText, training), true);
        }
        if (containsAny(normalized, humanEscalationKeywords(training))) {
            return new BotDecision("HUMAN_SUPPORT", 100, buildHandoffMessage("Vou chamar um atendente para verificar isso com cuidado."), true);
        }

        if (customMatch.score() >= 55 && customMatch.score() >= faqMatch.score() && customMatch.score() >= fixedMatch.score()) {
            String response = renderBotTemplate(customMatch.response(), storeId, integration, conversation);
            return new BotDecision(customMatch.intent(), customMatch.score(), response, customMatch.humanEscalation());
        }

        if (faqMatch.score() >= 60 && faqMatch.score() >= fixedMatch.score()) {
            String response = renderBotTemplate(faqMatch.response(), storeId, integration, conversation);
            return new BotDecision("FAQ", faqMatch.score(), response, faqMatch.humanEscalation());
        }

        if (fixedMatch.score() >= 45) {
            boolean human = "HUMAN_SUPPORT".equals(fixedMatch.intent());
            return new BotDecision(
                    fixedMatch.intent(),
                    fixedMatch.score(),
                    buildIntentResponse(storeId, integration, conversation, fixedMatch.intent(), inboundText, training),
                    human);
        }

        String productReply = buildProductReply(storeId, normalized);
        if (hasText(productReply)) {
            return new BotDecision("VIEW_CATALOG", 48, productReply, false);
        }

        return new BotDecision("UNKNOWN", 25, buildIntentResponse(storeId, integration, conversation, "UNKNOWN", inboundText, training), false);
    }

    private BotIntentMatch bestFixedIntentMatch(JsonNode training, String normalized) {
        String numberIntent = switch (normalized) {
            case "1" -> "MAKE_ORDER";
            case "2" -> "VIEW_CATALOG";
            case "3" -> "OPENING_HOURS";
            case "4" -> "DELIVERY_INFO";
            case "5" -> "PAYMENT_METHODS";
            case "6" -> "ORDER_STATUS";
            case "7" -> "HUMAN_SUPPORT";
            default -> "";
        };
        if (hasText(numberIntent)) {
            return new BotIntentMatch(numberIntent, 100, "", "HUMAN_SUPPORT".equals(numberIntent));
        }

        BotIntentMatch best = new BotIntentMatch("UNKNOWN", 0, "", false);
        for (String intent : fixedBotIntents()) {
            int score = keywordScore(normalized, keywordsForIntent(training, intent));
            if ("WELCOME".equals(intent) && isGreeting(normalized)) {
                score = Math.max(score, 88);
            }
            if (score > best.score()) {
                best = new BotIntentMatch(intent, Math.min(100, score), "", "HUMAN_SUPPORT".equals(intent));
            }
        }
        return best;
    }

    private BotIntentMatch bestFaqMatch(JsonNode training, String normalized) {
        BotIntentMatch best = new BotIntentMatch("FAQ", 0, "", false);
        JsonNode faq = training.path("faq");
        if (faq == null || !faq.isArray()) {
            return best;
        }
        List<JsonNode> items = new ArrayList<>();
        faq.forEach(items::add);
        for (JsonNode item : items) {
            if (item.path("enabled").isBoolean() && !item.path("enabled").asBoolean(true)) {
                continue;
            }
            List<String> keywords = keywordsFromNode(item.path("keywords"));
            String question = item.path("question").asText("");
            if (hasText(question)) {
                keywords.add(question);
            }
            int score = keywordScore(normalized, keywords);
            if (score > best.score()) {
                best = new BotIntentMatch("FAQ", Math.min(100, score), item.path("answer").asText(""), item.path("callHumanAfterAnswer").asBoolean(false));
            }
        }
        return best;
    }

    private BotIntentMatch bestCustomIntentMatch(JsonNode training, String normalized) {
        BotIntentMatch best = new BotIntentMatch("UNKNOWN", 0, "", false);
        JsonNode intents = training.path("customIntents");
        if (intents == null || !intents.isArray()) {
            return best;
        }
        List<JsonNode> items = new ArrayList<>();
        intents.forEach(items::add);
        for (JsonNode item : items) {
            if (item.path("enabled").isBoolean() && !item.path("enabled").asBoolean(true)) {
                continue;
            }
            int score = keywordScore(normalized, keywordsFromNode(item.path("keywords")));
            if (score > best.score()) {
                String intent = defaultText(item.path("id").asText(""), defaultText(item.path("name").asText(""), "CUSTOM"));
                best = new BotIntentMatch(intent, Math.min(100, score), item.path("response").asText(""), item.path("humanEscalation").asBoolean(false));
            }
        }
        return best;
    }

    private String buildIntentResponse(UUID storeId, WhatsappIntegration integration, WhatsappConversation conversation, String intent, String inboundText, JsonNode training) {
        String configured = configuredResponse(training, intent);
        if (hasText(configured)) {
            return renderBotTemplate(configured, storeId, integration, conversation);
        }
        return switch (intent) {
            case "WELCOME" -> buildWelcomeMessage(storeId, integration, conversation);
            case "MAKE_ORDER" -> buildMakeOrderMessage(storeId, integration, training);
            case "VIEW_CATALOG" -> buildMenuMessage(storeId, integration);
            case "OPENING_HOURS" -> buildScheduleMessage(storeId);
            case "DELIVERY_INFO" -> buildDeliveryMessage(storeId, training);
            case "PAYMENT_METHODS" -> buildPaymentMessage(training);
            case "ORDER_STATUS" -> buildLatestOrderMessage(storeId, conversation, inboundText);
            case "STORE_ADDRESS" -> buildAddressMessage(storeId);
            case "PROMOTIONS" -> buildPromotionsMessage(storeId, integration, training);
            case "HUMAN_SUPPORT" -> buildHandoffMessage("Certo. Vou chamar um atendente para te ajudar.");
            default -> buildFallbackMessage(storeId, integration, conversation);
        };
    }

    private String buildMakeOrderMessage(UUID storeId, WhatsappIntegration integration, JsonNode training) {
        String orderMode = normalizeText(training.path("orderMode").asText(""));
        String menuUrl = resolveMenuUrl(storeId, integration);
        if ("catalog_only".equals(orderMode) || "catalogo".equals(orderMode)) {
            return hasText(menuUrl)
                    ? "Para evitar erros, os pedidos sao feitos pelo catalogo online:\n" + menuUrl
                    : "Os pedidos devem ser feitos pelo catalogo online, mas o link ainda nao esta configurado. Vou chamar um atendente.";
        }
        if ("whatsapp".equals(orderMode)) {
            return hasText(menuUrl)
                    ? "Pode me enviar seu pedido por aqui. Se quiser ver os produtos antes, acesse:\n" + menuUrl
                    : "Pode me enviar seu pedido por aqui.";
        }
        return buildMenuMessage(storeId, integration);
    }

    private String buildPaymentMessage(JsonNode training) {
        String payment = firstText(training.path("paymentMethods"), training.path("formasPagamento"));
        return hasText(payment)
                ? "Aceitamos as seguintes formas de pagamento:\n" + payment
                : "As formas de pagamento aparecem no fechamento do catalogo digital. Se precisar de uma condicao diferente, escreva atendente.";
    }

    private String buildDeliveryMessage(UUID storeId, JsonNode training) {
        boolean deliveryEnabled = !training.path("deliveryEnabled").isBoolean() || training.path("deliveryEnabled").asBoolean(true);
        boolean pickupEnabled = !training.path("pickupEnabled").isBoolean() || training.path("pickupEnabled").asBoolean(true);
        String regions = firstText(training.path("deliveryRegions"), training.path("listaBairrosEntrega"));
        String fees = firstText(training.path("deliveryFees"), training.path("taxasEntrega"));
        String prep = firstText(training.path("averagePrepTime"), training.path("tempoMedioPreparo"));

        if (!deliveryEnabled && pickupEnabled) {
            return "No momento nao trabalhamos com entrega.\n\nVoce pode retirar no endereco:\n" + storeAddress(storeId);
        }
        if (deliveryEnabled && !pickupEnabled) {
            return "Trabalhamos apenas com entrega no momento."
                    + (hasText(regions) ? "\n\nRegioes atendidas:\n" + regions : "")
                    + (hasText(fees) ? "\n\nTaxas:\n" + fees : "")
                    + (hasText(prep) ? "\n\nTempo medio:\n" + prep : "");
        }
        String configured = (hasText(regions) ? "Regioes atendidas:\n" + regions + "\n\n" : "")
                + (hasText(fees) ? "Taxas:\n" + fees + "\n\n" : "")
                + (hasText(prep) ? "Tempo medio de preparo:\n" + prep : "");
        if (hasText(configured)) {
            return "Trabalhamos com entrega e retirada.\n\n" + configured.trim();
        }
        return buildDeliveryMessage(storeId);
    }

    private String buildAddressMessage(UUID storeId) {
        return "Nosso endereco e:\n" + storeAddress(storeId);
    }

    private String buildPromotionsMessage(UUID storeId, WhatsappIntegration integration, JsonNode training) {
        String promotions = firstText(training.path("promotions"), training.path("promocoes"));
        if (hasText(promotions)) {
            return "Promocoes disponiveis:\n" + promotions;
        }
        return "No momento nao temos promocoes cadastradas.\n\nVoce pode ver nossos produtos aqui:\n" + resolveMenuUrl(storeId, integration);
    }

    private String configuredResponse(JsonNode training, String intent) {
        return firstText(
                training.path("responses").path(intent),
                training.path("intentResponses").path(intent),
                training.path("respostas").path(intent));
    }

    private JsonNode botTraining(WhatsappIntegration integration) {
        if (integration == null || !hasText(integration.getBotTrainingJson())) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(integration.getBotTrainingJson());
        } catch (Exception ex) {
            return objectMapper.createObjectNode();
        }
    }

    private String normalizeBotTrainingJson(String value) {
        String text = Optional.ofNullable(value).orElse("").trim();
        if (!hasText(text)) {
            return "";
        }
        try {
            return objectMapper.writeValueAsString(objectMapper.readTree(text));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "JSON de treinamento do robo invalido.");
        }
    }

    private List<String> keywordsForIntent(JsonNode training, String intent) {
        List<String> keywords = new ArrayList<>(defaultIntentKeywords(intent));
        keywords.addAll(keywordsFromNode(training.path("intentKeywords").path(intent)));
        keywords.addAll(keywordsFromNode(training.path("keywords").path(intent)));
        return keywords;
    }

    private static int keywordScore(String normalized, List<String> keywords) {
        int score = 0;
        for (String keyword : keywords) {
            String term = normalizeText(keyword);
            if (!hasText(term)) {
                continue;
            }
            if (normalized.equals(term)) {
                score += 35;
            } else if (normalized.contains(term)) {
                score += term.contains(" ") ? 25 : 16;
            } else {
                String[] parts = term.split("\\s+");
                int hits = 0;
                for (String part : parts) {
                    if (part.length() >= 3 && normalized.contains(part)) {
                        hits += 1;
                    }
                }
                if (hits > 0 && hits == parts.length) {
                    score += 12;
                }
            }
        }
        if (normalized.length() <= 3 && score < 35) {
            score = Math.max(0, score - 8);
        }
        return Math.min(100, score);
    }

    private static List<String> keywordsFromNode(JsonNode node) {
        List<String> values = new ArrayList<>();
        if (node == null || node.isMissingNode() || node.isNull()) {
            return values;
        }
        if (node.isArray()) {
            node.forEach(item -> {
                String value = item.asText("");
                if (hasText(value)) {
                    values.add(value);
                }
            });
            return values;
        }
        String raw = node.asText("");
        if (hasText(raw)) {
            for (String item : raw.split(",")) {
                if (hasText(item)) {
                    values.add(item.trim());
                }
            }
        }
        return values;
    }

    private static List<String> fixedBotIntents() {
        return List.of("WELCOME", "MAKE_ORDER", "VIEW_CATALOG", "OPENING_HOURS", "DELIVERY_INFO", "PAYMENT_METHODS", "ORDER_STATUS", "STORE_ADDRESS", "PROMOTIONS", "HUMAN_SUPPORT");
    }

    private static List<String> defaultIntentKeywords(String intent) {
        return switch (intent) {
            case "WELCOME" -> List.of("oi", "ola", "bom dia", "boa tarde", "boa noite", "iniciar", "menu");
            case "MAKE_ORDER" -> List.of("quero pedir", "fazer pedido", "como faco pedido", "comprar", "encomendar", "pedido");
            case "VIEW_CATALOG" -> List.of("cardapio", "catalogo", "produtos", "menu", "lista de precos", "link");
            case "OPENING_HOURS" -> List.of("horario", "abre", "fecha", "funciona", "aberto", "abre hoje", "fecha que horas");
            case "DELIVERY_INFO" -> List.of("entrega", "delivery", "retirada", "bairro", "taxa", "frete", "tempo", "demora");
            case "PAYMENT_METHODS" -> List.of("pagamento", "pagar", "pix", "cartao", "credito", "debito", "dinheiro", "troco", "maquininha");
            case "ORDER_STATUS" -> List.of("acompanhar", "andamento", "status", "meu pedido", "pedido atrasou", "cade meu pedido", "saiu", "pronto");
            case "STORE_ADDRESS" -> List.of("endereco", "onde fica", "localizacao", "como chegar", "retirar ai");
            case "PROMOTIONS" -> List.of("promocao", "promocoes", "cupom", "desconto", "oferta", "combo");
            case "HUMAN_SUPPORT" -> List.of("atendente", "humano", "falar com alguem", "suporte", "cancelar", "reembolso", "pedido errado", "veio errado", "nao chegou", "atrasou", "reclamacao");
            default -> List.of();
        };
    }

    private static List<String> humanEscalationKeywords(JsonNode training) {
        List<String> keywords = new ArrayList<>(defaultIntentKeywords("HUMAN_SUPPORT"));
        keywords.addAll(keywordsFromNode(training.path("humanRules").path("keywords")));
        keywords.addAll(keywordsFromNode(training.path("humanEscalationKeywords")));
        return keywords;
    }

    private String storeAddress(UUID storeId) {
        return stores.findById(storeId)
                .map(store -> {
                    List<String> parts = new ArrayList<>();
                    if (hasText(store.getStreet())) parts.add(store.getStreet());
                    if (hasText(store.getNumber())) parts.add(store.getNumber());
                    if (hasText(store.getDistrict())) parts.add(store.getDistrict());
                    if (hasText(store.getCityName())) parts.add(store.getCityName());
                    if (hasText(store.getState())) parts.add(store.getState());
                    String address = String.join(", ", parts);
                    return hasText(address) ? address : "Endereco ainda nao configurado.";
                })
                .orElse("Endereco ainda nao configurado.");
    }

    private boolean isMediaMessage(String inboundText, String normalized) {
        String raw = Optional.ofNullable(inboundText).orElse("").trim();
        return raw.startsWith("[") && raw.endsWith("]")
                && containsAny(normalized, "audio", "imagem", "video", "documento", "figurinha", "localizacao", "contato");
    }

    private String buildMediaReply(String normalized) {
        if (containsAny(normalized, "audio")) {
            return "Recebi seu audio. Para agilizar e evitar erro no pedido, me envie por texto se voce quer cardapio, acompanhar pedido ou falar com atendente.";
        }
        if (containsAny(normalized, "localizacao")) {
            return "Recebi a localizacao. Para calcular entrega corretamente, finalize pelo cardapio digital ou escreva atendente.";
        }
        return "Recebi seu arquivo. Por enquanto consigo responder melhor por texto. Escreva cardapio, pedido ou atendente.";
    }

    private String buildHandoffMessage(String lead) {
        return lead + "\nO robo fica pausado nesta conversa hoje para a equipe assumir.";
    }

    private boolean isGreeting(String normalized) {
        return normalized.equals("oi")
                || normalized.equals("ola")
                || normalized.equals("oie")
                || normalized.equals("bom dia")
                || normalized.equals("boa tarde")
                || normalized.equals("boa noite")
                || containsAny(normalized, "quero pedir", "fazer pedido", "iniciar atendimento", "inicio");
    }

    private String buildWelcomeMessage(UUID storeId, WhatsappIntegration integration, WhatsappConversation conversation) {
        Store store = stores.findById(storeId).orElse(null);
        String fallback = "{saudacao}! Sou o atendimento automatico" + (store != null && hasText(store.getTradeName()) ? " da " + store.getTradeName() : "") + ".";
        String welcome = renderBotTemplate(defaultText(integration.getBotWelcome(), fallback), storeId, integration, conversation);
        return welcome + "\n\n" +
                buildMenuMessage(storeId, integration) + "\n\n" +
                "Tambem posso consultar seu pedido. Para falar com a equipe, escreva atendente.";
    }

    private String buildFallbackMessage(UUID storeId, WhatsappIntegration integration, WhatsappConversation conversation) {
        String fallback = "Posso te ajudar com:\n" +
                "1. Cardapio digital\n" +
                "2. Acompanhar pedido\n" +
                "3. Pagamento, entrega ou horario\n" +
                "4. Chamar atendente\n\n" +
                "Escreva cardapio, pedido ou atendente.";
        return renderBotTemplate(defaultText(integration.getBotFallback(), fallback), storeId, integration, conversation);
    }

    private void sendMenuToConversation(UUID storeId, WhatsappConversation conversation) {
        WhatsappIntegration integration = getOrCreate(storeId);
        sendBotMessage(storeId, conversation.getRemoteJid(), buildMenuMessage(storeId, integration));
    }

    private String renderBotTemplate(String text, UUID storeId, WhatsappIntegration integration, WhatsappConversation conversation) {
        String menuUrl = resolveMenuUrl(storeId, integration);
        JsonNode training = botTraining(integration);
        Store store = stores.findById(storeId).orElse(null);
        String username = Optional.ofNullable(conversation)
                .map(WhatsappConversation::getContactName)
                .filter(name -> hasText(name) && !looksLikePhone(name))
                .orElse("cliente");
        String storeName = store != null && hasText(store.getTradeName()) ? store.getTradeName() : "loja";
        String schedule = store != null && hasText(store.getSchedule()) ? store.getSchedule() : firstText(training.path("openingHours"), training.path("horarioFuncionamento"));
        String address = storeAddress(storeId);
        String payment = firstText(training.path("paymentMethods"), training.path("formasPagamento"));
        String regions = firstText(training.path("deliveryRegions"), training.path("listaBairrosEntrega"));
        String prepTime = firstText(training.path("averagePrepTime"), training.path("tempoMedioPreparo"));
        return Optional.ofNullable(text).orElse("")
                .replace("{username}", username)
                .replace("{nome_cliente}", username)
                .replace("{nome_da_loja}", storeName)
                .replace("{tipo_negocio}", store != null ? defaultText(store.getCategory(), "") : "")
                .replace("{link}", menuUrl)
                .replace("{link_catalogo}", menuUrl)
                .replace("{horario_funcionamento}", defaultText(schedule, "Horario ainda nao configurado."))
                .replace("{endereco_loja}", address)
                .replace("{formas_pagamento}", defaultText(payment, "Formas de pagamento ainda nao configuradas."))
                .replace("{lista_bairros_entrega}", defaultText(regions, "Regioes de entrega ainda nao configuradas."))
                .replace("{tempo_medio_preparo}", defaultText(prepTime, "Tempo medio ainda nao configurado."))
                .replace("{link_acompanhamento}", menuUrl)
                .replace("{numero_pedido}", "")
                .replace("{divide}", "\n")
                .replace("{saudacao}", greeting());
    }

    private String resolveMenuUrl(UUID storeId, WhatsappIntegration integration) {
        if (integration != null && hasText(integration.getBotMenuUrl())) {
            return integration.getBotMenuUrl().trim();
        }
        return stores.findById(storeId)
                .map(store -> "/loja/" + store.getId())
                .orElse("");
    }

    private String buildMenuMessage(UUID storeId, WhatsappIntegration integration) {
        String menuUrl = resolveMenuUrl(storeId, integration);
        return hasText(menuUrl)
                ? "Segue o cardapio digital para fazer seu pedido:\n" + menuUrl + "\n\nPor ele voce escolhe os itens, informa entrega ou retirada e confirma o pagamento."
                : "O link do cardapio digital ainda nao esta configurado. Um atendente pode enviar para voce por aqui.";
    }

    private String buildLatestOrderMessage(UUID storeId, WhatsappConversation conversation, String inboundText) {
        Optional<CustomerOrder> latestOrder = findLatestOrderForConversation(storeId, conversation, inboundText);
        if (latestOrder.isEmpty()) {
            return "Nao encontrei um pedido recente vinculado a este WhatsApp. Se voce acabou de pedir pelo cardapio, me envie o numero do pedido ou chame um atendente.";
        }
        return buildOrderStatusMessage(latestOrder.get());
    }

    private Optional<CustomerOrder> findLatestOrderForConversation(UUID storeId, WhatsappConversation conversation, String inboundText) {
        if (conversation == null) {
            return Optional.empty();
        }
        String phone = cleanWhatsappPhone(hasText(conversation.getPhone()) ? conversation.getPhone() : conversation.getRemoteJid());
        List<CustomerOrder> phoneOrders = customerOrders.findByStoreIdOrderByCreatedAtDesc(storeId).stream()
                .filter(order -> phoneMatches(phone, order.getCustomerPhone()))
                .toList();
        Optional<CustomerOrder> requestedOrder = phoneOrders.stream()
                .filter(order -> referencesOrder(order, inboundText))
                .findFirst();
        return requestedOrder.or(() -> phoneOrders.stream().findFirst());
    }

    private String buildOrderCreatedMessage(CustomerOrder order) {
        return "Pedido recebido " + orderReference(order) + "\n" +
                buildOrderSummary(order) + "\n\n" +
                "Status: " + orderStatusLabel(order.getStatus()) + "\n" +
                "Agora a loja vai conferir e enviar para preparo. Se precisar alterar algo, responda atendente.";
    }

    private String buildOrderSummary(CustomerOrder order) {
        String items = order.getItems().stream()
                .limit(4)
                .map(item -> item.getQuantity() + "x " + item.getProductName())
                .reduce((left, right) -> left + "\n" + right)
                .orElse("Itens registrados no pedido.");
        long remaining = Math.max(0, order.getItems().size() - 4);
        String suffix = remaining > 0 ? "\n+" + remaining + " item(ns)" : "";
        return items + suffix + "\nTotal: " + formatMoney(order.getTotal());
    }

    private String buildOrderStatusChangedMessage(CustomerOrder order) {
        return orderReference(order) + "\n" +
                "Atualizacao: " + orderStatusLabel(order.getStatus()) + "\n" +
                orderStatusDetail(order);
    }

    private String buildOrderStatusMessage(CustomerOrder order) {
        return orderReference(order) + "\n" +
                "Status: " + orderStatusLabel(order.getStatus()) + "\n" +
                orderStatusDetail(order) + "\n" +
                "Entrega: " + fulfillmentLabel(order.getFulfillment()) + "\n" +
                "Total: " + formatMoney(order.getTotal()) + "\n" +
                "Se precisar alterar algo, escreva atendente.";
    }

    private String orderStatusDetail(CustomerOrder order) {
        return switch (Optional.ofNullable(order.getStatus()).orElse("")) {
            case "analysis" -> "Recebemos seu pedido e a loja esta conferindo os itens.";
            case "production" -> "Seu pedido esta em preparo na cozinha.";
            case "ready" -> "Seu pedido esta pronto" + ("delivery".equals(order.getFulfillment()) ? " para sair para entrega." : " para retirada.");
            case "completed" -> "Pedido finalizado. Obrigado pela preferencia.";
            case "cancelled" -> "Pedido cancelado. Se precisar de ajuda, escreva atendente.";
            default -> "A loja atualizou o andamento do seu pedido.";
        };
    }

    private String buildScheduleMessage(UUID storeId) {
        return stores.findById(storeId)
                .map(store -> hasText(store.getSchedule())
                        ? "Nosso horario de atendimento: " + store.getSchedule()
                        : "O horario da loja ainda nao esta configurado no sistema. Posso chamar um atendente se voce precisar confirmar.")
                .orElse("Nao consegui consultar o horario da loja agora.");
    }

    private String buildDeliveryMessage(UUID storeId) {
        return stores.findById(storeId)
                .map(store -> {
                    String minimum = store.getMinimumOrder() != null && store.getMinimumOrder().compareTo(BigDecimal.ZERO) > 0
                            ? "\nPedido minimo: " + formatMoney(store.getMinimumOrder()) + "."
                            : "";
                    String radius = store.getDeliveryRadiusKm() != null && store.getDeliveryRadiusKm().compareTo(BigDecimal.ZERO) > 0
                            ? "\nRaio de entrega: ate " + store.getDeliveryRadiusKm().setScale(1, RoundingMode.HALF_UP).toPlainString().replace(".", ",") + " km."
                            : "";
                    return "Fazemos retirada e delivery nas areas atendidas. No cardapio digital voce informa o endereco e confere a taxa antes de finalizar." + minimum + radius;
                })
                .orElse("No cardapio digital voce informa o endereco e confere a taxa de entrega antes de finalizar.");
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
        WhatsappIntegration integration = getOrCreate(storeId);
        String menuUrl = resolveMenuUrl(storeId, integration);
        String finish = hasText(menuUrl)
                ? "Para finalizar sem erro, use o cardapio digital:\n" + menuUrl
                : "Para finalizar sem erro, peca pelo cardapio digital ou escreva atendente.";
        return "Encontrei no cardapio:\n" + items + "\n\n" + finish + "\n\nSe quiser ajuda humana, escreva atendente.";
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

    private static List<String> handoffKeywords(WhatsappIntegration integration, JsonNode training) {
        String value = defaultText(integration.getBotHandoffKeywords(), "humano, atendente, ajuda, suporte, pessoa, falar com alguem");
        List<String> keywords = new ArrayList<>(List.of(value.split(",")).stream().map(WasenderApiService::normalizeText).filter(WasenderApiService::hasText).toList());
        keywords.addAll(humanEscalationKeywords(training));
        return keywords;
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

    private static String greeting() {
        int hour = LocalDateTime.now().getHour();
        if (hour < 12) {
            return "Bom dia";
        }
        if (hour < 18) {
            return "Boa tarde";
        }
        return "Boa noite";
    }

    private static String defaultText(String value, String fallback) {
        return hasText(value) ? value.trim() : fallback;
    }

    private static String trimToNull(String value, int maxLength) {
        String text = Optional.ofNullable(value).orElse("").trim();
        if (!hasText(text)) {
            return null;
        }
        return text.length() > maxLength ? text.substring(0, maxLength) : text;
    }

    private static String orderReference(CustomerOrder order) {
        return "Pedido #" + order.getId().toString().substring(0, 8);
    }

    private static boolean referencesOrder(CustomerOrder order, String text) {
        if (order == null || !hasText(text)) {
            return false;
        }
        String compactOrderId = order.getId().toString().replace("-", "").toLowerCase();
        String compactText = normalizeText(text).replaceAll("\\s+", "");
        return hasText(compactText)
                && (compactText.contains(compactOrderId) || compactText.contains(compactOrderId.substring(0, 8)));
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

    public record WhatsappAvatarImage(byte[] content, String contentType) {
    }

    public record WhatsappBotTestResult(String intent, int confidence, boolean humanEscalation, String response) {
    }

    private record BotDecision(String intent, int confidence, String text, boolean pauseAfterReply) {
        BotDecision(String text, boolean pauseAfterReply) {
            this("UNKNOWN", 0, text, pauseAfterReply);
        }
    }

    private record BotIntentMatch(String intent, int score, String response, boolean humanEscalation) {
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

    private static String firstTextValue(String... values) {
        for (String value : values) {
            if (hasText(value)) {
                return value;
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

    private static boolean isGroupAddress(String value) {
        return Optional.ofNullable(value).orElse("").toLowerCase().contains("@g.us");
    }

    private static boolean looksLikePhone(String value) {
        String phone = Optional.ofNullable(value).orElse("").replaceAll("\\D", "");
        return phone.length() >= 8 && phone.length() >= Optional.ofNullable(value).orElse("").replaceAll("\\s", "").length() - 2;
    }

    private static String extractedPhone(String remoteJid, JsonNode... nodes) {
        for (JsonNode node : nodes) {
            String trustedPhone = firstText(
                    node.path("cleanedSenderPn"),
                    node.path("cleanedParticipantPn"),
                    node.path("cleanedPhone"),
                    node.path("senderPhone"),
                    node.path("participantPhone"));
            String cleanedTrustedPhone = cleanPhoneCandidate(trustedPhone, remoteJid);
            if (hasText(cleanedTrustedPhone)) {
                return cleanedTrustedPhone;
            }
            String explicitPhone = firstText(
                    node.path("phone"),
                    node.path("number"));
            String cleanedExplicitPhone = cleanPhoneCandidate(explicitPhone, remoteJid);
            if (hasText(cleanedExplicitPhone)) {
                return cleanedExplicitPhone;
            }
            String senderPn = cleanPhoneCandidate(firstText(
                    node.path("senderPn"),
                    node.path("participantPn"),
                    node.path("to"),
                    node.path("sender"),
                    node.path("recipient")), remoteJid);
            if (hasText(senderPn)) {
                return senderPn;
            }
        }
        return cleanWhatsappPhone(remoteJid);
    }

    private static String cleanPhoneCandidate(String value, String remoteJid) {
        String phone = cleanWhatsappPhone(value);
        if (!hasText(phone)) {
            return "";
        }
        if (isOpaqueWhatsappId(remoteJid)) {
            String candidateDigits = phone.replaceAll("\\D", "");
            String opaqueDigits = cleanWhatsappAddress(remoteJid).replaceAll("\\D", "");
            if (hasText(opaqueDigits) && candidateDigits.equals(opaqueDigits)) {
                return "";
            }
        }
        return phone;
    }

    private static String cleanWhatsappPhone(String value) {
        if (isOpaqueWhatsappId(value)) {
            return "";
        }
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

    private static boolean isOpaqueWhatsappId(String value) {
        String address = Optional.ofNullable(value).orElse("").toLowerCase();
        return address.contains("@lid") || address.contains("@g.us") || address.contains("@newsletter");
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
