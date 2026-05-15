package com.meucardapio.dev.vinis.meuCardapio.api;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.meucardapio.dev.vinis.meuCardapio.api.dto.OrderDtos.OrderRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.OrderDtos.OrderResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.OrderDtos.OrderStatusRequest;
import com.meucardapio.dev.vinis.meuCardapio.domain.CustomerOrder;
import com.meucardapio.dev.vinis.meuCardapio.domain.OrderItem;
import com.meucardapio.dev.vinis.meuCardapio.domain.Store;
import com.meucardapio.dev.vinis.meuCardapio.repository.CustomerOrderRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreRepository;
import com.meucardapio.dev.vinis.meuCardapio.service.AppLogService;
import com.meucardapio.dev.vinis.meuCardapio.service.WasenderApiService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/stores/{storeId}/orders")
public class OrderController {
    private final StoreRepository stores;
    private final CustomerOrderRepository orders;
    private final AppLogService logService;
    private final WasenderApiService wasender;

    public OrderController(StoreRepository stores, CustomerOrderRepository orders, AppLogService logService, WasenderApiService wasender) {
        this.stores = stores;
        this.orders = orders;
        this.logService = logService;
        this.wasender = wasender;
    }

    @GetMapping
    public List<OrderResponse> list(@PathVariable UUID storeId) {
        return orders.findByStoreIdOrderByCreatedAtDesc(storeId).stream().map(OrderResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderResponse create(@PathVariable UUID storeId, @Valid @RequestBody OrderRequest request) {
        Store store = stores.findById(storeId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loja nao encontrada"));
        CustomerOrder order = new CustomerOrder(UUID.randomUUID(), store, request.customerName(), request.customerPhone(), request.fulfillment(), request.payment(), request.note());
        List<OrderItem> items = request.items().stream()
                .map(item -> new OrderItem(UUID.randomUUID(), truncate(item.productName(), 120), item.quantity(), item.unitPrice()))
                .toList();
        order.replaceItems(items, request.deliveryFee() == null ? BigDecimal.ZERO : request.deliveryFee());
        CustomerOrder saved = orders.save(order);
        logService.record(storeId, "INFO", "orders", "Pedido criado para " + saved.getCustomerName());
        try {
            wasender.notifyOrderCreated(saved);
        } catch (Exception ex) {
            logService.record(storeId, "WARN", "whatsapp", "Nao foi possivel notificar pedido no WhatsApp: " + ex.getMessage());
        }
        return OrderResponse.from(saved);
    }

    @PutMapping("/{orderId}")
    public OrderResponse update(@PathVariable UUID storeId, @PathVariable UUID orderId, @Valid @RequestBody OrderRequest request) {
        CustomerOrder order = findOrderForStore(storeId, orderId);
        order.updateDetails(request.customerName(), request.customerPhone(), request.fulfillment(), request.payment(), request.note());
        List<OrderItem> items = request.items().stream()
                .map(item -> new OrderItem(UUID.randomUUID(), truncate(item.productName(), 120), item.quantity(), item.unitPrice()))
                .toList();
        order.replaceItems(items, request.deliveryFee() == null ? BigDecimal.ZERO : request.deliveryFee());
        CustomerOrder saved = orders.save(order);
        logService.record(storeId, "INFO", "orders", "Pedido atualizado para " + saved.getCustomerName());
        return OrderResponse.from(saved);
    }

    @PatchMapping("/{orderId}/status")
    public OrderResponse updateStatus(@PathVariable UUID storeId, @PathVariable UUID orderId, @Valid @RequestBody OrderStatusRequest request) {
        CustomerOrder order = findOrderForStore(storeId, orderId);
        order.setStatus(request.status());
        CustomerOrder saved = orders.save(order);
        logService.record(storeId, "INFO", "orders", "Status do pedido atualizado para " + saved.getStatus());
        try {
            wasender.notifyOrderStatusChanged(saved);
        } catch (Exception ex) {
            logService.record(storeId, "WARN", "whatsapp", "Nao foi possivel notificar status no WhatsApp: " + ex.getMessage());
        }
        return OrderResponse.from(saved);
    }

    @DeleteMapping("/{orderId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID storeId, @PathVariable UUID orderId) {
        CustomerOrder order = findOrderForStore(storeId, orderId);
        orders.delete(order);
        logService.record(storeId, "WARN", "orders", "Pedido removido: " + orderId);
    }

    private CustomerOrder findOrderForStore(UUID storeId, UUID orderId) {
        CustomerOrder order = orders.findByIdWithItems(orderId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Pedido nao encontrado"));
        if (!order.getStore().getId().equals(storeId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pedido nao pertence a loja");
        }
        return order;
    }

    private String truncate(String value, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, Math.max(0, maxLength - 3)) + "...";
    }
}
