package com.example.kokomi.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateCommentDTO {
    @Size(max = 500, message = "评论内容不能超过500字")
    private String content;
    private Long parentId;   // 父评论ID，顶级评论为null
    private String replyTo;  // 回复的用户名
    @Size(max = 500, message = "图片URL异常")
    private String image;    // 图片URL（仅顶级评论有效）
}