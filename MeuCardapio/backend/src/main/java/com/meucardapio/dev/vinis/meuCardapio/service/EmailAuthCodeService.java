package com.meucardapio.dev.vinis.meuCardapio.service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.meucardapio.dev.vinis.meuCardapio.domain.AuthCode;
import com.meucardapio.dev.vinis.meuCardapio.domain.StoreUser;
import com.meucardapio.dev.vinis.meuCardapio.repository.AuthCodeRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreUserRepository;

@Service
public class EmailAuthCodeService {
    public static final String PURPOSE_LOGIN = "LOGIN";
    public static final String PURPOSE_PASSWORD_RESET = "PASSWORD_RESET";
    public static final String PURPOSE_SIGNUP = "SIGNUP";

    private final AuthCodeRepository codes;
    private final StoreUserRepository users;
    private final AppLogService logs;
    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final SecureRandom random = new SecureRandom();
    private final int codeMinutes;
    private final String mailFrom;
    private final String smtpHost;
    private final String resendApiKey;
    private final String resendFrom;

    public EmailAuthCodeService(
            AuthCodeRepository codes,
            StoreUserRepository users,
            AppLogService logs,
            ObjectProvider<JavaMailSender> mailSenderProvider,
            @Value("${app.auth.code-minutes}") int codeMinutes,
            @Value("${app.mail.from}") String mailFrom,
            @Value("${spring.mail.host:}") String smtpHost,
            @Value("${app.resend.api-key:}") String resendApiKey,
            @Value("${app.resend.from:}") String resendFrom) {
        this.codes = codes;
        this.users = users;
        this.logs = logs;
        this.mailSenderProvider = mailSenderProvider;
        this.codeMinutes = codeMinutes;
        this.mailFrom = mailFrom;
        this.smtpHost = smtpHost;
        this.resendApiKey = resendApiKey;
        this.resendFrom = resendFrom;
    }

    public void requestLoginCode(String email) {
        requestCode(email, PURPOSE_LOGIN);
    }

    public void requestPasswordResetCode(String email) {
        requestCode(email, PURPOSE_PASSWORD_RESET);
    }

    public void requestCodeByPurpose(String email, String purpose) {
        String normalizedPurpose = purpose == null ? "" : purpose.trim().toUpperCase();
        switch (normalizedPurpose) {
            case PURPOSE_SIGNUP -> requestSignupCode(email);
            case PURPOSE_PASSWORD_RESET -> requestPasswordResetCode(email);
            case PURPOSE_LOGIN -> requestLoginCode(email);
            default -> throw new IllegalArgumentException("Finalidade de codigo invalida.");
        }
    }

    public void requestSignupCode(String email) {
        String normalizedEmail = normalizeEmail(email);
        if (normalizedEmail.isBlank()) {
            return;
        }

        String code = generateCode();
        codes.save(new AuthCode(
                UUID.randomUUID(),
                normalizedEmail,
                PURPOSE_SIGNUP,
                encoder.encode(code),
                LocalDateTime.now().plusMinutes(Math.max(1, codeMinutes))));
        sendCodeEmail(normalizedEmail, PURPOSE_SIGNUP, code);
    }

    public boolean verifySignupCode(String email, String code) {
        return verifyCode(email, code, PURPOSE_SIGNUP).isPresent();
    }

    public Optional<StoreUser> verifyLoginCode(String email, String code) {
        Optional<AuthCode> verified = verifyCode(email, code, PURPOSE_LOGIN);
        if (verified.isEmpty()) {
            return Optional.empty();
        }

        return users.findByEmailIgnoreCase(normalizeEmail(email));
    }

    public boolean resetPassword(String email, String code, String password) {
        if (password == null || password.length() < 6) {
            return false;
        }

        Optional<AuthCode> verified = verifyCode(email, code, PURPOSE_PASSWORD_RESET);
        if (verified.isEmpty()) {
            return false;
        }

        return users.findByEmailIgnoreCase(normalizeEmail(email))
                .map(user -> {
                    user.changePassword(encoder.encode(password));
                    users.save(user);
                    logs.record(user.getStore().getId(), "INFO", "auth", "Senha redefinida por codigo: " + user.getEmail());
                    return true;
                })
                .orElse(false);
    }

    private void requestCode(String email, String purpose) {
        String normalizedEmail = normalizeEmail(email);
        users.findByEmailIgnoreCase(normalizedEmail).ifPresent(user -> {
            String code = generateCode();
            AuthCode saved = codes.save(new AuthCode(
                    UUID.randomUUID(),
                    normalizedEmail,
                    purpose,
                    encoder.encode(code),
                    LocalDateTime.now().plusMinutes(Math.max(1, codeMinutes))));

            sendCodeEmail(normalizedEmail, purpose, code);
            logs.record(user.getStore().getId(), "INFO", "auth", "Codigo enviado para " + normalizedEmail + " (" + saved.getPurpose() + ")");
        });
    }

    private Optional<AuthCode> verifyCode(String email, String code, String purpose) {
        String normalizedCode = code == null ? "" : code.trim();
        if (normalizedCode.length() != 6) {
            return Optional.empty();
        }

        Optional<AuthCode> found = codes.findTopByEmailIgnoreCaseAndPurposeAndUsedAtIsNullOrderByCreatedAtDesc(normalizeEmail(email), purpose);
        if (found.isEmpty()) {
            return Optional.empty();
        }

        AuthCode authCode = found.get();
        if (authCode.isUsed() || authCode.isExpired() || !encoder.matches(normalizedCode, authCode.getCodeHash())) {
            return Optional.empty();
        }

        authCode.markUsed();
        codes.save(authCode);
        return Optional.of(authCode);
    }

    private void sendCodeEmail(String email, String purpose, String code) {
        if (resendApiKey != null && !resendApiKey.isBlank()) {
            sendCodeEmailWithResend(email, purpose, code);
            return;
        }

        if (smtpHost == null || smtpHost.isBlank()) {
            throw new IllegalStateException("Configure RESEND_API_KEY no Render ou SMTP_HOST para envio por SMTP.");
        }

        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (mailSender == null) {
            throw new IllegalStateException("JavaMailSender indisponivel");
        }

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(mailFrom);
        message.setTo(email);
        message.setSubject(switch (purpose) {
            case PURPOSE_PASSWORD_RESET -> "Codigo para redefinir sua senha";
            case PURPOSE_SIGNUP -> "Codigo para validar seu email";
            default -> "Codigo de acesso MeuCardapio";
        });
        message.setText("""
                Seu codigo MeuCardapio e: %s

                Ele expira em %d minutos. Se voce nao pediu este codigo, ignore este email.
                """.formatted(code, Math.max(1, codeMinutes)));
        mailSender.send(message);
    }

    private void sendCodeEmailWithResend(String email, String purpose, String code) {
        String from = resendFrom == null || resendFrom.isBlank() ? mailFrom : resendFrom;

        if (from == null || from.isBlank() || from.endsWith("@meucardapio.local")) {
            throw new IllegalStateException("Configure RESEND_FROM com um remetente valido no Render.");
        }

        try {
            RestClient.builder()
                    .baseUrl("https://api.resend.com")
                    .defaultHeader("Authorization", "Bearer " + resendApiKey.trim())
                    .build()
                    .post()
                    .uri("/emails")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "from", from,
                            "to", email,
                            "subject", getEmailSubject(purpose),
                            "text", getEmailText(code)))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException ex) {
            String response = ex.getResponseBodyAsString();
            String detail = response == null || response.isBlank()
                    ? ex.getStatusCode().toString()
                    : response.substring(0, Math.min(response.length(), 300));
            throw new IllegalStateException("Resend recusou o envio: " + detail, ex);
        } catch (RestClientException ex) {
            throw new IllegalStateException("Nao foi possivel enviar pelo Resend. Confira RESEND_API_KEY e RESEND_FROM no Render.", ex);
        }
    }

    private String getEmailSubject(String purpose) {
        return switch (purpose) {
            case PURPOSE_PASSWORD_RESET -> "Codigo para redefinir sua senha";
            case PURPOSE_SIGNUP -> "Codigo para validar seu email";
            default -> "Codigo de acesso MeuCardapio";
        };
    }

    private String getEmailText(String code) {
        return """
                Seu codigo MeuCardapio e: %s

                Ele expira em %d minutos. Se voce nao pediu este codigo, ignore este email.
                """.formatted(code, Math.max(1, codeMinutes));
    }

    private String generateCode() {
        return String.format("%06d", random.nextInt(1_000_000));
    }

    private String normalizeEmail(String email) {
        return String.valueOf(email == null ? "" : email).trim().toLowerCase();
    }
}
