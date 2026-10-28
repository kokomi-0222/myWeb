package com.example.kokomi.vo;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 用户管理页的列表项。
 * 只带管理需要的字段，不返回密码、邮箱、token_version 等敏感信息。
 */
@Data
public class AdminUserVO {
    private Long id;
    private String username;
    private String name;
    private String avatar;
    /** 名字颜色（#RRGGBB），空表示用前端默认色 */
    private String nameColor;
    /** 身份标签（名字旁小方块）的底色（#RRGGBB），空表示回退用 nameColor */
    private String roleColor;
    /** user.primary_role，仅用于展示，鉴权看 roles/permissions */
    private String primaryRole;
    /** user_role 里挂着的角色编码 */
    private List<String> roles;
    private LocalDateTime createTime;

    /** 0 正常 / 1 禁言（能登录不能发帖评论）/ 2 封号（不能登录） */
    private Integer status;
    /** 解除时间，null 且 status != 0 表示永久 */
    private LocalDateTime banUntil;
    private String banReason;

    /**
     * 邮箱是否已验证。
     * <p>
     * 注意要和 {@link #email} 一起看：`emailVerified = false` 且 `email` 为空，
     * 说明这个账号**还没绑过邮箱**（升级前注册的存量游客），这时候「激活」按钮没有意义 ——
     * 后端会拒绝（没有邮箱可标记），应该引导他去个人中心绑定。
     */
    private Boolean emailVerified;

    /** 绑定的邮箱，没绑过是 null */
    private String email;

    /**
     * 注销时间，非空 = 该账号已注销。
     * <p>
     * 注销后这一行还在（帖子要挂在上面），但邮箱、昵称、头像都已被清空，
     * 所以后台默认**不显示**这些人，只有打开「显示已注销」筛选才会带出来。
     * 前端据此把整行置灰，并隐藏「处罚 / 改角色」这些对死人没意义的按钮。
     */
    private LocalDateTime deletedAt;
}
