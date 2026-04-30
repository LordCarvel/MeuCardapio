package com.meucardapio.dev.vinis.meuCardapio.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.meucardapio.dev.vinis.meuCardapio.domain.StoreUser;

public interface StoreUserRepository extends JpaRepository<StoreUser, UUID> {
    List<StoreUser> findByStoreIdOrderByCreatedAtAsc(UUID storeId);
    Optional<StoreUser> findByEmailIgnoreCase(String email);
}
