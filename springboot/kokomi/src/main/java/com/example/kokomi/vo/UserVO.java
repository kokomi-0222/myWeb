package com.example.kokomi.vo;

import com.example.kokomi.bo.UserBO;

import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class UserVO {
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

    /** 0 正常 / 1 禁言（能登录不能发帖评论）/ 2 封号（不能登录） */
    private Integer status;
    /** 解除时间，null 且 status != 0 表示永久 */
    private LocalDateTime banUntil;
    private String banReason;

    /** 邮箱是否已验证：false 时前端显示「去验证邮箱」，后端会拦发帖/评论/举报 */
    private Boolean emailVerified;

    /**
     * 标准转换：BO → VO。
     * <p>
     * 登录和 /user/info 两个返回体都用它，避免字段各加各的——
     * 之前两份手写映射，加一个字段漏一处，前端就会出现「刷新后有、刚登录没有」。
     */
    public static UserVO fromBO(UserBO bo) {
        UserVO vo = new UserVO();
        vo.setId(bo.getId());
        vo.setUsername(bo.getUsername());
        vo.setName(bo.getName());
        vo.setNameColor(bo.getNameColor());
        vo.setRoleColor(bo.getRoleColor());
        vo.setPrimaryRole(bo.getPrimaryRole());
        vo.setAvatar(bo.getAvatar());
        vo.setBadge(bo.getBadge());
        vo.setOrnament(bo.getOrnament());
        vo.setBirthday(bo.getBirthday());
        vo.setEmail(bo.getEmail());
        vo.setGender(bo.getGender());
        vo.setPhone(bo.getPhone());
        vo.setSignature(bo.getSignature());
        vo.setStatus(bo.getStatus() == null ? 0 : bo.getStatus());
        vo.setBanUntil(bo.getBanUntil());
        vo.setBanReason(bo.getBanReason());
        // null 当作已验证：迁移脚本没跑到底时也不会把老用户全锁死
        vo.setEmailVerified(bo.getEmailVerified() == null || bo.getEmailVerified());
        return vo;
    }
}
