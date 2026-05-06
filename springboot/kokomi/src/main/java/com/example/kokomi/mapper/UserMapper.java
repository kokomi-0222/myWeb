package com.example.kokomi.mapper;

import com.example.kokomi.entity.User;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * Mapper = 数据库操作层
 * 从数据库取数据
 */
public interface UserMapper {

    // 根据【账号】查询用户（支持 username / phone / email）
    @Select("""
            select * from user 
            where username = #{account} 
               or phone = #{account} 
               or email = #{account}
            """)
    User selectByAccount(String account);

    @Select("select * from user where id = #{id}")
    User selectById(Long id);


    //  根据用户ID查所有角色编码
    @Select("select role_code from user_role where user_id = #{userId}")
    List<String> selectRolesByUserId(Long userId);

    //  根据用户ID查所有权限编码
    @Select("""
            select perm_code from role_permission 
            where role_code in (select role_code from user_role where user_id = #{userId})
            """)
    List<String> selectPermissionsByUserId(Long userId);

    //根据id更新用户信息
    int updateById(User user);


    // 插入用户，自动返回自增id
    @Insert("insert into user(password, email, phone) " +
            "values(#{password}, #{email}, #{phone})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(User user);

    /**
     * 【注册专用】只更新 用户名 和 昵称
     * 不影响其他字段，和用户修改资料的方法分开
     */
    @Update("update user set username=#{username}, name=#{name} where id=#{id}")
    int updateUsernameAndName(User user);

}