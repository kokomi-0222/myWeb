package com.example.kokomi.entity;

import java.time.LocalDateTime;

import lombok.Data;

@Data
public class Notification {
    private Long id;
    private Long recipientId;
    private Long senderId;
    /** like_post / like_comment / comment / reply */
    private String type;
    private Long postId;
    private Long commentId;
    /** 摘要文本，写入时拼好，读取时直接展示，避免每次联查 */
    private String content;
    private Integer isRead;
    private LocalDateTime createdAt;
}
