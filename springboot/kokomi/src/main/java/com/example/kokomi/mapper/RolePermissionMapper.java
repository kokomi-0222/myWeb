package com.example.kokomi.mapper;

import org.apache.ibatis.annotations.Select;

import java.util.List;

public interface RolePermissionMapper {
    // 根据用户ID查所有权限编码
    @Select("""
            select perm_code from role_permission 
            where role_code in (select role_code from user_role where user_id = #{userId})
            """)
    List<String> selectPermissionsByUserId(Long userId);
}
