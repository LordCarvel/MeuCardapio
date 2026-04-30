package com.meucardapio.dev.vinis.meuCardapio.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.meucardapio.dev.vinis.meuCardapio.domain.Category;

public interface CategoryRepository extends JpaRepository<Category, UUID> {
    List<Category> findByStoreIdOrderByNameAsc(UUID storeId);
}
