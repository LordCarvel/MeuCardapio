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

import com.meucardapio.dev.vinis.meuCardapio.api.dto.StoreDtos.StoreRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.StoreDtos.StoreResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.StoreDtos.MenuSnapshotRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.StoreDtos.StorePatchRequest;
import com.meucardapio.dev.vinis.meuCardapio.domain.Store;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreRepository;
import com.meucardapio.dev.vinis.meuCardapio.service.AppLogService;

import jakarta.transaction.Transactional;
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

    @GetMapping("/access/{accessKey}")
    public StoreResponse getByAccessKey(@PathVariable String accessKey) {
        return StoreResponse.from(stores.findByAccessKeyIgnoreCase(accessKey.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Chave de acesso nao encontrada")));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public StoreResponse create(@Valid @RequestBody StoreRequest request) {
        Store store = new Store(UUID.randomUUID(), request.tradeName(), request.ownerName(), request.email(), request.phone(), request.taxId(), request.category());
        apply(store, request);
        Store saved = stores.save(store);
        logService.record(saved.getId(), "INFO", "stores", "Loja criada: " + saved.getTradeName());
        return StoreResponse.from(saved);
    }

    @PutMapping("/{id}")
    @Transactional
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

    @PatchMapping("/{id}")
    @Transactional
    public StoreResponse patch(@PathVariable UUID id, @RequestBody StorePatchRequest request) {
        Store store = findStore(id);
        applyPatch(store, request);
        Store saved = stores.save(store);
        logService.record(saved.getId(), "INFO", "stores", "Campos da loja atualizados: " + saved.getTradeName());
        return StoreResponse.from(saved);
    }

    @PutMapping("/{id}/menu-snapshot")
    @Transactional
    public StoreResponse updateMenuSnapshot(@PathVariable UUID id, @RequestBody MenuSnapshotRequest request) {
        Store store = findStore(id);
        store.setMenuSnapshot(request.menuSnapshot());
        Store saved = stores.save(store);
        logService.record(saved.getId(), "INFO", "catalog", "Snapshot do cardapio atualizado");
        return StoreResponse.from(saved);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
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
        if (request.menuSnapshot() != null) {
            store.setMenuSnapshot(request.menuSnapshot());
        }
        store.setMinimumOrder(request.minimumOrder() == null ? BigDecimal.ZERO : request.minimumOrder());
        store.setDeliveryRadiusKm(request.deliveryRadiusKm() == null ? BigDecimal.valueOf(5) : request.deliveryRadiusKm());
        store.setServiceFee(request.serviceFee() == null ? BigDecimal.ZERO : request.serviceFee());
        store.setLat(request.lat());
        store.setLng(request.lng());
        store.setMapLabel(request.mapLabel());
        store.setVerifiedAt(request.verifiedAt());
    }

    private void applyPatch(Store store, StorePatchRequest request) {
        if (request.tradeName() != null) store.setTradeName(request.tradeName());
        if (request.ownerName() != null) store.setOwnerName(request.ownerName());
        if (request.email() != null) store.setEmail(request.email());
        if (request.phone() != null) store.setPhone(request.phone());
        if (request.taxId() != null) store.setTaxId(request.taxId());
        if (request.category() != null) store.setCategory(request.category());
        if (request.street() != null) store.setStreet(request.street());
        if (request.number() != null) store.setNumber(request.number());
        if (request.district() != null) store.setDistrict(request.district());
        if (request.cityName() != null) store.setCityName(request.cityName());
        if (request.state() != null) store.setState(request.state());
        if (request.schedule() != null) store.setSchedule(request.schedule());
        if (request.accessKey() != null) store.setAccessKey(request.accessKey());
        if (request.menuSnapshot() != null) store.setMenuSnapshot(request.menuSnapshot());
        if (request.minimumOrder() != null) store.setMinimumOrder(request.minimumOrder());
        if (request.deliveryRadiusKm() != null) store.setDeliveryRadiusKm(request.deliveryRadiusKm());
        if (request.serviceFee() != null) store.setServiceFee(request.serviceFee());
        if (request.lat() != null) store.setLat(request.lat());
        if (request.lng() != null) store.setLng(request.lng());
        if (request.mapLabel() != null) store.setMapLabel(request.mapLabel());
        if (request.verifiedAt() != null) store.setVerifiedAt(request.verifiedAt());
    }

    private Store findStore(UUID id) {
        return stores.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loja nao encontrada"));
    }
}
