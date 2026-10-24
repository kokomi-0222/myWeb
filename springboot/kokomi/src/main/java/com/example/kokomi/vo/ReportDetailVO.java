package com.example.kokomi.vo;

import lombok.Data;

/** 后台举报详情：举报本体 + 被举报对象快照 */
@Data
public class ReportDetailVO {

    private ReportVO report;

    private ReportTargetVO target;
}
