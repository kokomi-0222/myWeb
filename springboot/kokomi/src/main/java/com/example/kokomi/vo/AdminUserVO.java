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
}
