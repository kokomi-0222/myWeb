package com.example.kokomi.mapper;

import com.example.kokomi.entity.RolePermission;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.Collection;
import java.util.List;

public interface RolePermissionMapper {
    // 根据用户ID查所有权限编码
    @Select("""
            select perm_code from role_permission 
            where role_code in (select role_code from user_role where user_id = #{userId})
            """)
    List<String> selectPermissionsByUserId(Long userId);

    // ========== 角色管理页用到的 ==========

    /** 全量取一遍，页面一次加载就能画出所有角色的勾选状态 */
    @Select("select id, role_code, perm_code from role_permission order by role_code asc")
    List<RolePermission> selectAll();

    /** 保存某个角色的权限时先清空再插入（整体覆盖） */
    @Delete("delete from role_permission where role_code = #{roleCode}")
    int deleteByRole(String roleCode);

    @Insert("""
            <script>
            insert into role_permission (role_code, perm_code) values
            <foreach collection="permCodes" item="code" separator=",">(#{roleCode}, #{code})</foreach>
            </script>
            """)
    int insertBatch(@Param("roleCode") String roleCode,
                    @Param("permCodes") Collection<String> permCodes);
}
