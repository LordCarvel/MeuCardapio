package com.meucardapio.dev.vinis.meuCardapio.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.meucardapio.dev.vinis.meuCardapio.domain.Product;

public interface ProductRepository extends JpaRepository<Product, UUID> {
    @Query("select p from Product p left join fetch p.category where p.store.id = :storeId order by p.name asc")
    List<Product> findByStoreIdOrderByNameAsc(@Param("storeId") UUID storeId);

    long countByStoreId(UUID storeId);
    long countByStoreIdAndActiveTrue(UUID storeId);
}
