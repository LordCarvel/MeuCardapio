package com.meucardapio.dev.vinis.meuCardapio.domain;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "stores")
public class Store {
    @Id
    private UUID id;
    @Column(nullable = false, length = 120)
    private String tradeName;
    @Column(nullable = false, length = 120)
    private String ownerName;
    @Column(nullable = false, length = 160)
    private String email;
    @Column(nullable = false, length = 40)
    private String phone;
    @Column(nullable = false, length = 40)
    private String taxId;
    @Column(nullable = false, length = 80)
    private String category;
    @Column(length = 160)
    private String street;
    @Column(length = 30)
    private String number;
    @Column(length = 100)
    private String district;
    @Column(length = 100)
    private String cityName;
    @Column(length = 2)
    private String state;
    @Column(length = 160)
    private String schedule;
    @Column(name = "access_key", length = 120)
    private String accessKey;
    @Column(name = "menu_snapshot", columnDefinition = "text")
    private String menuSnapshot;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal minimumOrder;
    @Column(nullable = false, precision = 8, scale = 2)
    private BigDecimal deliveryRadiusKm;
    @Column(nullable = false)
    private LocalDateTime createdAt;

    protected Store() {
    }

    public Store(UUID id, String tradeName, String ownerName, String email, String phone, String taxId, String category) {
        this.id = id;
        this.tradeName = tradeName;
        this.ownerName = ownerName;
        this.email = email;
        this.phone = phone;
        this.taxId = taxId;
        this.category = category;
        this.minimumOrder = BigDecimal.ZERO;
        this.deliveryRadiusKm = BigDecimal.valueOf(5);
        this.createdAt = LocalDateTime.now();
    }

    public UUID getId() { return id; }
    public String getTradeName() { return tradeName; }
    public void setTradeName(String tradeName) { this.tradeName = tradeName; }
    public String getOwnerName() { return ownerName; }
    public void setOwnerName(String ownerName) { this.ownerName = ownerName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getTaxId() { return taxId; }
    public void setTaxId(String taxId) { this.taxId = taxId; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getStreet() { return street; }
    public void setStreet(String street) { this.street = street; }
    public String getNumber() { return number; }
    public void setNumber(String number) { this.number = number; }
    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }
    public String getCityName() { return cityName; }
    public void setCityName(String cityName) { this.cityName = cityName; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getSchedule() { return schedule; }
    public void setSchedule(String schedule) { this.schedule = schedule; }
    public String getAccessKey() { return accessKey; }
    public void setAccessKey(String accessKey) { this.accessKey = accessKey; }
    public String getMenuSnapshot() { return menuSnapshot; }
    public void setMenuSnapshot(String menuSnapshot) { this.menuSnapshot = menuSnapshot; }
    public BigDecimal getMinimumOrder() { return minimumOrder; }
    public void setMinimumOrder(BigDecimal minimumOrder) { this.minimumOrder = minimumOrder; }
    public BigDecimal getDeliveryRadiusKm() { return deliveryRadiusKm; }
    public void setDeliveryRadiusKm(BigDecimal deliveryRadiusKm) { this.deliveryRadiusKm = deliveryRadiusKm; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
