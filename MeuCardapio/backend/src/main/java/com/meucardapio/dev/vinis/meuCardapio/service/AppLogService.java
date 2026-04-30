package com.meucardapio.dev.vinis.meuCardapio.service;

import java.util.UUID;

import org.springframework.stereotype.Service;

import com.meucardapio.dev.vinis.meuCardapio.domain.AppLog;
import com.meucardapio.dev.vinis.meuCardapio.repository.AppLogRepository;

@Service
public class AppLogService {
    private final AppLogRepository logs;

    public AppLogService(AppLogRepository logs) {
        this.logs = logs;
    }

    public AppLog record(UUID storeId, String level, String area, String message) {
        return logs.save(new AppLog(UUID.randomUUID(), storeId, normalize(level), area, message));
    }

    private String normalize(String level) {
        String value = String.valueOf(level == null ? "INFO" : level).trim().toUpperCase();
        return value.isBlank() ? "INFO" : value;
    }
}
