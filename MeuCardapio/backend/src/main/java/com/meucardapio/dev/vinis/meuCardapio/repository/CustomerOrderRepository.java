package com.meucardapio.dev.vinis.meuCardapio.repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.meucardapio.dev.vinis.meuCardapio.domain.CustomerOrder;

public interface CustomerOrderRepository extends JpaRepository<CustomerOrder, UUID> {
    @Query("select distinct o from CustomerOrder o join fetch o.store left join fetch o.items where o.store.id = :storeId order by o.createdAt desc")
    List<CustomerOrder> findByStoreIdOrderByCreatedAtDesc(@Param("storeId") UUID storeId);

    @Query("select o from CustomerOrder o join fetch o.store left join fetch o.items where o.id = :orderId")
    Optional<CustomerOrder> findByIdWithItems(@Param("orderId") UUID orderId);

    @Query("select coalesce(max(o.orderNumber), 8300) from CustomerOrder o where o.store.id = :storeId")
    int findLastOrderNumberByStoreId(@Param("storeId") UUID storeId);

    long countByStoreId(UUID storeId);
    long countByStoreIdAndStatusNot(UUID storeId, String status);

    @Query("select coalesce(sum(o.total), 0) from CustomerOrder o where o.store.id = :storeId and o.status <> 'cancelled'")
    BigDecimal sumRevenueByStoreId(@Param("storeId") UUID storeId);
}
