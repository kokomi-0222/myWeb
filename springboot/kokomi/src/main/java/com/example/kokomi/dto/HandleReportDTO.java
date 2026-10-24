package com.example.kokomi.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/** 处理一条举报 */
@Data
public class HandleReportDTO {

    /** accept 受理 / reject 驳回 */
    private String action;

    /** 受理时是否同时删掉被举报的内容 */
    private Boolean deleteContent;

    /**
     * 处罚方式：null 或 "ban" 表示封号（不能登录），"mute" 表示禁言（能登录、不能发帖评论）。
     * 只有 {@link #banDays} 不为 0 时才有意义。
     */
    private String banType;

    /**
     * 处罚时长：
     * null 或 0 表示不处罚，正数表示天数，-1 表示永久。
     */
    private Integer banDays;

    /** 处罚理由（写进 user.ban_reason，本人能看到） */
    @Size(max = 200, message = "处罚理由不能超过200字")
    private String banReason;

    /** 处理备注（会通知给举报人） */
    @Size(max = 500, message = "处理备注不能超过500字")
    private String note;
}
