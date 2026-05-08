package com.meucardapio.dev.vinis.meuCardapio.api.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import com.meucardapio.dev.vinis.meuCardapio.domain.AppLog;
import com.meucardapio.dev.vinis.meuCardapio.domain.StoreUser;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AdminDtos {
    private AdminDtos() {
    }

    public record StoreUserRequest(
            @NotBlank String name,
            @Email @NotBlank String email,
            @Size(min = 6) String password,
            String role) {
    }

    public record StoreUserResponse(UUID id, UUID storeId, String name, String email, String role, LocalDateTime createdAt) {
        public static StoreUserResponse from(StoreUser user) {
            return new StoreUserResponse(user.getId(), user.getStore().getId(), user.getName(), user.getEmail(), user.getRole(), user.getCreatedAt());
        }
    }

    public record LoginRequest(@Email @NotBlank String email, @NotBlank String password) {
    }

    public record LoginResponse(boolean ok, String message, StoreUserResponse user) {
    }

    public record EmailCodeRequest(@Email @NotBlank String email) {
    }

    public record AuthCodeRequest(@Email @NotBlank String email, @NotBlank String purpose) {
    }

    public record VerifyEmailCodeRequest(@Email @NotBlank String email, @NotBlank String code) {
    }

    public record ResetPasswordRequest(@Email @NotBlank String email, @NotBlank String code, @Size(min = 6) String password) {
    }

    public record AuthMessageResponse(boolean ok, String message) {
    }

    public record SignupRequest(
            @NotBlank String tradeName,
            @NotBlank String ownerName,
            @Email @NotBlank String email,
            @NotBlank String phone,
            @NotBlank String taxId,
            @NotBlank String category,
            String street,
            String number,
            String district,
            String cityName,
            String state,
            String schedule,
            String accessKey,
            BigDecimal minimumOrder,
            BigDecimal deliveryRadiusKm,
            @NotBlank String code,
            @Size(min = 6) String password) {
    }

    public record LogRequest(UUID storeId, @NotBlank String level, @NotBlank String area, @NotBlank String message) {
    }

    public record LogResponse(UUID id, UUID storeId, String level, String area, String message, LocalDateTime createdAt) {
        public static LogResponse from(AppLog log) {
            return new LogResponse(log.getId(), log.getStoreId(), log.getLevel(), log.getArea(), log.getMessage(), log.getCreatedAt());
        }
    }

    public record ReportSummary(UUID storeId, long stores, long products, long activeProducts, long orders, long openOrders, BigDecimal revenue) {
    }
}
