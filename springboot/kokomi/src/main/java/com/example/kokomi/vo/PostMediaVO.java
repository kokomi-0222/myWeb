package com.example.kokomi.vo;

import lombok.Data;

@Data
public class PostMediaVO {
    private String id;
    private String thumbnailUrl;
    private String previewUrl;
    private String rowUrl;
    private String type;
    private Integer width;
    private Integer height;
    private Long size;
    private String alt;
    private Integer orientation;
    private String format;
    private Boolean isAnimated;
}