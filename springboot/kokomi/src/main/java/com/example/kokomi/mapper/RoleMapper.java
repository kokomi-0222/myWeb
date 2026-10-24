package com.example.kokomi.mapper;

import com.example.kokomi.entity.Role;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

/**
 * role 表（角色字典）。
 * 权限判断只看 user_role + role_permission，这张表的作用是
 * 「有哪些角色可选」+ 后台展示用的名字和排序。
 */
public interface RoleMapper {

    /** 只取编码，用户管理页的下拉用 */
    @Select("select role_code from role order by sort asc, id asc")
    List<String> selectAllCodes();

    /** 完整角色列表（后台角色管理页用） */
    @Select("select id, role_code, role_name, description, is_system, sort from role order by sort asc, id asc")
    List<Role> selectAll();

    @Select("select id, role_code, role_name, description, is_system, sort from role where role_code = #{code}")
    Role selectByCode(String code);

    /** 有多少用户挂着这个角色 —— 决定能不能删 */
    @Select("select count(*) from user_role where role_code = #{code}")
    int countUsers(String code);

    /** 每个角色下有几个用户，一次查完，避免角色列表里 N+1 */
    @Select("select role_code as code, count(*) as cnt from user_role group by role_code")
    List<Map<String, Object>> countUsersGroupByRole();

    @Insert("""
            insert into role (role_code, role_name, description, is_system, sort)
            values (#{roleCode}, #{roleName}, #{description}, #{isSystem}, #{sort})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Role role);

    /** 只允许改名字和说明：编码是外键引用，改了会打断 user_role / role_permission */
    @Update("update role set role_name = #{roleName}, description = #{description} where role_code = #{roleCode}")
    int updateInfo(Role role);

    @Delete("delete from role where role_code = #{code}")
    int deleteByCode(String code);
}
