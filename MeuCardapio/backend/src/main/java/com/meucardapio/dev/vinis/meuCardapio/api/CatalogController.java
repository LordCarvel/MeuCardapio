package com.meucardapio.dev.vinis.meuCardapio.api;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.meucardapio.dev.vinis.meuCardapio.api.dto.CatalogDtos.CategoryRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.CatalogDtos.CategoryResponse;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.CatalogDtos.ProductRequest;
import com.meucardapio.dev.vinis.meuCardapio.api.dto.CatalogDtos.ProductResponse;
import com.meucardapio.dev.vinis.meuCardapio.domain.Category;
import com.meucardapio.dev.vinis.meuCardapio.domain.Product;
import com.meucardapio.dev.vinis.meuCardapio.domain.Store;
import com.meucardapio.dev.vinis.meuCardapio.repository.CategoryRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.ProductRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreRepository;
import com.meucardapio.dev.vinis.meuCardapio.service.AppLogService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/stores/{storeId}")
public class CatalogController {
    private final StoreRepository stores;
    private final CategoryRepository categories;
    private final ProductRepository products;
    private final AppLogService logService;

    public CatalogController(StoreRepository stores, CategoryRepository categories, ProductRepository products, AppLogService logService) {
        this.stores = stores;
        this.categories = categories;
        this.products = products;
        this.logService = logService;
    }

    @GetMapping("/categories")
    public List<CategoryResponse> categories(@PathVariable UUID storeId) {
        return categories.findByStoreIdOrderByNameAsc(storeId).stream().map(CategoryResponse::from).toList();
    }

    @PostMapping("/categories")
    @ResponseStatus(HttpStatus.CREATED)
    public CategoryResponse createCategory(@PathVariable UUID storeId, @Valid @RequestBody CategoryRequest request) {
        Store store = findStore(storeId);
        Category category = categories.save(new Category(UUID.randomUUID(), store, request.name(), request.imageUrl(), request.active() == null || request.active()));
        logService.record(storeId, "INFO", "catalog", "Categoria criada: " + category.getName());
        return CategoryResponse.from(category);
    }

    @GetMapping("/products")
    public List<ProductResponse> products(@PathVariable UUID storeId) {
        return products.findByStoreIdOrderByNameAsc(storeId).stream().map(ProductResponse::from).toList();
    }

    @PostMapping("/products")
    @ResponseStatus(HttpStatus.CREATED)
    public ProductResponse createProduct(@PathVariable UUID storeId, @Valid @RequestBody ProductRequest request) {
        Store store = findStore(storeId);
        Category category = request.categoryId() == null ? null : categories.findById(request.categoryId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Categoria nao encontrada"));
        Product product = products.save(new Product(
                UUID.randomUUID(),
                store,
                category,
                request.name(),
                request.description(),
                request.imageUrl(),
                request.price(),
                request.stock() == null ? 0 : request.stock(),
                request.active() == null || request.active()));
        logService.record(storeId, "INFO", "catalog", "Produto criado: " + product.getName());
        return ProductResponse.from(product);
    }

    private Store findStore(UUID storeId) {
        return stores.findById(storeId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Loja nao encontrada"));
    }
}
