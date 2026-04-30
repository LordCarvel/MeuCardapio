package com.meucardapio.dev.vinis.meuCardapio.config;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import com.meucardapio.dev.vinis.meuCardapio.domain.Category;
import com.meucardapio.dev.vinis.meuCardapio.domain.CustomerOrder;
import com.meucardapio.dev.vinis.meuCardapio.domain.OrderItem;
import com.meucardapio.dev.vinis.meuCardapio.domain.Product;
import com.meucardapio.dev.vinis.meuCardapio.domain.Store;
import com.meucardapio.dev.vinis.meuCardapio.domain.StoreUser;
import com.meucardapio.dev.vinis.meuCardapio.repository.CategoryRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.CustomerOrderRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.ProductRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreUserRepository;
import com.meucardapio.dev.vinis.meuCardapio.service.AppLogService;

@Configuration
public class DemoDataInitializer {
    @Bean
    CommandLineRunner seedDemoData(
            StoreRepository stores,
            StoreUserRepository users,
            CategoryRepository categories,
            ProductRepository products,
            CustomerOrderRepository orders,
            AppLogService logs) {
        return args -> {
            if (stores.count() > 0) {
                return;
            }

            BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
            Store store = new Store(UUID.randomUUID(), "MeuCardapio Demo", "Vinis", "demo@meucardapio.local", "(47) 99999-0000", "00.000.000/0001-00", "Pizzaria");
            store.setStreet("Rua das Flores");
            store.setNumber("120");
            store.setDistrict("Centro");
            store.setCityName("Penha");
            store.setState("SC");
            store.setSchedule("18:00 as 23:30");
            store = stores.save(store);

            users.save(new StoreUser(UUID.randomUUID(), store, "Administrador Demo", "demo@meucardapio.local", encoder.encode("123456"), "owner"));
            Category pizzas = categories.save(new Category(UUID.randomUUID(), store, "Pizzas", true));
            Category bebidas = categories.save(new Category(UUID.randomUUID(), store, "Bebidas", true));
            products.save(new Product(UUID.randomUUID(), store, pizzas, "Pizza grande", "Pizza grande com ate 2 sabores", BigDecimal.valueOf(54.90), 18, true));
            products.save(new Product(UUID.randomUUID(), store, bebidas, "Refrigerante 2L", "Bebida gelada", BigDecimal.valueOf(13.90), 24, true));

            CustomerOrder order = new CustomerOrder(UUID.randomUUID(), store, "Cliente Demo", "(47) 98888-7777", "pickup", "Cartao", "Pedido criado no seed");
            order.replaceItems(List.of(new OrderItem(UUID.randomUUID(), "Pizza grande", 1, BigDecimal.valueOf(54.90))), BigDecimal.ZERO);
            orders.save(order);

            logs.record(store.getId(), "INFO", "system", "Base demo criada. Usuario demo@meucardapio.local / senha 123456");
        };
    }
}
