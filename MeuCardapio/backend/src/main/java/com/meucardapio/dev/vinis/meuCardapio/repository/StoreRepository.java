package com.meucardapio.dev.vinis.meuCardapio.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.meucardapio.dev.vinis.meuCardapio.domain.Store;

public interface StoreRepository extends JpaRepository<Store, UUID> {
}
