package com.meucardapio.dev.vinis.meuCardapio.api;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappConfigRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappConfigResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappBotControlRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappConversationResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappConversationPatchRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappConversationSyncResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappMessageResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappQrResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappSendMessageRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappSessionRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.WhatsappDtos.WhatsappStatusResponse;
import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappIntegration;
import com.meucardapio.dev.vinis.meuCardapio.service.WasenderApiService;

import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api")
public class WhatsappController {
    private final WasenderApiService wasender;

    public WhatsappController(WasenderApiService wasender) {
        this.wasender = wasender;
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
                request.webhookUrl(),
                request.botEnabled(),
                request.botWelcome(),
                request.botFallback(),
                request.botMenuUrl(),
                request.botHandoffKeywords());
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
        return wasender.conversations(storeId).stream().map(WhatsappConversationResponse::from).toList();
    }

    @PostMapping("/stores/{storeId}/whatsapp/conversations/sync")
    public WhatsappConversationSyncResponse syncConversations(@PathVariable UUID storeId) {
        var result = wasender.syncConversations(storeId);
        return new WhatsappConversationSyncResponse(
                result.conversations().stream().map(WhatsappConversationResponse::from).toList(),
                result.imported(),
                result.partial(),
                result.message());
    }

    @PatchMapping("/stores/{storeId}/whatsapp/conversations")
    public WhatsappConversationResponse updateConversation(
            @PathVariable UUID storeId,
            @RequestParam String remoteJid,
            @RequestBody WhatsappConversationPatchRequest request) {
        return WhatsappConversationResponse.from(wasender.updateConversation(storeId, remoteJid, request));
    }

    @PostMapping("/stores/{storeId}/whatsapp/conversations/avatar")
    public WhatsappConversationResponse refreshConversationAvatar(
            @PathVariable UUID storeId,
            @RequestParam String remoteJid) {
        return WhatsappConversationResponse.from(wasender.refreshConversationAvatar(storeId, remoteJid));
    }

    @GetMapping("/stores/{storeId}/whatsapp/messages")
    public List<WhatsappMessageResponse> messages(@PathVariable UUID storeId, @RequestParam String remoteJid) {
        return wasender.messages(storeId, remoteJid).stream().map(WhatsappMessageResponse::from).toList();
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
    public Map<String, Object> markRead(@PathVariable UUID storeId, @RequestParam String remoteJid) {
        wasender.markRead(storeId, remoteJid);
        return Map.of("ok", true);
    }

    @PostMapping("/stores/{storeId}/whatsapp/bot")
    public WhatsappConversationResponse controlBot(
            @PathVariable UUID storeId,
            @RequestParam String remoteJid,
            @RequestBody WhatsappBotControlRequest request) {
        return WhatsappConversationResponse.from(wasender.controlBot(storeId, remoteJid, request.action()));
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
