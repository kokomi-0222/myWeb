package com.example.kokomi.dto;

import lombok.Data;

@Data
public class EncryptDataDTO {
    private String encryptedData;
    private String captchaKey;
    private String captchaCode;
}
