package com.meucardapio.dev.vinis.meuCardapio.api;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(IllegalStateException.class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    public Map<String, Object> handleIllegalState(IllegalStateException ex) {
        return Map.of(
                "ok", false,
                "message", ex.getMessage() == null ? "Servico indisponivel." : ex.getMessage());
    }

    @ExceptionHandler(MailException.class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    public Map<String, Object> handleMail(MailException ex) {
        return Map.of(
                "ok", false,
                "message", "Nao foi possivel enviar o email agora. Confira SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD e SMTP_FROM no Render.");
    }
}
