package com.meucardapio.dev.vinis.meuCardapio.repository;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.meucardapio.dev.vinis.meuCardapio.domain.AppLog;

public interface AppLogRepository extends JpaRepository<AppLog, UUID> {
    List<AppLog> findTop50ByOrderByCreatedAtDesc();
    List<AppLog> findTop50ByStoreIdOrderByCreatedAtDesc(UUID storeId);
}
