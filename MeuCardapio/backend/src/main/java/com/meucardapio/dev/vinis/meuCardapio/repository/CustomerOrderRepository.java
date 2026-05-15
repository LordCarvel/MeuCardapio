package com.meucardapio.dev.vinis.meuCardapio.repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.meucardapio.dev.vinis.meuCardapio.domain.CustomerOrder;

import jakarta.persistence.LockModeType;

public interface CustomerOrderRepository extends JpaRepository<CustomerOrder, UUID> {
    @Query("select distinct o from CustomerOrder o join fetch o.store left join fetch o.items where o.store.id = :storeId order by o.createdAt desc")
    List<CustomerOrder> findByStoreIdOrderByCreatedAtDesc(@Param("storeId") UUID storeId);

    @Query("""
            select distinct o from CustomerOrder o join fetch o.store left join fetch o.items
            where o.store.id = :storeId
              and o.createdAt >= :createdAfter
              and lower(o.status) not in ('completed', 'cancelled', 'canceled')
            order by o.createdAt desc
            """)
    List<CustomerOrder> findBoardByStoreIdSince(@Param("storeId") UUID storeId, @Param("createdAfter") LocalDateTime createdAfter);

    @Query("select o from CustomerOrder o join fetch o.store left join fetch o.items where o.id = :orderId")
    Optional<CustomerOrder> findByIdWithItems(@Param("orderId") UUID orderId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from CustomerOrder o join fetch o.store where o.id = :orderId")
    Optional<CustomerOrder> findByIdForUpdate(@Param("orderId") UUID orderId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from CustomerOrder o join fetch o.store where o.store.id = :storeId and o.sourceOrderId = :sourceOrderId")
    Optional<CustomerOrder> findByStoreIdAndSourceOrderIdForUpdate(@Param("storeId") UUID storeId, @Param("sourceOrderId") String sourceOrderId);

    @Query("select coalesce(max(o.orderNumber), 8300) from CustomerOrder o where o.store.id = :storeId")
    int findLastOrderNumberByStoreId(@Param("storeId") UUID storeId);

    long countByStoreId(UUID storeId);
    long countByStoreIdAndStatusNot(UUID storeId, String status);

    @Query("select coalesce(sum(o.total), 0) from CustomerOrder o where o.store.id = :storeId and o.status <> 'cancelled'")
    BigDecimal sumRevenueByStoreId(@Param("storeId") UUID storeId);
}
