package com.example.kokomi.entity;

import java.time.LocalDateTime;

import lombok.Data;

@Data
public class CommentLike {
    private Long id;
    private Long commentId;
    private Long userId;
    private LocalDateTime createdAt;
}
