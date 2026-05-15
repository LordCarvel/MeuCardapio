package com.meucardapio.dev.vinis.meuCardapio;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

import com.meucardapio.dev.vinis.meuCardapio.domain.Store;
import com.meucardapio.dev.vinis.meuCardapio.repository.StoreRepository;

@SpringBootTest
@AutoConfigureMockMvc
class WhatsappBotControllerTests {
    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private StoreRepository stores;

    private UUID storeId;

    @BeforeEach
    void setUp() {
        stores.deleteAll();
        Store store = stores.save(new Store(UUID.randomUUID(), "Loja Teste", "Dono", "loja@example.com", "47999999999", "00000000000100", "Pizzaria"));
        storeId = store.getId();
    }

    @Test
    void understandsShortExpectedCustomerReplies() throws Exception {
        testBot("ver meus pedidos")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.intent").value("ORDER_STATUS"))
                .andExpect(jsonPath("$.response", containsString("3 - Acompanhar pedido")));

        testBot("pedido")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.intent").value("ORDER_STATUS"))
                .andExpect(jsonPath("$.response", containsString("7 - Atendente")));

        testBot("pix")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.intent").value("PAYMENT_METHODS"));

        testBot("entrega")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.intent").value("DELIVERY_INFO"));

        testBot("cardapio")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.intent").value("VIEW_CATALOG"))
                .andExpect(jsonPath("$.response", containsString("1 - Cardapio")));
    }

    private org.springframework.test.web.servlet.ResultActions testBot(String text) throws Exception {
        return mockMvc.perform(post("/api/stores/{storeId}/whatsapp/bot/test", storeId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\":\"" + text + "\",\"remoteJid\":\"5547999999999@s.whatsapp.net\"}"));
    }
}
