package com.meucardapio.dev.vinis.meuCardapio.api;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.meucardapio.dev.vinis.meuCardapio.api.dto.StoreDtos.StoreRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.StoreDtos.StoreResponse;
import com.meucardapio.dev.vinis.meuCardapio.domain.Store;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreRepository;
import com.meucardapio.dev.vinis.meuCardapio.service.AppLogService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/stores")
public class StoreController {
    private final StoreRepository stores;
    private final AppLogService logService;

    public StoreController(StoreRepository stores, AppLogService logService) {
        this.stores = stores;
        this.logService = logService;
    }

    @GetMapping
    public List<StoreResponse> list() {
        return stores.findAll().stream().map(StoreResponse::from).toList();
    }

    @GetMapping("/{id}")
    public StoreResponse get(@PathVariable UUID id) {
        return StoreResponse.from(findStore(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StoreResponse create(@Valid @RequestBody StoreRequest request) {
        Store store = new Store(UUID.randomUUID(), request.tradeName(), request.ownerName(), request.email(), request.phone(), request.taxId(), request.category());
        apply(store, request);
        Store saved = stores.save(store);
        logService.record(saved.getId(), "INFO", "stores", "Loja criada: " + saved.getTradeName());
        return StoreResponse.from(saved);
    }

    @PutMapping("/{id}")
    public StoreResponse update(@PathVariable UUID id, @Valid @RequestBody StoreRequest request) {
        Store store = findStore(id);
        store.setTradeName(request.tradeName());
        store.setOwnerName(request.ownerName());
        store.setEmail(request.email());
        store.setPhone(request.phone());
        store.setTaxId(request.taxId());
        store.setCategory(request.category());
        apply(store, request);
        Store saved = stores.save(store);
        logService.record(saved.getId(), "INFO", "stores", "Loja atualizada: " + saved.getTradeName());
        return StoreResponse.from(saved);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        stores.delete(findStore(id));
        logService.record(id, "WARN", "stores", "Loja removida");
    }

    private void apply(Store store, StoreRequest request) {
        store.setStreet(request.street());
        store.setNumber(request.number());
        store.setDistrict(request.district());
        store.setCityName(request.cityName());
        store.setState(request.state());
        store.setSchedule(request.schedule());
        store.setAccessKey(request.accessKey());
        store.setMinimumOrder(request.minimumOrder() == null ? BigDecimal.ZERO : request.minimumOrder());
        store.setDeliveryRadiusKm(request.deliveryRadiusKm() == null ? BigDecimal.valueOf(5) : request.deliveryRadiusKm());
    }

    private Store findStore(UUID id) {
        return stores.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loja nao encontrada"));
    }
}
