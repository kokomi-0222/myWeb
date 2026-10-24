package com.example.kokomi.entity;

import java.time.LocalDateTime;

import lombok.Data;

/**
 * 举报（DO / PO），对应 report 表。
 * <p>
 * {@code pendingUniq} 是数据库生成列（只有 status=0 时才有值），
 * 用来保证「同一人对同一目标只能有一条待处理举报」，完全不参与 Java 侧读写，
 * 所以这里不声明这个字段。
 */
@Data
public class Report {

    private Long id;

    /** 对象类型：post / comment / user */
    private String targetType;

    /** 对象 id */
    private Long targetId;

    /**
     * 被举报内容的作者 id。
     * <p>
     * 冗余字段：受理时常常会把内容删掉，删完就查不到作者是谁了。
     * 提交举报时记下来，后台事后仍能追溯「谁被举报过、有没有被封」。
     */
    private Long targetAuthorId;

    /** 举报人 */
    private Long reporterId;

    /** 理由码，取值见 {@link com.example.kokomi.common.ReportReason} */
    private String reasonCode;

    /** 补充说明 */
    private String detail;

    /** 0 待处理 / 1 已受理 / 2 已驳回 */
    private Integer status;

    /** 处理人 */
    private Long handlerId;

    /** accept / reject */
    private String handleAction;

    /** 处理备注（会展示给举报人） */
    private String handleNote;

    private LocalDateTime handleTime;

    private LocalDateTime createdAt;
}
