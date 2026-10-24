package com.example.kokomi.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 提交举报 */
@Data
public class CreateReportDTO {

    /** post / comment / user */
    @NotBlank(message = "缺少举报对象类型")
    private String targetType;

    @NotNull(message = "缺少举报对象")
    private Long targetId;

    /** 理由码，后端用 ReportReason 白名单校验 */
    @NotBlank(message = "请选择举报理由")
    private String reasonCode;

    /** 补充说明，选填 */
    @Size(max = 500, message = "补充说明不能超过500字")
    private String detail;
}
