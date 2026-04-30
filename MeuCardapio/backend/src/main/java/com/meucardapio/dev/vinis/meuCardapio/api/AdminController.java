package com.meucardapio.dev.vinis.meuCardapio.api;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.meucardapio.dev.vinis.meuCardapio.api.dto.AdminDtos.LogRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.AdminDtos.LogResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.AdminDtos.ReportSummary;
import com.meucardapio.dev.vinis.meuCardapio.repository.AppLogRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.CustomerOrderRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.ProductRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreRepository;
import com.meucardapio.dev.vinis.meuCardapio.service.AppLogService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api")
public class AdminController {
    private final StoreRepository stores;
    private final ProductRepository products;
    private final CustomerOrderRepository orders;
    private final AppLogRepository logs;
    private final AppLogService logService;

    public AdminController(StoreRepository stores, ProductRepository products, CustomerOrderRepository orders, AppLogRepository logs, AppLogService logService) {
        this.stores = stores;
        this.products = products;
        this.orders = orders;
        this.logs = logs;
        this.logService = logService;
    }

    @GetMapping("/health")
    public Object health() {
        return java.util.Map.of("status", "UP", "service", "MeuCardapio API");
    }

    @GetMapping("/logs")
    public List<LogResponse> logs(@RequestParam(required = false) UUID storeId) {
        return (storeId == null ? logs.findTop50ByOrderByCreatedAtDesc() : logs.findTop50ByStoreIdOrderByCreatedAtDesc(storeId))
                .stream()
                .map(LogResponse::from)
                .toList();
    }

    @PostMapping("/logs")
    public LogResponse createLog(@Valid @RequestBody LogRequest request) {
        return LogResponse.from(logService.record(request.storeId(), request.level(), request.area(), request.message()));
    }

    @GetMapping("/reports/summary")
    public ReportSummary summary(@RequestParam(required = false) UUID storeId) {
        if (storeId == null) {
            return new ReportSummary(null, stores.count(), 0, 0, 0, 0, BigDecimal.ZERO);
        }

        return new ReportSummary(
                storeId,
                1,
                products.countByStoreId(storeId),
                products.countByStoreIdAndActiveTrue(storeId),
                orders.countByStoreId(storeId),
                orders.countByStoreIdAndStatusNot(storeId, "completed"),
                orders.sumRevenueByStoreId(storeId));
    }
}
