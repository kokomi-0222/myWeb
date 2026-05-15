package com.example.kokomi.vo;

import lombok.Data;
import java.util.List;

@Data
public class PageVO<T> {
    private List<T> list;   // 当前页数据
    private Long total;        // 总条数
    private Integer pageNum;   // 当前页
    private Integer pageSize;  // 每页条数
    private Integer pages;     // 总页数

    // 构建分页结果
    public static <T> PageVO<T> build(List<T> list, Long total, Integer pageNum, Integer pageSize) {
        PageVO<T> vo = new PageVO<>();
        vo.setList(list);
        vo.setTotal(total);
        vo.setPageNum(pageNum);
        vo.setPageSize(pageSize);
        vo.setPages(total == 0 ? 0 : (int) Math.ceil((double) total / pageSize));
        return vo;
    }
}