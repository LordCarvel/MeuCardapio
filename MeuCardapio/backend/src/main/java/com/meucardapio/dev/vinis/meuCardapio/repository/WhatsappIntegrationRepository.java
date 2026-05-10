package com.meucardapio.dev.vinis.meuCardapio.repository;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.meucardapio.dev.vinis.meuCardapio.domain.WhatsappIntegration;

public interface WhatsappIntegrationRepository extends JpaRepository<WhatsappIntegration, UUID> {
}
