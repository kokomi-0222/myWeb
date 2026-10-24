package com.example.kokomi.vo;

import java.time.LocalDateTime;

import lombok.Data;

/**
 * 公开的用户主页信息。
 * <p>
 * 刻意不包含 email / phone / username —— 这些只有用户自己能看（见 {@link UserInfoVO}）。
 */
@Data
public class UserProfileVO {
    private Long id;
    private String name;
    private String nameColor;
    private String roleColor;
    private String primaryRole;
    private String avatar;
    private String badge;
    private String ornament;
    private String signature;
    private LocalDateTime createTime;
    /** 该用户发布的帖子总数 */
    private Long postCount;
}
