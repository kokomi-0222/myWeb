package com.example.kokomi.dto;

import lombok.Data;

@Data
public class RegisterDTO {
    private String account;
    private String password;
    private String confirmPassword;
}
