package com.example.kokomi.entity;

import lombok.Data;

/**
 * permission 表：权限码字典。
 * <p>
 * 权限码本身是后端 {@code @RequirePermission} 里写死的字符串，
 * 这张表只提供「有哪些权限可勾选」和展示信息。
 */
@Data
public class Permission {
    private Long id;
    /** 权限编码，如 post:create */
    private String permCode;
    /** 显示名，如「发布帖子」 */
    private String permName;
    /** 分组名，后台按组展示勾选框 */
    private String permGroup;
    private Integer sort;
}
