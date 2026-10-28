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

    /** 账号状态：0 正常 / 1 禁言（能登录不能发言）/ 2 封号（不能登录），见 BanLevel */
    private Integer status;
    /** 解除时间；为空且 status != 0 表示永久 */
    private LocalDateTime banUntil;
    /** 处罚理由，本人登录 / 发言被拦时展示 */
    private String banReason;

    /**
     * 邮箱是否已验证：1 已验证 / 0 未验证。
     * 只有验证过的账号才能发帖、评论、举报（防批量注册幽灵号）。
     */
    private Integer emailVerified;

    /**
     * 注销时间：非空 = 该账号已注销。
     * <p>
     * 注销后这一行**仍然保留**（不是物理删除）：帖子 / 评论的外键列是 NOT NULL
     * 且没有级联，删了 user 行会让所有帖子变成「查不到作者」的空壳。
     * 所以走的是「清空个人信息 + 保留骨架」，帖子上作者显示为「已注销用户」。
     * <p>
     * 和 status 正交：status 只管处罚（禁言 / 封号），注销不占用它。
     */
    private LocalDateTime deletedAt;

}