package com.example.kokomi.entity;

import lombok.Data;

/**
 * user_role 表实体：用户与角色的多对多关系。
 * 一个用户可以同时拥有多个角色（取权限并集）。
 */
@Data
public class UserRole {
    private Long id;
    private Long userId;
    private String roleCode;
}
