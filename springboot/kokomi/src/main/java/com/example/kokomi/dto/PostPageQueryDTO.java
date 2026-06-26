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

    // 搜索范围：content / title / user / category（为空则同时搜索标题和内容）
    private String searchType;

    // 类型筛选（不传默认全部）
    private String type;

    //用户id
    private Long userId;
}