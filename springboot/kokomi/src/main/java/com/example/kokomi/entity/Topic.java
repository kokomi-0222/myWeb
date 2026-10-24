package com.example.kokomi.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 话题字典，对应 topic 表。
 * <p>
 * {@code value} 是真正写进 {@code post.type} 的值，{@code name} 只是展示名。
 * 初始化的 7 个话题为了兼容历史帖子，value 保留原来的英文标识（tech/life/...）；
 * 之后站长新建的话题，value 直接用中文名，搜索照样能按 {@code type = ?} 命中。
 */
@Data
public class Topic {
    private Long id;
    private String name;
    private String value;
    private String color;
    private Integer sort;
    private LocalDateTime createdAt;
}
