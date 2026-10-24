package com.example.kokomi.vo;

import lombok.Data;

/**
 * 被举报对象的快照，供后台详情抽屉展示。
 * <p>
 * 内容可能已经被删（作者自己删掉、或上一条举报处理时删掉），
 * 这时 {@code exists = false}，其余字段尽量留空，前端显示「内容已不存在」。
 */
@Data
public class ReportTargetVO {

    private String targetType;
    private Long targetId;
    private Boolean exists;

    /** 内容作者（帖子作者 / 评论作者 / 被举报的用户本人） */
    private Long authorId;
    private String authorName;
    private String authorAvatar;
    /** 该作者当前是否处于处罚状态（禁言或封号） */
    private Boolean authorBanned;
    private String authorBanReason;
    /** 1 禁言 / 2 封号，作者没被处罚时为 0 */
    private Integer authorBanLevel;
    /** 解除时间，null 且 level != 0 表示永久 */
    private java.time.LocalDateTime authorBanUntil;

    /** 帖子标题；评论为空 */
    private String title;
    /** 帖子正文 / 评论内容（完整，不再截断——后台需要看全貌才能判断） */
    private String content;
    /** 帖子首图 / 评论附图 */
    private String image;
    /** 上下文：评论所属帖子的标题（帖子/用户为空） */
    private String context;

    /** 该对象历史累计被举报次数 */
    private Integer totalReports;
    /** 其中还在待处理的数量 */
    private Integer pendingReports;
}
