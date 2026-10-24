package com.example.kokomi.entity;

import lombok.Data;

/** role_permission 中间表：角色拥有哪些权限 */
@Data
public class RolePermission {
    private Long id;
    private String roleCode;
    private String permCode;
}
