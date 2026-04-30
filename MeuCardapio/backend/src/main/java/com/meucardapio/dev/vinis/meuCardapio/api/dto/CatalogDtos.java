package com.meucardapio.dev.vinis.meuCardapio.api.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import com.meucardapio.dev.vinis.meuCardapio.domain.Category;
import com.meucardapio.dev.vinis.meuCardapio.domain.Product;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public final class CatalogDtos {
    private CatalogDtos() {
    }

    public record CategoryRequest(@NotBlank String name, Boolean active) {
    }

    public record CategoryResponse(UUID id, String name, boolean active, LocalDateTime createdAt) {
        public static CategoryResponse from(Category category) {
            return new CategoryResponse(category.getId(), category.getName(), category.isActive(), category.getCreatedAt());
        }
    }

    public record ProductRequest(
            UUID categoryId,
            @NotBlank String name,
            String description,
            @NotNull @PositiveOrZero BigDecimal price,
            @PositiveOrZero Integer stock,
            Boolean active) {
    }

    public record ProductResponse(
            UUID id,
            UUID categoryId,
            String categoryName,
            String name,
            String description,
            BigDecimal price,
            int stock,
            boolean active,
            LocalDateTime createdAt) {
        public static ProductResponse from(Product product) {
            return new ProductResponse(
                    product.getId(),
                    product.getCategory() == null ? null : product.getCategory().getId(),
                    product.getCategory() == null ? "" : product.getCategory().getName(),
                    product.getName(),
                    product.getDescription(),
                    product.getPrice(),
                    product.getStock(),
                    product.isActive(),
                    product.getCreatedAt());
        }
    }
}
