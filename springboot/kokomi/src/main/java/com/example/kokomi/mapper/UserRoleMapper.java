package com.example.kokomi.mapper;

import com.example.kokomi.entity.UserRole;
import org.apache.ibatis.annotations.*;

import java.util.Collection;
import java.util.List;

public interface UserRoleMapper {
    // 根据用户ID查所有角色编码
    @Select("select role_code from user_role where user_id = #{userId}")
    List<String> selectRolesByUserId(Long userId);

    // 给用户分配角色
    @Insert("INSERT INTO user_role(user_id, role_code) VALUES(#{userId}, #{roleCode})")
    int insertUserRole(@Param("userId") Long userId, @Param("roleCode") String roleCode);

    // ========== 用户管理页用到的 ==========

    /** 批量取多个用户的角色，避免列表里逐个用户查一次（N+1） */
    @Select("""
            <script>
            select id, user_id, role_code from user_role where user_id in
            <foreach collection="userIds" item="uid" open="(" separator="," close=")">#{uid}</foreach>
            </script>
            """)
    List<UserRole> selectByUserIds(@Param("userIds") Collection<Long> userIds);

    /** 清空某个用户的全部角色（改角色时先删后插，实现「整体覆盖」） */
    @Delete("delete from user_role where user_id = #{userId}")
    int deleteByUserId(@Param("userId") Long userId);

    /** 批量插入角色 */
    @Insert("""
            <script>
            insert into user_role (user_id, role_code) values
            <foreach collection="roleCodes" item="code" separator=",">(#{userId}, #{code})</foreach>
            </script>
            """)
    int insertBatch(@Param("userId") Long userId, @Param("roleCodes") Collection<String> roleCodes);
}
