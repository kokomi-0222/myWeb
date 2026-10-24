package com.example.kokomi.mapper;

import com.example.kokomi.entity.Permission;
import org.apache.ibatis.annotations.Select;

import java.util.List;

public interface PermissionMapper {

    /** 权限字典，后台角色管理页按 perm_group 分组展示 */
    @Select("select id, perm_code, perm_name, perm_group, sort from permission order by sort asc, id asc")
    List<Permission> selectAll();

    @Select("select perm_code from permission")
    List<String> selectAllCodes();
}
