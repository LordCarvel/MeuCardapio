package com.meucardapio.dev.vinis.meuCardapio.api;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.meucardapio.dev.vinis.meuCardapio.api.dto.AdminDtos.LoginRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.AdminDtos.LoginResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.AdminDtos.AuthMessageResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.AdminDtos.EmailCodeRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.AdminDtos.ResetPasswordRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.AdminDtos.StoreUserRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.AdminDtos.StoreUserResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.AdminDtos.VerifyEmailCodeRequest;
import com.meucardapio.dev.vinis.meuCardapio.domain.Store;
import com.meucardapio.dev.vinis.meuCardapio.domain.StoreUser;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreUserRepository;
import com.meucardapio.dev.vinis.meuCardapio.service.AppLogService;
import com.meucardapio.dev.vinis.meuCardapio.service.EmailAuthCodeService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api")
public class AuthController {
    private final StoreRepository stores;
    private final StoreUserRepository users;
    private final AppLogService logService;
    private final EmailAuthCodeService emailCodes;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public AuthController(StoreRepository stores, StoreUserRepository users, AppLogService logService, EmailAuthCodeService emailCodes) {
        this.stores = stores;
        this.users = users;
        this.logService = logService;
        this.emailCodes = emailCodes;
    }

    @GetMapping("/stores/{storeId}/users")
    public List<StoreUserResponse> list(@PathVariable UUID storeId) {
        return users.findByStoreIdOrderByCreatedAtAsc(storeId).stream().map(StoreUserResponse::from).toList();
    }

    @PostMapping("/stores/{storeId}/users")
    @ResponseStatus(HttpStatus.CREATED)
    public StoreUserResponse create(@PathVariable UUID storeId, @Valid @RequestBody StoreUserRequest request) {
        Store store = stores.findById(storeId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loja nao encontrada"));
        users.findByEmailIgnoreCase(request.email()).ifPresent(user -> {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email ja cadastrado");
        });
        StoreUser user = new StoreUser(
                UUID.randomUUID(),
                store,
                request.name(),
                request.email().trim().toLowerCase(),
                encoder.encode(request.password()),
                request.role() == null || request.role().isBlank() ? "operator" : request.role());
        StoreUser saved = users.save(user);
        logService.record(storeId, "INFO", "users", "Usuario criado: " + saved.getEmail());
        return StoreUserResponse.from(saved);
    }

    @PostMapping("/auth/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return users.findByEmailIgnoreCase(request.email())
                .filter(user -> encoder.matches(request.password(), user.getPasswordHash()))
                .map(user -> {
                    logService.record(user.getStore().getId(), "INFO", "auth", "Login realizado: " + user.getEmail());
                    return new LoginResponse(true, "Login valido", StoreUserResponse.from(user));
                })
                .orElseGet(() -> new LoginResponse(false, "Email ou senha invalidos", null));
    }

    @PostMapping("/auth/request-code")
    public AuthMessageResponse requestCode(@Valid @RequestBody EmailCodeRequest request) {
        emailCodes.requestLoginCode(request.email());
        return new AuthMessageResponse(true, "Se o email existir, um codigo de acesso sera enviado.");
    }

    @PostMapping("/auth/verify-code")
    public LoginResponse verifyCode(@Valid @RequestBody VerifyEmailCodeRequest request) {
        return emailCodes.verifyLoginCode(request.email(), request.code())
                .map(user -> {
                    logService.record(user.getStore().getId(), "INFO", "auth", "Login por codigo realizado: " + user.getEmail());
                    return new LoginResponse(true, "Login por codigo valido", StoreUserResponse.from(user));
                })
                .orElseGet(() -> new LoginResponse(false, "Codigo invalido ou expirado", null));
    }

    @PostMapping("/auth/request-password-reset")
    public AuthMessageResponse requestPasswordReset(@Valid @RequestBody EmailCodeRequest request) {
        emailCodes.requestPasswordResetCode(request.email());
        return new AuthMessageResponse(true, "Se o email existir, um codigo de redefinicao sera enviado.");
    }

    @PostMapping("/auth/reset-password")
    public AuthMessageResponse resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        boolean ok = emailCodes.resetPassword(request.email(), request.code(), request.password());
        return ok
                ? new AuthMessageResponse(true, "Senha redefinida.")
                : new AuthMessageResponse(false, "Codigo invalido, expirado ou senha fraca.");
    }
}
