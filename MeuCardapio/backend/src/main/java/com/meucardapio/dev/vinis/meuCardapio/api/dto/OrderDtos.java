package com.meucardapio.dev.vinis.meuCardapio.api.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import com.meucardapio.dev.vinis.meuCardapio.domain.CustomerOrder;
import com.meucardapio.dev.vinis.meuCardapio.domain.OrderItem;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

public final class OrderDtos {
    private OrderDtos() {
    }

    public record OrderItemRequest(
            @NotBlank String productName,
            @NotNull @Positive Integer quantity,
            @NotNull @PositiveOrZero BigDecimal unitPrice) {
    }

    public record OrderRequest(
            @NotBlank String customerName,
            String customerPhone,
            @NotBlank String fulfillment,
            @NotBlank String payment,
            String note,
            @PositiveOrZero BigDecimal deliveryFee,
            @NotEmpty List<@Valid OrderItemRequest> items) {
    }

    public record OrderStatusRequest(@NotBlank String status) {
    }

    public record OrderItemResponse(UUID id, String productName, int quantity, BigDecimal unitPrice, BigDecimal totalPrice) {
        public static OrderItemResponse from(OrderItem item) {
            return new OrderItemResponse(item.getId(), item.getProductName(), item.getQuantity(), item.getUnitPrice(), item.getTotalPrice());
        }
    }

    public record OrderResponse(
            UUID id,
            String customerName,
            String customerPhone,
            String fulfillment,
            String status,
            BigDecimal subtotal,
            BigDecimal deliveryFee,
            BigDecimal total,
            String payment,
            String note,
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            List<OrderItemResponse> items) {
        public static OrderResponse from(CustomerOrder order) {
            return new OrderResponse(
                    order.getId(),
                    order.getCustomerName(),
                    order.getCustomerPhone(),
                    order.getFulfillment(),
                    order.getStatus(),
                    order.getSubtotal(),
                    order.getDeliveryFee(),
                    order.getTotal(),
                    order.getPayment(),
                    order.getNote(),
                    order.getCreatedAt(),
                    order.getUpdatedAt(),
                    order.getItems().stream().map(OrderItemResponse::from).toList());
        }
    }
}
