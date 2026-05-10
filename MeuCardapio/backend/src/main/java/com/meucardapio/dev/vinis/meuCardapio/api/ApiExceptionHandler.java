package com.meucardapio.dev.vinis.meuCardapio.api;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.MailException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatus(ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode()).body(Map.of(
                "ok", false,
                "status", ex.getStatusCode().value(),
                "message", ex.getReason() == null ? "Requisicao invalida." : ex.getReason()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .orElse("Dados invalidos.");
        return Map.of(
                "ok", false,
                "message", message);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> handleIllegalArgument(IllegalArgumentException ex) {
        return Map.of(
                "ok", false,
                "message", ex.getMessage() == null ? "Dados invalidos." : ex.getMessage());
    }

    @ExceptionHandler(IllegalStateException.class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    public Map<String, Object> handleIllegalState(IllegalStateException ex) {
        return Map.of(
                "ok", false,
                "message", ex.getMessage() == null ? "Servico indisponivel." : ex.getMessage());
    }

    @ExceptionHandler(RestClientResponseException.class)
    public ResponseEntity<Map<String, Object>> handleRestClientResponse(RestClientResponseException ex) {
        String response = ex.getResponseBodyAsString();
        String message = externalServiceMessage(response);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                "ok", false,
                "status", ex.getStatusCode().value(),
                "message", message));
    }

    private String externalServiceMessage(String response) {
        if (response == null || response.isBlank()) {
            return "Servico externo recusou a requisicao.";
        }

        String normalized = response.trim();
        if (normalized.startsWith("<!DOCTYPE") || normalized.startsWith("<html")) {
            return "WaSenderAPI retornou uma pagina HTML em vez de JSON. Confira se o Personal Access Token esta correto e se o ID da sessao e numerico.";
        }

        return normalized.substring(0, Math.min(normalized.length(), 500));
    }

    @ExceptionHandler(MailException.class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    public Map<String, Object> handleMail(MailException ex) {
        return Map.of(
                "ok", false,
                "message", "Nao foi possivel enviar o email agora. Confira RESEND_API_KEY/RESEND_FROM ou SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD no Render.");
    }
}
