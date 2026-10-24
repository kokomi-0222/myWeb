package com.example.kokomi.bo;

import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class UserBO {
    private Long id;
    private String username;
    private String name;
    private String nameColor;
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
    private Integer tokenVersion;

    /**
     * 处罚状态：0 正常 / 1 禁言（能登录不能发言）/ 2 封号（不能登录）。
     * 前端拿它决定要不要禁用发布框，真正的拦截在后端。
     */
    private Integer status;
    /** 解除时间，null 且 status != 0 表示永久 */
    private LocalDateTime banUntil;
    private String banReason;

    // 角色、权限
    private List<String> roles;
    private List<String> permissions;
}