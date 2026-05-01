package com.meucardapio.dev.vinis.meuCardapio;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class AuthControllerTests {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void authStatusListsAvailableEndpoints() throws Exception {
        mockMvc.perform(get("/api/auth/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.endpoints[0]").value("/api/auth/login"));
    }

    @Test
    void signupCodeEndpointIsMappedAndReturnsJsonErrorWhenSmtpIsMissing() throws Exception {
        mockMvc.perform(post("/api/auth/signup/request-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"novo-cliente@example.com\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.ok").value(false))
                .andExpect(jsonPath("$.message", containsString("SMTP_HOST")));
    }

    @Test
    void unifiedCodeEndpointIsMapped() throws Exception {
        mockMvc.perform(post("/api/auth/codes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"novo-cliente@example.com\",\"purpose\":\"SIGNUP\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.ok").value(false));
    }
}
