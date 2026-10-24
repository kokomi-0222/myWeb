package com.example.kokomi.entity;

import java.time.LocalDate;
import java.time.LocalDateTime;

import lombok.Data;

/**
 * 实体类（DO / PO）
 * 与数据库 user 表完全对应
 * 只包含数据库字段，不参与业务逻辑
 */
@Data
public class User {
    private Long id;
    private String username;
    private String password;
    private String name;
    private String nameColor;
    /** 身份标签（名字旁边那个小方块）的底色；为空时前端回退用 nameColor */
    private String roleColor;
    private String primaryRole;
    private String avatar;
    private String badge;
    private String ornament;
    private LocalDate birthday;
    private String email;
    private String gender;
    private String phone;
    private String signature;
    private LocalDateTime createTime;
    private Integer tokenVersion;

}