package com.example.kokomi.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;

/** 后台举报列表查询条件 */
@Data
public class ReportPageQueryDTO {

    @Min(1)
    private Integer pageNum = 1;

    @Min(1)
    @Max(50)
    private Integer pageSize = 10;

    /** 0 待处理 / 1 已受理 / 2 已驳回；不传表示全部 */
    private Integer status;

    /** post / comment / user；不传表示全部 */
    private String targetType;
}
