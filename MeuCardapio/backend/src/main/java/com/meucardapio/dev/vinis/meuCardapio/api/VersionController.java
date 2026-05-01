package com.meucardapio.dev.vinis.meuCardapio.api;

import java.time.OffsetDateTime;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class VersionController {
    private final String renderGitCommit;

    public VersionController(@Value("${RENDER_GIT_COMMIT:local}") String renderGitCommit) {
        this.renderGitCommit = renderGitCommit;
    }

    @GetMapping("/version")
    public Map<String, Object> version() {
        return Map.of(
                "service", "MeuCardapio API",
                "commit", renderGitCommit,
                "builtFor", "email-auth-signup",
                "checkedAt", OffsetDateTime.now().toString());
    }
}
