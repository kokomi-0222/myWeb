package com.example.kokomi.service;

import com.example.kokomi.dto.SaveRoleDTO;
import com.example.kokomi.vo.AdminRoleVO;
import com.example.kokomi.vo.PermissionVO;
import com.example.kokomi.vo.RoleOptionVO;

import java.util.List;

/**
 * 角色权限管理（仅管理后台可用）：
 * 建角色、给角色勾权限、删角色。
 */
public interface AdminRoleService {

    /** 角色列表（带权限码、名下用户数） */
    List<AdminRoleVO> list();

    /** 权限字典（后台勾选框的数据源） */
    List<PermissionVO> permissions();

    /** 公开的角色字典：编码 → 中文名，给前台身份标签用 */
    List<RoleOptionVO> options();

    /** 新建角色 */
    AdminRoleVO create(SaveRoleDTO dto);

    /** 修改角色的名字 / 说明 / 权限（编码不可改） */
    AdminRoleVO update(String roleCode, SaveRoleDTO dto);

    /** 删除角色（内置角色、仍有人使用的角色一律拒绝） */
    void delete(String roleCode);
}
