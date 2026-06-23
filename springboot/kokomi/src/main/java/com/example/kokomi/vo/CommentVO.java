package com.example.kokomi.vo;

import java.time.LocalDateTime;
import java.util.List;

import lombok.Data;

@Data
public class CommentVO {
    private Long id;
    private Long postId;
    private String content;
    private CommentAuthorVO author;
    private Integer likes;
    private Boolean isHot;
    private LocalDateTime createdAt;
    private String image;       // 评论图片URL
    private Long parentId;
    private List<CommentVO> replies; // 子回复
    private String replyTo;          // 回复的用户名
    private Boolean likedByMe;       // 当前用户是否已点赞
}