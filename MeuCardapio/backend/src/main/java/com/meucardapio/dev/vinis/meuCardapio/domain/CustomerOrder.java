package com.meucardapio.dev.vinis.meuCardapio.domain;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

@Entity
@Table(name = "orders")
public class CustomerOrder {
    @Id
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "store_id", nullable = false)
    private Store store;
    @Column(nullable = false, length = 120)
    private String customerName;
    @Column(length = 40)
    private String customerPhone;
    @Column(name = "order_number")
    private Integer orderNumber;
    @Column(nullable = false, length = 30)
    private String fulfillment;
    @Column(nullable = false, length = 30)
    private String status;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal subtotal;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal deliveryFee;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal total;
    @Column(nullable = false, length = 40)
    private String payment;
    @Column(length = 500)
    private String note;
    @Column(nullable = false)
    private LocalDateTime createdAt;
    @Column(nullable = false)
    private LocalDateTime updatedAt;
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderItem> items = new ArrayList<>();

    protected CustomerOrder() {
    }

    public CustomerOrder(UUID id, Store store, String customerName, String customerPhone, String fulfillment, String payment, String note) {
        this.id = id;
        this.store = store;
        this.customerName = customerName;
        this.customerPhone = customerPhone;
        this.fulfillment = fulfillment;
        this.status = "analysis";
        this.payment = payment;
        this.note = note;
        this.subtotal = BigDecimal.ZERO;
        this.deliveryFee = BigDecimal.ZERO;
        this.total = BigDecimal.ZERO;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = this.createdAt;
    }

    public void replaceItems(List<OrderItem> nextItems, BigDecimal deliveryFee) {
        items.clear();
        BigDecimal nextSubtotal = BigDecimal.ZERO;
        for (OrderItem item : nextItems) {
            item.attachTo(this);
            items.add(item);
            nextSubtotal = nextSubtotal.add(item.getTotalPrice());
        }
        this.subtotal = nextSubtotal;
        this.deliveryFee = deliveryFee == null ? BigDecimal.ZERO : deliveryFee;
        this.total = this.subtotal.add(this.deliveryFee);
        this.updatedAt = LocalDateTime.now();
    }

    public void updateDetails(String customerName, String customerPhone, String fulfillment, String payment, String note) {
        this.customerName = customerName;
        this.customerPhone = customerPhone;
        this.fulfillment = fulfillment;
        this.payment = payment;
        this.note = note;
        this.updatedAt = LocalDateTime.now();
    }

    public void setStatus(String status) {
        this.status = status;
        this.updatedAt = LocalDateTime.now();
    }

    public void setOrderNumber(Integer orderNumber) {
        this.orderNumber = orderNumber;
    }

    public UUID getId() { return id; }
    public Store getStore() { return store; }
    public String getCustomerName() { return customerName; }
    public String getCustomerPhone() { return customerPhone; }
    public Integer getOrderNumber() { return orderNumber; }
    public String getFulfillment() { return fulfillment; }
    public String getStatus() { return status; }
    public BigDecimal getSubtotal() { return subtotal; }
    public BigDecimal getDeliveryFee() { return deliveryFee; }
    public BigDecimal getTotal() { return total; }
    public String getPayment() { return payment; }
    public String getNote() { return note; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public List<OrderItem> getItems() { return items; }
}
