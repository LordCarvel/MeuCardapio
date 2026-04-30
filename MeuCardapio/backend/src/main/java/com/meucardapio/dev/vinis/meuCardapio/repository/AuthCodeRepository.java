package com.meucardapio.dev.vinis.meuCardapio.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

import com.meucardapio.dev.vinis.meuCardapio.domain.AuthCode;

public interface AuthCodeRepository extends JpaRepository<AuthCode, UUID> {
    Optional<AuthCode> findTopByEmailIgnoreCaseAndPurposeAndUsedAtIsNullOrderByCreatedAtDesc(String email, String purpose);
}
