package com.example.kokomi.mapper;

import com.example.kokomi.entity.User;
import org.apache.ibatis.annotations.*;

import java.util.Collection;
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

    /**
     * 批量按 id 查用户，供帖子/评论列表一次性取作者信息（消除 N+1）。
     * 只查展示需要的字段，不返回 password / token_version 等敏感列。
     */
    @Select("""
            <script>
            select id, name, name_color, role_color, primary_role, avatar, badge, ornament, signature, create_time
            from user where id in
            <foreach collection="ids" item="id" open="(" separator="," close=")">#{id}</foreach>
            </script>
            """)
    List<User> selectByIds(@Param("ids") Collection<Long> ids);

    /** 全站注册用户数（首页统计用） */
    @Select("select count(*) from user")
    Long countAll();


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

    /**
     * 更新密码 且 让所有旧登录失效
     */
    @Update("UPDATE user SET password = #{newPassword}, token_version = token_version + 1 WHERE id = #{userId}")
    int updatePasswordAndVersion(@Param("userId") Long userId, @Param("newPassword") String newPassword);

    /**
     * 用户管理页的分页查询。
     * 只查展示需要的列，不返回 password / token_version。
     * keyword 同时匹配账号、昵称、邮箱。
     */
    @Select("""
            <script>
            select id, username, name, name_color, role_color, avatar, primary_role,
                   status, ban_until, ban_reason, create_time
            from user
            <where>
                <if test="keyword != null and keyword != ''">
                    username like concat('%', #{keyword}, '%')
                    or name like concat('%', #{keyword}, '%')
                    or email like concat('%', #{keyword}, '%')
                </if>
            </where>
            order by id asc
            limit #{offset}, #{limit}
            </script>
            """)
    List<User> selectAdminPage(@Param("keyword") String keyword,
                               @Param("offset") int offset,
                               @Param("limit") int limit);

    /** 用户管理页的总数（与 selectAdminPage 条件保持一致） */
    @Select("""
            <script>
            select count(*) from user
            <where>
                <if test="keyword != null and keyword != ''">
                    username like concat('%', #{keyword}, '%')
                    or name like concat('%', #{keyword}, '%')
                    or email like concat('%', #{keyword}, '%')
                </if>
            </where>
            </script>
            """)
    Long countAdminPage(@Param("keyword") String keyword);

    /**
     * 后台改某个用户的「外观」：名字颜色 + 身份标签底色。
     * 两个值都允许为 null —— null 表示恢复默认（前端会自动回退）。
     * 只动这两列，不碰 nickname/avatar 等其它资料，也不会让登录态失效。
     */
    @Update("""
            update user
            set name_color = #{nameColor},
                role_color = #{roleColor}
            where id = #{userId}
            """)
    int updateStyle(@Param("userId") Long userId,
                    @Param("nameColor") String nameColor,
                    @Param("roleColor") String roleColor);

    /**
     * 同步「身份标签」用的 primary_role。
     * 只影响显示（帖子、主页上挂哪个角色名），鉴权始终看 user_role，
     * 所以这里写错了最多是标签不对，不会多给或少给权限。
     */
    @Update("update user set primary_role = #{roleCode} where id = #{userId}")
    int updatePrimaryRole(@Param("userId") Long userId, @Param("roleCode") String roleCode);

    /**
     * 处罚用户（禁言 / 封号，见 {@link com.example.kokomi.common.BanLevel}）。
     * <p>
     * <b>封号</b>（status=2）必须把 token_version + 1：这样对方已登录的旧 token
     * 会在下一次请求时被 LoginInterceptor 判定为版本不一致，立刻失效，
     * 不需要任何额外的拦截逻辑。
     * <p>
     * <b>禁言</b>（status=1）不碰 token_version —— 禁言的本意就是「还能看帖、还能登录」，
     * 把人踢下线是多余的伤害。禁言的拦截点在 Service 层（发帖 / 评论 / 编辑前查库），
     * 不依赖 token 版本，所以不加也能拦住。
     * <p>
     * 所以这里用 {@code + #{bumpToken}}（传 0 或 1）而不是写死 +1：
     * MySQL 里 {@code token_version + 0} 等于原值，一条 SQL 就能覆盖两种情况，
     * 不用为「要不要踢下线」再写第二个 update。
     *
     * @param status    1 禁言 / 2 封号
     * @param banUntil  解除时间，null 表示永久
     * @param bumpToken 1 = 作废现有登录态；0 = 保持登录
     */
    @Update("""
            update user
            set status = #{status},
                ban_until = #{banUntil},
                ban_reason = #{reason},
                token_version = token_version + #{bumpToken}
            where id = #{userId}
            """)
    int banUser(@Param("userId") Long userId,
                @Param("status") int status,
                @Param("banUntil") java.time.LocalDateTime banUntil,
                @Param("reason") String reason,
                @Param("bumpToken") int bumpToken);

    /** 解除处罚（禁言 / 封号共用，也用于临时处罚到期后的自动解除） */
    @Update("update user set status = 0, ban_until = null, ban_reason = null where id = #{userId}")
    int unbanUser(@Param("userId") Long userId);

    /** 只查封禁相关字段，避免为了一个 status 把密码哈希也读出来 */
    @Select("select id, status, ban_until, ban_reason from user where id = #{userId}")
    User selectBanState(@Param("userId") Long userId);

}