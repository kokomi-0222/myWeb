package com.example.kokomi.entity;

import lombok.Data;

/**
 * role 表：角色字典。
 * <p>
 * 权限判断只看 user_role + role_permission，这张表只负责「有哪些角色」，
 * 以及后台展示用的名字、说明、排序。
 */
@Data
public class Role {
    private Long id;
    /** 角色编码（唯一，接口/缓存里用的就是它） */
    private String roleCode;
    /** 显示名，如「管理员」 */
    private String roleName;
    /** 后台角色卡片上的一句说明 */
    private String description;
    /** 1 = 系统内置：不可删除、编码不可改 */
    private Integer isSystem;
    /** 排序，同时决定 primary_role 的优先级（越小越高） */
    private Integer sort;
}
