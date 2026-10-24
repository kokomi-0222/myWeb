package com.example.kokomi.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** 后台直接处罚某个用户（不走举报流程时用） */
@Data
public class AdminPunishDTO {

    /** 1 禁言（能登录，不能发帖评论）/ 2 封号（不能登录） */
    @NotNull(message = "请选择处罚方式")
    @Min(value = 1, message = "请选择处罚方式")
    @Max(value = 2, message = "请选择处罚方式")
    private Integer level;

    /** 正数按天，-1 表示永久 */
    @NotNull(message = "请选择处罚时长")
    private Integer days;

    /** 理由，本人能看到 */
    @Size(max = 200, message = "处罚理由不能超过200字")
    private String reason;
}
