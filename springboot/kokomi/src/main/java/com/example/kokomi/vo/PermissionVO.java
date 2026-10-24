package com.example.kokomi.vo;

import lombok.Data;

/** 权限字典项：后台勾选框的数据源 */
@Data
public class PermissionVO {
    private String permCode;
    private String permName;
    /** 分组名（内容 / 互动 / 用户 / 系统），前端按它排版 */
    private String permGroup;
    private Integer sort;
}
