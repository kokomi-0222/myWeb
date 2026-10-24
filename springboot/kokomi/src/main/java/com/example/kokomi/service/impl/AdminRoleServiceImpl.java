package com.example.kokomi.service.impl;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.dto.SaveRoleDTO;
import com.example.kokomi.entity.Permission;
import com.example.kokomi.entity.Role;
import com.example.kokomi.entity.RolePermission;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.PermissionMapper;
import com.example.kokomi.mapper.RoleMapper;
import com.example.kokomi.mapper.RolePermissionMapper;
import com.example.kokomi.service.AdminRoleService;
import com.example.kokomi.util.PermissionCache;
import com.example.kokomi.vo.AdminRoleVO;
import com.example.kokomi.vo.PermissionVO;
import com.example.kokomi.vo.RoleOptionVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class AdminRoleServiceImpl implements AdminRoleService {

    /** 角色编码格式：小写开头，只允许小写字母、数字、下划线、短横线 */
    private static final Pattern CODE_PATTERN = Pattern.compile("^[a-z][a-z0-9_-]{1,29}$");

    /** 拥有「管理后台」权限的角色编码。这个角色必须始终保留该权限，否则没人能进后台 */
    private static final String SUPER_ROLE = "admin";
    private static final String MANAGE_PERM = "user:manage";

    private final RoleMapper roleMapper;
    private final PermissionMapper permissionMapper;
    private final RolePermissionMapper rolePermissionMapper;

    @Override
    public List<AdminRoleVO> list() {
        List<Role> roles = roleMapper.selectAll();
        List<Permission> perms = permissionMapper.selectAll();

        // 角色 → 权限码
        Map<String, List<String>> permMap = new LinkedHashMap<>();
        for (RolePermission rp : rolePermissionMapper.selectAll()) {
            permMap.computeIfAbsent(rp.getRoleCode(), k -> new ArrayList<>()).add(rp.getPermCode());
        }

        // 角色 → 用户数（一次 group by 查完，不在循环里逐个数）
        Map<String, Integer> countMap = new HashMap<>();
        for (Map<String, Object> row : roleMapper.countUsersGroupByRole()) {
            Object code = row.get("code");
            Object cnt = row.get("cnt");
            if (code != null) {
                countMap.put(String.valueOf(code), cnt == null ? 0 : Integer.parseInt(String.valueOf(cnt)));
            }
        }

        // 权限码按字典顺序排好，前端勾选状态就稳定
        List<String> permOrder = perms.stream().map(Permission::getPermCode).toList();

        List<AdminRoleVO> list = new ArrayList<>(roles.size());
        for (Role r : roles) {
            AdminRoleVO vo = toVO(r);
            List<String> owned = permMap.getOrDefault(r.getRoleCode(), new ArrayList<>());
            // 脏数据兜底：库里有、字典里已经没有的权限码排到最后
            owned.sort((a, b) -> Integer.compare(indexOf(permOrder, a), indexOf(permOrder, b)));
            vo.setPermissions(owned);
            vo.setUserCount(countMap.getOrDefault(r.getRoleCode(), 0));
            list.add(vo);
        }
        return list;
    }

    private static int indexOf(List<String> list, String v) {
        int i = list.indexOf(v);
        return i < 0 ? Integer.MAX_VALUE : i;
    }

    @Override
    public List<PermissionVO> permissions() {
        List<PermissionVO> list = new ArrayList<>();
        for (Permission p : permissionMapper.selectAll()) {
            PermissionVO vo = new PermissionVO();
            vo.setPermCode(p.getPermCode());
            vo.setPermName(p.getPermName());
            vo.setPermGroup(p.getPermGroup());
            vo.setSort(p.getSort());
            list.add(vo);
        }
        return list;
    }

    @Override
    public List<RoleOptionVO> options() {
        List<RoleOptionVO> list = new ArrayList<>();
        for (Role r : roleMapper.selectAll()) {
            // 名字缺失时退回编码，总比前端显示空白好
            String name = (r.getRoleName() == null || r.getRoleName().isBlank())
                    ? r.getRoleCode() : r.getRoleName();
            list.add(RoleOptionVO.of(r.getRoleCode(), name));
        }
        return list;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdminRoleVO create(SaveRoleDTO dto) {
        String name = dto.getRoleName().trim();
        String code = dto.getRoleCode() == null ? "" : dto.getRoleCode().trim();

        // 显示名重名会让用户管理页上两个标签长得一模一样，直接拦掉
        for (Role r : roleMapper.selectAll()) {
            if (name.equals(r.getRoleName())) {
                throw new CustomerException(ResultCode.PARAM_ERROR, "已经有一个叫「" + name + "」的角色了");
            }
        }

        if (code.isEmpty()) {
            code = generateCode();
        } else {
            if (!CODE_PATTERN.matcher(code).matches()) {
                throw new CustomerException(ResultCode.PARAM_ERROR,
                        "角色编码只能用小写字母、数字、下划线，且以字母开头");
            }
            if (roleMapper.selectByCode(code) != null) {
                throw new CustomerException(ResultCode.PARAM_ERROR, "角色编码「" + code + "」已被占用");
            }
        }

        Role role = new Role();
        role.setRoleCode(code);
        role.setRoleName(name);
        role.setDescription(blankToNull(dto.getDescription()));
        role.setIsSystem(0);
        // 新角色排在所有已有角色后面，避免抢走别人的身份标签
        role.setSort(nextSort());
        roleMapper.insert(role);

        savePermissions(code, dto.getPermissions());
        // 新角色还没人挂，清缓存只是图个安心（成本为零）
        PermissionCache.clear();

        AdminRoleVO vo = toVO(role);
        vo.setPermissions(normalizePermissions(dto.getPermissions()));
        vo.setUserCount(0);
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public AdminRoleVO update(String roleCode, SaveRoleDTO dto) {
        Role role = mustGet(roleCode);
        String name = dto.getRoleName().trim();

        for (Role r : roleMapper.selectAll()) {
            if (!r.getRoleCode().equals(roleCode) && name.equals(r.getRoleName())) {
                throw new CustomerException(ResultCode.PARAM_ERROR, "已经有一个叫「" + name + "」的角色了");
            }
        }

        // 防呆：把管理员的 user:manage 取消掉，等于把所有人锁在后台门外
        if (SUPER_ROLE.equals(roleCode) && !normalizePermissions(dto.getPermissions()).contains(MANAGE_PERM)) {
            throw new CustomerException(ResultCode.PARAM_ERROR,
                    "「管理员」必须保留「管理后台」权限，否则就没人能进后台了");
        }

        role.setRoleName(name);
        role.setDescription(blankToNull(dto.getDescription()));
        roleMapper.updateInfo(role);

        rolePermissionMapper.deleteByRole(roleCode);
        savePermissions(roleCode, dto.getPermissions());

        // 改的是「角色 → 权限」矩阵，受影响的是挂了这个角色的所有人，
        // 不知道具体是谁，直接全清（下次请求各自回表重建）
        PermissionCache.clear();

        AdminRoleVO vo = toVO(role);
        vo.setPermissions(normalizePermissions(dto.getPermissions()));
        vo.setUserCount(roleMapper.countUsers(roleCode));
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(String roleCode) {
        Role role = mustGet(roleCode);

        if (role.getIsSystem() != null && role.getIsSystem() == 1) {
            throw new CustomerException(ResultCode.PARAM_ERROR,
                    "「" + displayName(role) + "」是系统内置角色，不能删除");
        }

        int users = roleMapper.countUsers(roleCode);
        if (users > 0) {
            throw new CustomerException(ResultCode.PARAM_ERROR,
                    "还有 " + users + " 个用户在用这个角色，先到用户管理里把他们换成别的角色");
        }

        rolePermissionMapper.deleteByRole(roleCode);
        roleMapper.deleteByCode(roleCode);
        PermissionCache.clear();
    }

    /* ---------------- 内部工具 ---------------- */

    private Role mustGet(String roleCode) {
        Role role = roleCode == null ? null : roleMapper.selectByCode(roleCode);
        if (role == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "角色不存在：" + roleCode);
        }
        return role;
    }

    /** 写入角色权限，脏的权限码直接过滤掉（库里有但代码里已经不要的） */
    private void savePermissions(String roleCode, List<String> permissions) {
        List<String> valid = normalizePermissions(permissions);
        if (!valid.isEmpty()) {
            rolePermissionMapper.insertBatch(roleCode, valid);
        }
    }

    /** 去重、去空、剔掉字典里不存在的权限码 */
    private List<String> normalizePermissions(List<String> permissions) {
        Set<String> valid = new LinkedHashSet<>(permissionMapper.selectAllCodes());
        List<String> result = new ArrayList<>();
        if (permissions == null) {
            return result;
        }
        Set<String> seen = new LinkedHashSet<>();
        for (String p : permissions) {
            if (p == null) {
                continue;
            }
            String code = p.trim();
            if (!code.isEmpty() && valid.contains(code) && seen.add(code)) {
                result.add(code);
            }
        }
        return result;
    }

    /** 生成一个没被占用的编码：r + 36 进制时间戳，如 rmg2k1ab */
    private String generateCode() {
        long seed = System.currentTimeMillis();
        for (int i = 0; i < 100; i++) {
            String code = "r" + Long.toString(seed + i, 36);
            if (roleMapper.selectByCode(code) == null) {
                return code;
            }
        }
        throw new CustomerException(ResultCode.SERVER_ERROR, "角色编码生成失败，请重试");
    }

    private int nextSort() {
        int max = 0;
        for (Role r : roleMapper.selectAll()) {
            if (r.getSort() != null && r.getSort() > max) {
                max = r.getSort();
            }
        }
        return max + 10;
    }

    private static AdminRoleVO toVO(Role r) {
        AdminRoleVO vo = new AdminRoleVO();
        vo.setRoleCode(r.getRoleCode());
        vo.setRoleName(displayName(r));
        vo.setDescription(r.getDescription());
        vo.setIsSystem(r.getIsSystem() == null ? 0 : r.getIsSystem());
        vo.setSort(r.getSort());
        return vo;
    }

    private static String displayName(Role r) {
        return (r.getRoleName() == null || r.getRoleName().isBlank()) ? r.getRoleCode() : r.getRoleName();
    }

    private static String blankToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
