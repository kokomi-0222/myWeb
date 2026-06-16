package com.example.kokomi.entity;

import java.time.LocalDateTime;

import lombok.Data;

@Data
public class Comment {
    private Long id;
    private Long postId;
    private Long userId;
    private String content;
    private Long parentId;      // 父评论ID，为null则是顶级评论
    private String replyTo;     // 回复的用户名
    private String image;        // 评论图片URL（仅顶级评论）
    private Integer likes;
    private Integer isHot;      // 0否 1是
    private LocalDateTime createdAt;
}