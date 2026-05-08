package com.meucardapio.dev.vinis.meuCardapio.domain;

import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "app_logs")
public class AppLog {
    @Id
    private UUID id;
    private UUID storeId;
    @Column(nullable = false, length = 20)
    private String level;
    @Column(nullable = false, length = 80)
    private String area;
    @Column(nullable = false, length = 500)
    private String message;
    @Column(nullable = false)
    private LocalDateTime createdAt;

    protected AppLog() {
    }

    public AppLog(UUID id, UUID storeId, String level, String area, String message) {
        this.id = id;
        this.storeId = storeId;
        this.level = level;
        this.area = area;
        this.message = message;
        this.createdAt = LocalDateTime.now();
    }

    public UUID getId() { return id; }
    public UUID getStoreId() { return storeId; }
    public String getLevel() { return level; }
    public String getArea() { return area; }
    public String getMessage() { return message; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
