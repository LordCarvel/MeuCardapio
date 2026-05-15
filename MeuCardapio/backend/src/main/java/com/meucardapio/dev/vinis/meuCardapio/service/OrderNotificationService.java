package com.meucardapio.dev.vinis.meuCardapio.service;

import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.Executor;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.stereotype.Service;

import com.meucardapio.dev.vinis.meuCardapio.domain.CustomerOrder;
import com.meucardapio.dev.vinis.meuCardapio.repository.CustomerOrderRepository;

@Service
public class OrderNotificationService {
    private final CustomerOrderRepository orders;
    private final WasenderApiService wasender;
    private final AppLogService logService;
    private final Executor orderNotificationTaskExecutor;

    public OrderNotificationService(
            CustomerOrderRepository orders,
            WasenderApiService wasender,
            AppLogService logService,
            @Qualifier("orderNotificationTaskExecutor") Executor orderNotificationTaskExecutor) {
        this.orders = orders;
        this.wasender = wasender;
        this.logService = logService;
        this.orderNotificationTaskExecutor = orderNotificationTaskExecutor;
    }

    public void notifyOrderCreated(UUID storeId, UUID orderId) {
        enqueue(storeId, "criacao", () -> orders.findByIdWithItems(orderId)
                .filter(order -> belongsToStore(order, storeId))
                .ifPresent(wasender::notifyOrderCreated));
    }

    public void notifyOrderStatusChanged(UUID storeId, UUID orderId, String expectedStatus) {
        enqueue(storeId, "status", () -> {
            Optional<CustomerOrder> currentOrder = orders.findByIdWithItems(orderId)
                    .filter(order -> belongsToStore(order, storeId));
            if (currentOrder.isEmpty()) {
                return;
            }
            CustomerOrder order = currentOrder.get();
            if (expectedStatus != null && !expectedStatus.equals(order.getStatus())) {
                return;
            }
            wasender.notifyOrderStatusChanged(order);
        });
    }

    private void enqueue(UUID storeId, String action, Runnable task) {
        try {
            orderNotificationTaskExecutor.execute(() -> runSafely(storeId, action, task));
        } catch (TaskRejectedException ex) {
            logService.record(storeId, "WARN", "whatsapp", "Fila de WhatsApp cheia; executando notificacao de " + action + " no request atual.");
            runSafely(storeId, action, task);
        }
    }

    private void runSafely(UUID storeId, String action, Runnable task) {
        try {
            task.run();
        } catch (Exception ex) {
            String message = Optional.ofNullable(ex.getMessage()).orElse(ex.getClass().getSimpleName());
            logService.record(storeId, "WARN", "whatsapp", "Nao foi possivel notificar " + action + " do pedido no WhatsApp: " + message);
        }
    }

    private boolean belongsToStore(CustomerOrder order, UUID storeId) {
        return order != null && order.getStore() != null && order.getStore().getId().equals(storeId);
    }
}
