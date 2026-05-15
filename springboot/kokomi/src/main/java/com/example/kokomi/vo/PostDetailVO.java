package com.example.kokomi.vo;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class PostDetailVO {
    private Long id;
    private String title;
    private List<String> tag;        // 标签数组
    private String content;
    private List<PostMediaVO> media; // 图片数组
    private PostAuthorVO author;     // 作者信息
    private LocalDateTime createdAt;
    private Integer views;
    private Integer forward;
    private Integer likes;
    private Integer commentsCount;
    private Boolean likedByMe;
}