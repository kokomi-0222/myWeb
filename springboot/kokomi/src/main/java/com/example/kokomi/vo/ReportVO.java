package com.example.kokomi.vo;

import java.time.LocalDateTime;

import lombok.Data;

/** 后台举报列表的一行 */
@Data
public class ReportVO {

    private Long id;

    /** post / comment / user */
    private String targetType;
    private Long targetId;

    /** 被举报对象的作者（用于后台直接显示「谁的东西被举报了」） */
    private Long targetAuthorId;
    private String targetAuthorName;
    /** 帖子标题 / 评论内容 / 用户昵称，列表里一行摘要 */
    private String targetSummary;
    /** 目标是否还存在（作者可能自己删了） */
    private Boolean targetExists;

    private Long reporterId;
    private String reporterName;
    private String reporterAvatar;

    private String reasonCode;
    /** 理由中文名，由后端填，前端不用再维护一份字典 */
    private String reasonLabel;
    private String detail;

    /** 0 待处理 / 1 已受理 / 2 已驳回 */
    private Integer status;
    private Long handlerId;
    private String handlerName;
    private String handleAction;
    private String handleNote;
    private LocalDateTime handleTime;

    private LocalDateTime createdAt;

    /** 同一对象累计被举报次数（含历史），用来判断是不是惯犯 */
    private Integer targetReportCount;
}
