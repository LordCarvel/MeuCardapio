package com.meucardapio.dev.vinis.meuCardapio.domain;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "auth_codes")
public class AuthCode {
    @Id
    private UUID id;
    @Column(nullable = false, length = 160)
    private String email;
    @Column(nullable = false, length = 40)
    private String purpose;
    @Column(nullable = false, length = 120)
    private String codeHash;
    @Column(nullable = false)
    private LocalDateTime expiresAt;
    private LocalDateTime usedAt;
    @Column(nullable = false)
    private LocalDateTime createdAt;

    protected AuthCode() {
    }

    public AuthCode(UUID id, String email, String purpose, String codeHash, LocalDateTime expiresAt) {
        this.id = id;
        this.email = email;
        this.purpose = purpose;
        this.codeHash = codeHash;
        this.expiresAt = expiresAt;
        this.createdAt = LocalDateTime.now();
    }

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public String getPurpose() { return purpose; }
    public String getCodeHash() { return codeHash; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public LocalDateTime getUsedAt() { return usedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }

    public boolean isExpired() {
        return LocalDateTime.now().isAfter(expiresAt);
    }

    public boolean isUsed() {
        return usedAt != null;
    }

    public void markUsed() {
        this.usedAt = LocalDateTime.now();
    }
}
