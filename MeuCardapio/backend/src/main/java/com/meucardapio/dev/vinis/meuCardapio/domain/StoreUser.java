package com.meucardapio.dev.vinis.meuCardapio.domain;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "store_users")
public class StoreUser {
    @Id
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;
    @Column(nullable = false, length = 120)
    private String name;
    @Column(nullable = false, unique = true, length = 160)
    private String email;
    @Column(nullable = false, length = 120)
    private String passwordHash;
    @Column(nullable = false, length = 30)
    private String role;
    @Column(nullable = false)
    private LocalDateTime createdAt;

    protected StoreUser() {
    }

    public StoreUser(UUID id, Store store, String name, String email, String passwordHash, String role) {
        this.id = id;
        this.store = store;
        this.name = name;
        this.email = email;
        this.passwordHash = passwordHash;
        this.role = role;
        this.createdAt = LocalDateTime.now();
    }

    public UUID getId() { return id; }
    public Store getStore() { return store; }
    public String getName() { return name; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public String getRole() { return role; }
    public LocalDateTime getCreatedAt() { return createdAt; }

    public void changePassword(String passwordHash) {
        this.passwordHash = passwordHash;
    }
}
