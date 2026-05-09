package com.example.kokomi.mapper;

import org.apache.ibatis.annotations.*;

import java.util.List;

public interface UserRoleMapper {
    // 根据用户ID查所有角色编码
    @Select("select role_code from user_role where user_id = #{userId}")
    List<String> selectRolesByUserId(Long userId);

    // 给用户分配角色
    @Insert("INSERT INTO user_role(user_id, role_code) VALUES(#{userId}, #{roleCode})")
    int insertUserRole(@Param("userId") Long userId, @Param("roleCode") String roleCode);
}
