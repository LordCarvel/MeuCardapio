package com.meucardapio.dev.vinis.meuCardapio.api;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappConfigRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappConfigResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappConversationResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappMessageResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappQrResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappSendMessageRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappSessionRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappStatusResponse;
import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappConversation;
import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappIntegration;
import com.meucardapio.dev.vinis.meuCardapio.repository.WhatsappConversationRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.WhatsappMessageRepository;
import com.meucardapio.dev.vinis.meuCardapio.service.WasenderApiService;

import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api")
public class WhatsappController {
    private final WasenderApiService wasender;
    private final WhatsappConversationRepository conversations;
    private final WhatsappMessageRepository messages;

    public WhatsappController(WasenderApiService wasender, WhatsappConversationRepository conversations, WhatsappMessageRepository messages) {
        this.wasender = wasender;
        this.conversations = conversations;
        this.messages = messages;
    }

    @GetMapping("/stores/{storeId}/whatsapp/config")
    public WhatsappConfigResponse config(@PathVariable UUID storeId) {
        return WhatsappConfigResponse.from(wasender.getOrCreate(storeId));
    }

    @PutMapping("/stores/{storeId}/whatsapp/config")
    public WhatsappConfigResponse saveConfig(@PathVariable UUID storeId, @RequestBody WhatsappConfigRequest request) {
        WhatsappIntegration integration = wasender.saveConfig(
                storeId,
                request.personalAccessToken(),
                request.apiKey(),
                request.sessionId(),
                request.sessionName(),
                request.phoneNumber(),
                request.webhookSecret(),
                request.webhookUrl());
        return WhatsappConfigResponse.from(integration);
    }

    @PostMapping("/stores/{storeId}/whatsapp/session")
    public JsonNode createSession(@PathVariable UUID storeId, @RequestBody WhatsappSessionRequest request) {
        return wasender.createSession(storeId, request.sessionName(), request.phoneNumber(), request.webhookUrl());
    }

    @PostMapping("/stores/{storeId}/whatsapp/connect")
    public JsonNode connect(@PathVariable UUID storeId) {
        return wasender.connect(storeId);
    }

    @GetMapping("/stores/{storeId}/whatsapp/qrcode")
    public WhatsappQrResponse qrcode(@PathVariable UUID storeId) {
        JsonNode response = wasender.qrCode(storeId);
        String qr = response == null ? "" : firstText(response.path("data").path("qrCode"), response.path("data").path("qr_code"), response.path("qrCode"), response.path("qr_code"));
        String status = response == null ? "" : firstText(response.path("data").path("status"), response.path("status"));
        return new WhatsappQrResponse(status, qr, response);
    }

    @GetMapping("/stores/{storeId}/whatsapp/status")
    public WhatsappStatusResponse status(@PathVariable UUID storeId) {
        JsonNode response = wasender.status(storeId);
        return new WhatsappStatusResponse(response == null ? "" : firstText(response.path("status"), response.path("data").path("status")), response);
    }

    @GetMapping("/stores/{storeId}/whatsapp/conversations")
    public List<WhatsappConversationResponse> conversations(@PathVariable UUID storeId) {
        return conversations.findByStoreIdOrderByLastMessageAtDesc(storeId).stream().map(WhatsappConversationResponse::from).toList();
    }

    @GetMapping("/stores/{storeId}/whatsapp/messages")
    public List<WhatsappMessageResponse> messages(@PathVariable UUID storeId, @RequestParam String remoteJid) {
        WhatsappConversation conversation = conversations.findByStoreIdAndRemoteJid(storeId, remoteJid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversa nao encontrada"));
        return messages.findByConversationOrderByCreatedAtAsc(conversation).stream().map(WhatsappMessageResponse::from).toList();
    }

    @PostMapping("/stores/{storeId}/whatsapp/messages")
    public WhatsappMessageResponse send(@PathVariable UUID storeId, @RequestBody WhatsappSendMessageRequest request) {
        return WhatsappMessageResponse.from(wasender.send(storeId, request.to(), request.text()));
    }

    @PostMapping("/stores/{storeId}/whatsapp/webhook")
    public Map<String, Object> storeWebhook(
            @PathVariable UUID storeId,
            @RequestHeader(value = "x-webhook-signature", required = false) String signature,
            @RequestHeader(value = "x-wasender-signature", required = false) String wasenderSignature,
            @RequestBody JsonNode payload) {
        wasender.receiveWebhook(storeId, signature == null ? wasenderSignature : signature, payload);
        return Map.of("ok", true);
    }

    @PostMapping("/whatsapp/webhook")
    public Map<String, Object> webhook(
            @RequestParam UUID storeId,
            @RequestHeader(value = "x-webhook-signature", required = false) String signature,
            @RequestHeader(value = "x-wasender-signature", required = false) String wasenderSignature,
            @RequestBody JsonNode payload) {
        wasender.receiveWebhook(storeId, signature == null ? wasenderSignature : signature, payload);
        return Map.of("ok", true);
    }

    @PostMapping("/stores/{storeId}/whatsapp/read")
    @Transactional
    public Map<String, Object> markRead(@PathVariable UUID storeId, @RequestParam String remoteJid) {
        WhatsappConversation conversation = conversations.findByStoreIdAndRemoteJid(storeId, remoteJid)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversa nao encontrada"));
        conversation.setUnreadCount(0);
        conversations.save(conversation);
        return Map.of("ok", true);
    }

    private static String firstText(JsonNode... nodes) {
        for (JsonNode node : nodes) {
            if (node != null && !node.isMissingNode() && !node.asText("").isBlank()) {
                return node.asText();
            }
        }
        return "";
    }
}
