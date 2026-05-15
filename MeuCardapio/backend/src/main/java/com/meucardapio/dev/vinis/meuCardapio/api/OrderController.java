package com.meucardapio.dev.vinis.meuCardapio.api;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.dao.DataIntegrityViolationException;
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
import com.meucardapio.dev.vinis.meuCardapio.service.OrderNotificationService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/stores/{storeId}/orders")
public class OrderController {
    private final StoreRepository stores;
    private final CustomerOrderRepository orders;
    private final AppLogService logService;
    private final OrderNotificationService orderNotifications;
    private final Object orderNumberLock = new Object();

    public OrderController(StoreRepository stores, CustomerOrderRepository orders, AppLogService logService, OrderNotificationService orderNotifications) {
        this.stores = stores;
        this.orders = orders;
        this.logService = logService;
        this.orderNotifications = orderNotifications;
    }

    @GetMapping
    public List<OrderResponse> list(@PathVariable UUID storeId) {
        return orders.findByStoreIdOrderByCreatedAtDesc(storeId).stream().map(OrderResponse::from).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public OrderResponse create(@PathVariable UUID storeId, @Valid @RequestBody OrderRequest request) {
        Store store = stores.findById(storeId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loja nao encontrada"));
        CustomerOrder order = new CustomerOrder(
                UUID.randomUUID(),
                store,
                truncate(request.customerName(), 120),
                truncate(request.customerPhone(), 40),
                truncate(request.fulfillment(), 30),
                truncate(request.payment(), 40),
                buildOrderNote(request));
        applyRequestedStatus(order, request.status());
        List<OrderItem> items = request.items().stream()
                .map(item -> new OrderItem(UUID.randomUUID(), truncate(item.productName(), 120), item.quantity(), item.unitPrice()))
                .toList();
        order.replaceItems(items, request.deliveryFee() == null ? BigDecimal.ZERO : request.deliveryFee());
        CustomerOrder saved = saveWithNextOrderNumber(storeId, order);
        logService.record(storeId, "INFO", "orders", "Pedido criado para " + saved.getCustomerName());
        orderNotifications.notifyOrderCreated(storeId, saved.getId());
        return OrderResponse.from(saved);
    }

    @PutMapping("/{orderId}")
    public OrderResponse update(@PathVariable UUID storeId, @PathVariable UUID orderId, @Valid @RequestBody OrderRequest request) {
        CustomerOrder order = findOrderForStore(storeId, orderId);
        order.updateDetails(
                truncate(request.customerName(), 120),
                truncate(request.customerPhone(), 40),
                truncate(request.fulfillment(), 30),
                truncate(request.payment(), 40),
                buildOrderNote(request));
        applyRequestedStatus(order, request.status());
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
        order.setStatus(truncate(request.status(), 30));
        CustomerOrder saved = orders.save(order);
        logService.record(storeId, "INFO", "orders", "Status do pedido atualizado para " + saved.getStatus());
        orderNotifications.notifyOrderStatusChanged(storeId, saved.getId(), saved.getStatus());
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

    private CustomerOrder saveWithNextOrderNumber(UUID storeId, CustomerOrder order) {
        for (int attempt = 0; attempt < 3; attempt += 1) {
            try {
                synchronized (orderNumberLock) {
                    order.setOrderNumber(Math.max(8300, orders.findLastOrderNumberByStoreId(storeId)) + 1);
                    return orders.save(order);
                }
            } catch (DataIntegrityViolationException ex) {
                if (attempt == 2) {
                    throw ex;
                }
            }
        }
        throw new IllegalStateException("Nao foi possivel gerar o numero do pedido.");
    }

    private void applyRequestedStatus(CustomerOrder order, String status) {
        String normalized = truncate(status, 30);
        if (!normalized.isBlank()) {
            order.setStatus(normalized);
        }
    }

    private String buildOrderNote(OrderRequest request) {
        List<String> parts = new ArrayList<>();
        String note = request.note() == null ? "" : request.note().trim();
        if (!containsNoteLabel(note, "origem") && hasText(request.source())) {
            parts.add("Origem: " + truncate(request.source(), 80));
        }
        if (!containsNoteLabel(note, "endereco") && hasText(request.address())) {
            parts.add("Endereco: " + truncate(request.address(), 220));
        }
        if (!containsNoteLabel(note, "zona") && hasText(request.deliveryZoneName())) {
            parts.add("Zona: " + truncate(request.deliveryZoneName(), 100));
        }
        if (!containsNoteLabel(note, "documento") && hasText(request.document())) {
            parts.add("Documento: " + truncate(request.document(), 40));
        }
        if (hasText(note)) {
            parts.add(note);
        }
        return truncate(String.join(" | ", parts), 500);
    }

    private boolean containsNoteLabel(String note, String label) {
        String normalizedLabel = label == null ? "" : label.trim().toLowerCase();
        if (normalizedLabel.isBlank() || note == null || note.isBlank()) {
            return false;
        }
        for (String segment : note.split("\\s*\\|\\s*")) {
            int separator = segment.indexOf(':');
            if (separator > 0 && segment.substring(0, separator).trim().equalsIgnoreCase(normalizedLabel)) {
                return true;
            }
        }
        return false;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
