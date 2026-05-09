package com.example.kokomi.entity;

import lombok.Data;

@Data
public class PostTag {
    private Long id;
    private Long postId;
    private String tagName;
}