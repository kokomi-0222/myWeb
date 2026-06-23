package com.example.kokomi.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class Post {
    private Long id;
    private String title;
    private String content;
    private Long userId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Integer views;
    private Integer likes;
    private Integer comments;
    private Integer forwards;
    private String type;
}