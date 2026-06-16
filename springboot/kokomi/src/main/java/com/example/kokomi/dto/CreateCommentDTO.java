package com.example.kokomi.dto;

import lombok.Data;

@Data
public class CreateCommentDTO {
    private String content;
    private Long parentId;   // 父评论ID，顶级评论为null
    private String replyTo;  // 回复的用户名
    private String image;    // 图片URL（仅顶级评论有效）
}