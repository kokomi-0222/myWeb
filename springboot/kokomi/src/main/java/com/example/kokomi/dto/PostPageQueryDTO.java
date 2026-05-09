package com.example.kokomi.dto;

import lombok.Data;

@Data
public class PostPageQueryDTO {

    // 分页（不传默认 第1页，10条）
    private Integer pageNum = 1;
    private Integer pageSize = 10;

    // 排序字段（不传默认 按最新时间）
    private String sort; // 例如：createTime、likes、views

    // 搜索关键词
    private String keyword;

    // 类型筛选（不传默认全部）
    private String type;
}