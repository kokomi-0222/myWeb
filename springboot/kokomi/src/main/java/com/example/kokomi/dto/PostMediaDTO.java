package com.example.kokomi.dto;

import lombok.Data;

@Data
public class PostMediaDTO {
    private String url;
    private String type;
    private Integer width;
    private Integer height;
    private Long size;
    private String alt;
    private String format;
    private Integer isAnimated;
    private Integer sort;
}
