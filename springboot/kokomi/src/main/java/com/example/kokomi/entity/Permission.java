package com.example.kokomi.entity;

import lombok.Data;

@Data

public class Permission {
    private Long id;
    private String permCode;  // 权限编码：post:create
}