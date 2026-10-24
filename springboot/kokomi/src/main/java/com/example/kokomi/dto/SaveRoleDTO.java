package com.example.kokomi.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * 新建 / 修改角色。
 * <p>
 * 编码只在「新建」时有意义；修改时忽略（编码被 user_role、role_permission 引用，
 * 改编码等于把现有的角色关系全切断）。所以改角色时前端只提交名字、说明、权限。
 */
@Data
public class SaveRoleDTO {

    /** 角色编码，可空；空则后端按时间戳生成。只允许小写字母、数字、下划线 */
    @Size(max = 30, message = "角色编码最长 30 个字符")
    private String roleCode;

    @NotBlank(message = "角色名称不能为空")
    @Size(max = 30, message = "角色名称最长 30 个字符")
    private String roleName;

    @Size(max = 200, message = "说明最长 200 个字符")
    private String description;

    /** 勾选的权限码；允许为空（= 这个角色除了「登录」什么都不能做） */
    private List<String> permissions;
}
