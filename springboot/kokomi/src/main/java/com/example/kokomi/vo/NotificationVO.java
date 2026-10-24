package com.example.kokomi.vo;

import java.time.LocalDateTime;

import lombok.Data;

@Data
public class NotificationVO {
    private Long id;
    /** like_post / like_comment / comment / reply */
    private String type;
    private Long postId;
    private Long commentId;
    private String content;
    private Boolean isRead;
    private LocalDateTime createdAt;

    // 触发者信息（内嵌，省掉一层嵌套对象）
    private Long senderId;
    private String senderName;
    private String senderAvatar;
}
