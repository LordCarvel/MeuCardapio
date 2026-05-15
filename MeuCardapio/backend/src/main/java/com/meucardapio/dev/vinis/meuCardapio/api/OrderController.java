package com.meucardapio.dev.vinis.meuCardapio.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");
    private static final int DEFAULT_BOARD_DAYS = 1;
    private static final int MAX_BOARD_DAYS = 7;
    private static final Pattern LOCAL_ORDER_REFERENCE = Pattern.compile("(?i)pedido\\s+local\\s*#\\s*([^|\\n\\r]+)");

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
    public List<OrderResponse> list(
            @PathVariable UUID storeId,
            @RequestParam(defaultValue = "all") String scope,
            @RequestParam(defaultValue = "1") int days) {
        String normalizedScope = scope == null ? "all" : scope.trim().toLowerCase(Locale.ROOT);
        if ("board".equals(normalizedScope) || "active".equals(normalizedScope) || "today".equals(normalizedScope)) {
            int windowDays = Math.max(DEFAULT_BOARD_DAYS, Math.min(MAX_BOARD_DAYS, days));
            LocalDate startDate = LocalDate.now(BUSINESS_ZONE).minusDays(windowDays - 1L);
            return orders.findBoardByStoreIdSince(storeId, startDate.atStartOfDay()).stream().map(OrderResponse::from).toList();
        }
        return orders.findByStoreIdOrderByCreatedAtDesc(storeId).stream().map(OrderResponse::from).toList();
    }

    @GetMapping("/{orderId}")
    @Transactional(readOnly = true)
    public OrderResponse get(@PathVariable UUID storeId, @PathVariable UUID orderId) {
        return OrderResponse.from(findOrderWithItemsForStore(storeId, orderId));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public OrderResponse create(@PathVariable UUID storeId, @Valid @RequestBody OrderRequest request) {
        Store store = stores.findById(storeId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loja nao encontrada"));
        String sourceOrderId = resolveSourceOrderId(request);
        if (hasText(sourceOrderId)) {
            var existing = orders.findByStoreIdAndSourceOrderIdForUpdate(storeId, sourceOrderId);
            if (existing.isPresent()) {
                return OrderResponse.from(existing.get());
            }
        }
        CustomerOrder order = new CustomerOrder(
                UUID.randomUUID(),
                store,
                truncate(request.customerName(), 120),
                truncate(request.customerPhone(), 40),
                truncate(request.fulfillment(), 30),
                truncate(request.payment(), 40),
                buildOrderNote(request));
        order.setSourceOrderId(sourceOrderId);
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
    @Transactional
    public OrderResponse update(@PathVariable UUID storeId, @PathVariable UUID orderId, @Valid @RequestBody OrderRequest request) {
        CustomerOrder order = findOrderForStore(storeId, orderId);
        if (isStaleStatusRequest(order, request.status())) {
            logService.record(storeId, "INFO", "orders", "Atualizacao antiga ignorada; pedido permanece em " + order.getStatus());
            return OrderResponse.from(order);
        }
        String sourceOrderId = resolveSourceOrderId(request);
        if (hasText(sourceOrderId) && !hasText(order.getSourceOrderId())) {
            order.setSourceOrderId(sourceOrderId);
        }
        order.updateDetails(
                truncate(request.customerName(), 120),
                truncate(request.customerPhone(), 40),
                truncate(request.fulfillment(), 30),
                truncate(request.payment(), 40),
                buildOrderNote(request));
        StatusChange statusChange = applyRequestedStatus(order, request.status());
        List<OrderItem> items = request.items().stream()
                .map(item -> new OrderItem(UUID.randomUUID(), truncate(item.productName(), 120), item.quantity(), item.unitPrice()))
                .toList();
        order.replaceItems(items, request.deliveryFee() == null ? BigDecimal.ZERO : request.deliveryFee());
        CustomerOrder saved = orders.save(order);
        logService.record(storeId, "INFO", "orders", "Pedido atualizado para " + saved.getCustomerName());
        if (statusChange.changed()) {
            orderNotifications.notifyOrderStatusChanged(storeId, saved.getId(), saved.getStatus());
        }
        return OrderResponse.from(saved);
    }

    @PatchMapping("/{orderId}/status")
    @Transactional
    public OrderResponse updateStatus(@PathVariable UUID storeId, @PathVariable UUID orderId, @Valid @RequestBody OrderStatusRequest request) {
        CustomerOrder order = findOrderForStore(storeId, orderId);
        StatusChange statusChange = applyRequestedStatus(order, request.status());
        CustomerOrder saved = orders.save(order);
        if (statusChange.changed()) {
            logService.record(storeId, "INFO", "orders", "Status do pedido atualizado para " + saved.getStatus());
            orderNotifications.notifyOrderStatusChanged(storeId, saved.getId(), saved.getStatus());
        } else {
            logService.record(storeId, "INFO", "orders", "Status repetido ou antigo ignorado; pedido permanece em " + saved.getStatus());
        }
        return OrderResponse.from(saved);
    }

    @DeleteMapping("/{orderId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(@PathVariable UUID storeId, @PathVariable UUID orderId) {
        CustomerOrder order = findOrderForStore(storeId, orderId);
        orders.delete(order);
        logService.record(storeId, "WARN", "orders", "Pedido removido: " + orderId);
    }

    private CustomerOrder findOrderForStore(UUID storeId, UUID orderId) {
        CustomerOrder order = orders.findByIdForUpdate(orderId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Pedido nao encontrado"));
        if (!order.getStore().getId().equals(storeId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Pedido nao pertence a loja");
        }
        return order;
    }

    private CustomerOrder findOrderWithItemsForStore(UUID storeId, UUID orderId) {
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

    private StatusChange applyRequestedStatus(CustomerOrder order, String status) {
        String requested = normalizeOrderStatus(status);
        String current = normalizeOrderStatus(order.getStatus());
        boolean changed = false;

        if (!current.equals(order.getStatus())) {
            order.setStatus(current);
            changed = true;
        }

        if (requested.isBlank()) {
            return new StatusChange(changed);
        }

        if (isTerminalStatus(current) && !current.equals(requested)) {
            return new StatusChange(changed);
        }

        if (statusRank(requested) < statusRank(current)) {
            return new StatusChange(changed);
        }

        if (!current.equals(requested)) {
            order.setStatus(requested);
            return new StatusChange(true);
        }

        return new StatusChange(changed);
    }

    private boolean isStaleStatusRequest(CustomerOrder order, String status) {
        String requested = normalizeOrderStatus(status);
        if (requested.isBlank()) {
            return false;
        }
        String current = normalizeOrderStatus(order.getStatus());
        return (isTerminalStatus(current) && !current.equals(requested)) || statusRank(requested) < statusRank(current);
    }

    private String normalizeOrderStatus(String status) {
        String normalized = truncate(status, 30).toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        if (normalized.isBlank()) {
            return "";
        }
        return switch (normalized) {
            case "analysis", "analise", "em_analise", "received", "pending", "created", "new", "novo", "entrada", "aceito", "accepted" -> "analysis";
            case "production", "preparing", "prepare", "preparo", "em_preparo", "em_producao", "in_production" -> "production";
            case "ready", "pronto", "saida", "out_for_delivery", "out" -> "ready";
            case "completed", "complete", "finalizado", "finished", "delivered", "done", "closed" -> "completed";
            case "cancelled", "canceled", "cancelado", "rejected", "recusado" -> "cancelled";
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Status de pedido invalido.");
        };
    }

    private int statusRank(String status) {
        return switch (status) {
            case "analysis" -> 10;
            case "production" -> 20;
            case "ready" -> 30;
            case "completed", "cancelled" -> 40;
            default -> 0;
        };
    }

    private boolean isTerminalStatus(String status) {
        return "completed".equals(status) || "cancelled".equals(status);
    }

    private String resolveSourceOrderId(OrderRequest request) {
        String explicit = truncate(request.sourceOrderId(), 80);
        if (hasText(explicit)) {
            return explicit;
        }
        String note = request.note() == null ? "" : request.note();
        Matcher matcher = LOCAL_ORDER_REFERENCE.matcher(note);
        if (matcher.find()) {
            return truncate(matcher.group(1), 80);
        }
        return "";
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

    private record StatusChange(boolean changed) {
    }
}
