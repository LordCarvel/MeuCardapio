package com.meucardapio.dev.vinis.meuCardapio.service;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.CopyOnWriteArrayList;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.meucardapio.dev.vinis.meuCardapio.domain.CustomerOrder;

@Service
public class OrderEventService {
    private static final long EMITTER_TIMEOUT_MS = 30L * 60L * 1000L;

    private final ConcurrentMap<UUID, CopyOnWriteArrayList<SseEmitter>> emitters = new ConcurrentHashMap<>();

    public SseEmitter subscribe(UUID storeId) {
        SseEmitter emitter = new SseEmitter(EMITTER_TIMEOUT_MS);
        emitters.computeIfAbsent(storeId, ignored -> new CopyOnWriteArrayList<>()).add(emitter);

        Runnable cleanup = () -> remove(storeId, emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(error -> cleanup.run());

        send(emitter, "connected", new OrderEvent("connected", storeId, null, null, "", LocalDateTime.now()));
        return emitter;
    }

    public void publishAfterCommit(UUID storeId, String action, CustomerOrder order) {
        if (storeId == null || order == null) {
            return;
        }

        OrderEvent event = OrderEvent.from(action, storeId, order);
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            publish(event);
            return;
        }

        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                publish(event);
            }
        });
    }

    private void publish(OrderEvent event) {
        CopyOnWriteArrayList<SseEmitter> storeEmitters = emitters.get(event.storeId());
        if (storeEmitters == null || storeEmitters.isEmpty()) {
            return;
        }

        for (SseEmitter emitter : storeEmitters) {
            if (!send(emitter, "order", event)) {
                remove(event.storeId(), emitter);
            }
        }
    }

    private boolean send(SseEmitter emitter, String eventName, OrderEvent event) {
        try {
            emitter.send(SseEmitter.event()
                    .name(eventName)
                    .id(event.eventId())
                    .data(event));
            return true;
        } catch (IOException | IllegalStateException ex) {
            return false;
        }
    }

    private void remove(UUID storeId, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> storeEmitters = emitters.get(storeId);
        if (storeEmitters == null) {
            return;
        }

        storeEmitters.remove(emitter);
        if (storeEmitters.isEmpty()) {
            emitters.remove(storeId, storeEmitters);
        }
    }

    public record OrderEvent(
            String action,
            UUID storeId,
            UUID orderId,
            Integer orderNumber,
            String status,
            LocalDateTime updatedAt) {
        private static OrderEvent from(String action, UUID storeId, CustomerOrder order) {
            return new OrderEvent(
                    action,
                    storeId,
                    order.getId(),
                    order.getOrderNumber(),
                    order.getStatus(),
                    order.getUpdatedAt());
        }

        private String eventId() {
            String id = orderId == null ? "connection" : orderId.toString();
            return action + ":" + id + ":" + updatedAt;
        }
    }
}
