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


    /**
     * 【注册专用】插入用户，自动返回自增 id。
     * <p>
     * ⚠️ `primary_role` **必须显式写**，不能靠列默认值。
     * 库里这列的 DDL 默认值是老版本留下的 `'member'`，一旦哪天默认值又变，
     * 就会出现「`user_role` 挂 member（权限对）但 `primary_role` 落成 guest（显示错）」
     * 这种两边打架的状态，用户在个人中心看到「游客」却发现自己能发帖，非常难解释。
     * <p>
     * ⚠️ `email_verified` 也**必须显式写**。注册链路要求邮箱当场验证通过，
     * 所以这里传 1；漏写就走 DDL 默认的 0，注册完的号会被当成「有邮箱但没验证」，
     * 前端显示「待验证」，而用户手上根本没有可再收的码 —— 又是个卡死状态。
     * <p>
     * `name_color` 故意**不写**，走 DDL 默认的 `#636161`。
     * 名字色是个固定值、不随主题变，写死成 `#18191c` 之类在暗色下会直接看不见。
     */
    @Insert("insert into user(password, email, email_verified, phone, primary_role) " +
            "values(#{password}, #{email}, #{emailVerified}, #{phone}, #{primaryRole})")
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
                   status, ban_until, ban_reason, create_time, email, email_verified
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

    /** 只查邮箱验证相关字段（发言前每次都要判一次，别把整行读出来） */
    @Select("select id, email, email_verified from user where id = #{userId}")
    User selectVerifyState(@Param("userId") Long userId);

    /** 标记邮箱已验证（用户自己输对验证码，或管理员手动兜底） */
    @Update("update user set email_verified = 1 where id = #{userId}")
    int setEmailVerified(@Param("userId") Long userId);

    /**
     * 绑定 / 换绑邮箱：把**刚验证过**的邮箱写回账号，同时置验证位。
     * <p>
     * 两个动作共用一条 SQL，因为它们要写的列完全一样（email + email_verified=1）。
     * 两条更新必须一起做 —— 只写 email 不置位，会出现「有邮箱但仍算游客」的怪状态。
     */
    @Update("update user set email = #{email}, email_verified = 1 where id = #{userId}")
    int bindEmail(@Param("userId") Long userId, @Param("email") String email);

    /**
     * 解绑：清空邮箱 + 验证位归零。
     * <p>
     * 两列必须一起写，理由和 {@link #bindEmail} 一样 —— 只清 email 不归零，
     * 会留下「email=NULL 但 email_verified=1」的死状态，用户点绑定会被
     * 「已验证，无需重复绑定」堵死。
     * <p>
     * <b>不碰 primary_role / user_role</b>：解绑只是放弃「用邮箱找回密码」，
     * 不是降级。发言闸门看权限码（见 PostServiceImpl#checkCanPost），
     * 收走角色等于顺手把人禁言了，那是另一个动作。
     */
    @Update("update user set email = null, email_verified = 0 where id = #{userId}")
    int unbindEmail(@Param("userId") Long userId);

    /**
     * 按邮箱找人，**不看验证位** —— 注册查重用。
     * <p>
     * 为什么不用 {@link #selectByAccount}：那个方法还会匹配 username / phone，
     * 语义太宽。注册和换绑要判的是「这个邮箱有没有落在别人账号上」，
     * 只要有人填过就该拦（哪怕他还没验证），不能让两个人抢同一个邮箱。
     */
    @Select("select * from user where email = #{email} limit 1")
    User selectByEmail(@Param("email") String email);

    /**
     * 按「已验证的邮箱」找人 —— 找回密码用。
     * <p>
     * 必须带上 email_verified = 1：没验证过的邮箱只说明「用户填过」，
     * 不代表这邮箱是他的，拿它当找回凭据等于谁先填谁说了算。
     */
    @Select("select * from user where email = #{email} and email_verified = 1 limit 1")
    User selectByVerifiedEmail(@Param("email") String email);

}