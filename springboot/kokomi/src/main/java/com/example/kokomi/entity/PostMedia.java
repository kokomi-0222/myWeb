package com.example.kokomi.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class PostMedia {
    private Long id;
    private Long postId;
    private String thumbnailUrl;
    private String previewUrl;
    private String rawUrl;
    private String type;
    private Integer width;
    private Integer height;
    private Long size;
    private String alt;
    private String format;
    private Integer isAnimated;
    private Integer sort;
    private LocalDateTime createdAt;
}