package com.example.kokomi.service.impl;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.dto.AdminPunishDTO;
import com.example.kokomi.dto.UpdateUserStyleDTO;
import com.example.kokomi.entity.Role;
import com.example.kokomi.entity.User;
import com.example.kokomi.entity.UserRole;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.RoleMapper;
import com.example.kokomi.mapper.RolePermissionMapper;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.mapper.UserRoleMapper;
import com.example.kokomi.service.AdminUserService;
import com.example.kokomi.service.UserBanService;
import com.example.kokomi.service.UserVerifyService;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.util.PermissionCache;
import com.example.kokomi.util.UserTokenVersionCache;
import com.example.kokomi.vo.AdminUserVO;
import com.example.kokomi.vo.PageVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.mindrot.jbcrypt.BCrypt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AdminUserServiceImpl implements AdminUserService {

    private static final int MAX_PAGE_SIZE = 50;

    /** 后台「用户管理」权限码：持有它的账号不能被注销，见 {@link #deactivateUser} */
    private static final String MANAGE_PERMISSION = "user:manage";

    private final UserMapper userMapper;
    private final UserRoleMapper userRoleMapper;
    private final RoleMapper roleMapper;
    private final RolePermissionMapper rolePermissionMapper;
    private final UserBanService userBanService;
    private final UserVerifyService userVerifyService;

    @Override
    public PageVO<AdminUserVO> page(String keyword, Integer pageNum, Integer pageSize,
                                    boolean includeDeleted) {
        int num = (pageNum == null || pageNum < 1) ? 1 : pageNum;
        int size = (pageSize == null || pageSize < 1) ? 20 : Math.min(pageSize, MAX_PAGE_SIZE);
        String kw = keyword == null ? null : keyword.trim();

        Long total = userMapper.countAdminPage(kw, includeDeleted);
        if (total == null) {
            total = 0L;
        }
        if (total == 0) {
            return PageVO.build(new ArrayList<>(), 0L, num, size);
        }

        List<User> users = userMapper.selectAdminPage(kw, includeDeleted, (num - 1) * size, size);

        // 一次性把这一页所有用户的角色捞出来，避免 N+1
        Map<Long, List<String>> roleMap = new HashMap<>();
        if (!users.isEmpty()) {
            List<Long> ids = users.stream().map(User::getId).collect(Collectors.toList());
            for (UserRole ur : userRoleMapper.selectByUserIds(ids)) {
                roleMap.computeIfAbsent(ur.getUserId(), k -> new ArrayList<>()).add(ur.getRoleCode());
            }
        }

        List<AdminUserVO> list = new ArrayList<>(users.size());
        for (User u : users) {
            AdminUserVO vo = new AdminUserVO();
            vo.setId(u.getId());
            vo.setUsername(u.getUsername());
            vo.setName(u.getName());
            vo.setAvatar(u.getAvatar());
            vo.setNameColor(u.getNameColor());
            vo.setRoleColor(u.getRoleColor());
            vo.setPrimaryRole(u.getPrimaryRole());
            vo.setCreateTime(u.getCreateTime());
            vo.setStatus(u.getStatus() == null ? 0 : u.getStatus());
            vo.setBanUntil(u.getBanUntil());
            vo.setBanReason(u.getBanReason());
            vo.setEmailVerified(u.getEmailVerified() == null || u.getEmailVerified() == 1);
            vo.setEmail(u.getEmail());
            vo.setDeletedAt(u.getDeletedAt());
            vo.setRoles(roleMap.getOrDefault(u.getId(), new ArrayList<>()));
            list.add(vo);
        }
        return PageVO.build(list, total, num, size);
    }

    @Override
    public List<String> listRoles() {
        return roleMapper.selectAllCodes();
    }

    @Override
    @Transactional
    public void updateRoles(Long userId, List<String> roles) {
        if (userId == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
        }
        User target = userMapper.selectById(userId);
        if (target == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
        }

        // 去重、去空；顺序按 role 表来，保证前端展示稳定
        Set<String> wanted = new LinkedHashSet<>();
        if (roles != null) {
            for (String r : roles) {
                if (r != null && !r.isBlank()) {
                    wanted.add(r.trim());
                }
            }
        }
        if (wanted.isEmpty()) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "至少保留一个角色");
        }

        List<String> validCodes = roleMapper.selectAllCodes();
        for (String code : wanted) {
            if (!validCodes.contains(code)) {
                throw new CustomerException(ResultCode.PARAM_ERROR, "角色不存在：" + code);
            }
        }

        // 防呆：管理员不能把自己身上的 admin 去掉，否则会把自己锁在外面
        Long currentUserId = LoginUserHolder.getUserId();
        if (currentUserId != null && currentUserId.equals(userId)) {
            boolean wasAdmin = userRoleMapper.selectRolesByUserId(userId).contains("admin");
            if (wasAdmin && !wanted.contains("admin")) {
                throw new CustomerException(ResultCode.PARAM_ERROR, "不能移除自己的管理员角色");
            }
        }

        userRoleMapper.deleteByUserId(userId);
        userRoleMapper.insertBatch(userId, wanted);

        // 同步「身份标签」：roles 变了，帖子/主页上显示的角色名也得跟着变，
        // 否则给人加了版主，他帖子上还是光秃秃的（或者还挂着旧身份）。
        // 只写 primary_role，鉴权不受影响。
        // 优先级不写死在代码里：取 role.sort 最小的那个，内置角色排 1~6，
        // 后台自建的角色 sort 更大，自然排后面，不用改代码。
        Map<String, Integer> sortMap = new HashMap<>();
        for (Role r : roleMapper.selectAll()) {
            sortMap.put(r.getRoleCode(), r.getSort() == null ? Integer.MAX_VALUE : r.getSort());
        }
        String displayRole = wanted.stream()
                .min(Comparator.comparingInt(c -> sortMap.getOrDefault(c, Integer.MAX_VALUE)))
                .orElse("member");
        userMapper.updatePrimaryRole(userId, displayRole);

        // 权限是内存缓存的，改完必须失效，否则对方要等重启才生效
        PermissionCache.remove(userId);
    }

    @Override
    public void updateStyle(Long userId, UpdateUserStyleDTO dto) {
        if (userId == null || dto == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "参数错误");
        }
        if (userMapper.selectById(userId) == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
        }

        // 空串一律转成 null：前端清空取色器 = 恢复默认，
        // 这样数据库里不会留下 '' 这种既不是颜色也不是 null 的值
        String nameColor = blankToNull(dto.getNameColor());
        String roleColor = blankToNull(dto.getRoleColor());

        userMapper.updateStyle(userId, nameColor, roleColor);
        // 颜色不参与鉴权，不需要清 PermissionCache；
        // 但对方刷新页面前看到的是 /user/info 的旧值，属于正常现象
    }

    /** 去掉首尾空格，空串转 null */
    private static String blankToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    @Override
    public void punish(Long userId, AdminPunishDTO dto) {
        if (dto == null || dto.getLevel() == null || dto.getDays() == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请选择处罚方式和时长");
        }
        if (dto.getDays() == 0 || dto.getDays() < -1) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "处罚时长不正确");
        }
        userBanService.punish(userId, dto.getLevel(), dto.getDays(), dto.getReason());
    }

    @Override
    public void unban(Long userId) {
        userBanService.release(userId);
    }

    @Override
    public void markEmailVerified(Long userId) {
        userVerifyService.markVerified(userId);
    }

    /**
     * 管理员代为注销（不可逆）。
     * <p>
     * 只在「用户不会用自助入口 / 发邮件申请」时才用。因为不可逆，这里比处罚严：
     * <b>不能注销自己</b>（自删是误触重灾区），<b>不能注销任何持 user:manage 的账号</b>
     * （删掉最后一个管理员，站点就再也进不了后台）。
     * <p>
     * 真正的清除逻辑和用户自助注销共用同一条 SQL（{@link UserMapper#deactivate}），
     * 所以两条路径的效果一定一致 —— 不会出现「自助注销清得干净、后台代注销漏了头像」。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deactivateUser(Long userId) {
        if (userId == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请选择要注销的用户");
        }
        Long operatorId = LoginUserHolder.getUserId();
        if (userId.equals(operatorId)) {
            throw new CustomerException(ResultCode.PARAM_ERROR,
                    "不能注销自己的账号，请先登录另一个管理员账号再操作");
        }

        User target = userMapper.selectById(userId);
        if (target == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
        }
        if (target.getDeletedAt() != null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "该账号已经注销过了");
        }

        List<String> targetPerms = rolePermissionMapper.selectPermissionsByUserId(userId);
        if (targetPerms != null && targetPerms.contains(MANAGE_PERMISSION)) {
            throw new CustomerException(ResultCode.NO_PERMISSION,
                    "该账号持有「用户管理」权限，不能注销；请先移除它的管理员角色");
        }

        String placeholder = BCrypt.hashpw(UUID.randomUUID().toString(), BCrypt.gensalt());
        int rows = userMapper.deactivate(userId, placeholder);
        if (rows != 1) {
            throw new CustomerException(ResultCode.SERVER_ERROR, "注销失败，请稍后重试");
        }
        UserTokenVersionCache.removeVersion(userId);
        PermissionCache.remove(userId);

        // 留痕：以后他说「我号怎么没了」，日志里查得到是谁、什么时候操作的
        log.warn("[admin-deactivate] 管理员 {} 注销了用户 {}（原昵称 {}）",
                operatorId, userId, target.getName());
    }
}
