package com.example.kokomi.dto;

import lombok.Data;

@Data
public class LoginEncryptDTO {
    // 对应前端传的字段名
    private String encryptedData;
}
