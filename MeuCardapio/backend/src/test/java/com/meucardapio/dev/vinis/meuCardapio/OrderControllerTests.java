package com.meucardapio.dev.vinis.meuCardapio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.meucardapio.dev.vinis.meuCardapio.domain.Store;
import com.meucardapio.dev.vinis.meuCardapio.repository.CustomerOrderRepository;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreRepository;

@SpringBootTest
@AutoConfigureMockMvc
class OrderControllerTests {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private StoreRepository stores;
    @Autowired
    private CustomerOrderRepository orders;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private UUID storeId;

    @BeforeEach
    void setUp() {
        orders.deleteAll();
        stores.deleteAll();
        Store store = stores.save(new Store(UUID.randomUUID(), "Loja Teste", "Dono", "loja@example.com", "47999999999", "00000000000100", "Pizzaria"));
        storeId = store.getId();
    }

    @Test
    void createOrderIsIdempotentBySourceOrderId() throws Exception {
        JsonNode first = postOrder(orderJson("front-100", "analysis", "Item A", "10.00"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.sourceOrderId").value("front-100"))
                .andReturnJson();

        JsonNode repeated = postOrder(orderJson("front-100", "analysis", "Item B", "99.00"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(first.path("id").asText()))
                .andExpect(jsonPath("$.total").value(10.0))
                .andReturnJson();

        assertThat(repeated.path("orderNumber").asInt()).isEqualTo(first.path("orderNumber").asInt());
        assertThat(orders.countByStoreId(storeId)).isEqualTo(1);
    }

    @Test
    void staleStatusUpdateCannotMoveOrderBackOrRewriteItems() throws Exception {
        JsonNode created = postOrder(orderJson("front-200", "analysis", "Item A", "10.00"))
                .andExpect(status().isCreated())
                .andReturnJson();
        String orderId = created.path("id").asText();

        patchStatus(orderId, "production")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("production"));
        patchStatus(orderId, "completed")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("completed"));

        patchStatus(orderId, "production")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("completed"));

        mockMvc.perform(put("/api/stores/{storeId}/orders/{orderId}", storeId, orderId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(orderJson("front-200", "analysis", "Item Antigo", "99.00")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("completed"))
                .andExpect(jsonPath("$.total").value(10.0));
    }

    private ResultActionsWithJson postOrder(String body) throws Exception {
        return new ResultActionsWithJson(mockMvc.perform(post("/api/stores/{storeId}/orders", storeId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)));
    }

    private org.springframework.test.web.servlet.ResultActions patchStatus(String orderId, String status) throws Exception {
        return mockMvc.perform(patch("/api/stores/{storeId}/orders/{orderId}/status", storeId, orderId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"" + status + "\"}"));
    }

    private String orderJson(String sourceOrderId, String status, String productName, String unitPrice) {
        return """
                {
                  "customerName": "Cliente Teste",
                  "customerPhone": "5547999999999",
                  "fulfillment": "pickup",
                  "payment": "Pix",
                  "status": "%s",
                  "sourceOrderId": "%s",
                  "source": "Teste",
                  "deliveryFee": 0,
                  "items": [
                    { "productName": "%s", "quantity": 1, "unitPrice": %s }
                  ]
                }
                """.formatted(status, sourceOrderId, productName, unitPrice);
    }

    private final class ResultActionsWithJson {
        private final org.springframework.test.web.servlet.ResultActions delegate;

        private ResultActionsWithJson(org.springframework.test.web.servlet.ResultActions delegate) {
            this.delegate = delegate;
        }

        private ResultActionsWithJson andExpect(org.springframework.test.web.servlet.ResultMatcher matcher) throws Exception {
            delegate.andExpect(matcher);
            return this;
        }

        private JsonNode andReturnJson() throws Exception {
            return objectMapper.readTree(delegate.andReturn().getResponse().getContentAsString());
        }
    }
}
