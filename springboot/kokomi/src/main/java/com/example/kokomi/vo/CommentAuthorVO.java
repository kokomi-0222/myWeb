package com.example.kokomi.vo;

import lombok.Data;

@Data
public class CommentAuthorVO {
    private Long id;
    private String name;
    private String nameColor;
    private String roleColor;
    private String primaryRole;
    private String avatar;
}