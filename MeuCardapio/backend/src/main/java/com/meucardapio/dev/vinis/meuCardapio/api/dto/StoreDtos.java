package com.meucardapio.dev.vinis.meuCardapio.api.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import com.meucardapio.dev.vinis.meuCardapio.domain.Store;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public final class StoreDtos {
    private StoreDtos() {
    }

    public record StoreRequest(
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
            BigDecimal minimumOrder,
            BigDecimal deliveryRadiusKm) {
    }

    public record StoreResponse(
            UUID id,
            String tradeName,
            String ownerName,
            String email,
            String phone,
            String taxId,
            String category,
            String street,
            String number,
            String district,
            String cityName,
            String state,
            String schedule,
            BigDecimal minimumOrder,
            BigDecimal deliveryRadiusKm,
            LocalDateTime createdAt) {
        public static StoreResponse from(Store store) {
            return new StoreResponse(
                    store.getId(),
                    store.getTradeName(),
                    store.getOwnerName(),
                    store.getEmail(),
                    store.getPhone(),
                    store.getTaxId(),
                    store.getCategory(),
                    store.getStreet(),
                    store.getNumber(),
                    store.getDistrict(),
                    store.getCityName(),
                    store.getState(),
                    store.getSchedule(),
                    store.getMinimumOrder(),
                    store.getDeliveryRadiusKm(),
                    store.getCreatedAt());
        }
    }
}
