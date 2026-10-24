package com.example.kokomi.vo;

import lombok.Data;

import java.util.List;

/** 后台「角色权限」页的一个角色：身份信息 + 名下用户数 + 已勾选的权限码 */
@Data
public class AdminRoleVO {
    private String roleCode;
    private String roleName;
    private String description;
    /** 1 = 系统内置，前端据此隐藏「删除」按钮、锁住编码输入 */
    private Integer isSystem;
    private Integer sort;
    /** 有多少用户挂着这个角色 */
    private Integer userCount;
    /** 该角色拥有的权限码 */
    private List<String> permissions;
}
