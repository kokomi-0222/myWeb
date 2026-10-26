package com.example.kokomi.service;

import java.util.HashSet;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.example.kokomi.mapper.RolePermissionMapper;
import com.example.kokomi.mapper.UserRoleMapper;
import com.example.kokomi.util.PermissionCache;

import lombok.RequiredArgsConstructor;

/**
 * 权限码查询的唯一入口。
 *
 * <p>为什么不用 {@code @RequirePermission} 拦截器：那层只能按路由设闸，
 * 而等级制的拒绝理由要分开 —— 「发帖要会员」和「评论要绑邮箱」是两个码
 * （509 / 507），前端要给出完全不同的引导，所以必须在 Service 层判。
 *
 * <p>先查 {@link PermissionCache}，未命中回表重建 —— 和拦截器同一套逻辑，
 * 只是拦截器只管 request 级校验，管不到「同一个接口里按情况判」的场景。
 */
@Service
@RequiredArgsConstructor
public class PermissionService {

    private final UserRoleMapper userRoleMapper;
    private final RolePermissionMapper rolePermissionMapper;

    /** 用户是否拥有某个权限码（缓存未命中会查库并回填） */
    public boolean has(Long userId, String permCode) {
        if (userId == null || permCode == null) {
            return false;
        }
        if (PermissionCache.hasPermission(userId, permCode)) {
            return true;
        }
        Set<String> perms = refresh(userId);
        return perms.contains(permCode);
    }

    /** 重新从库里读角色 + 权限，并写回缓存 */
    public Set<String> refresh(Long userId) {
        Set<String> roles = new HashSet<>(userRoleMapper.selectRolesByUserId(userId));
        Set<String> perms = new HashSet<>(rolePermissionMapper.selectPermissionsByUserId(userId));
        PermissionCache.put(userId, roles, perms);
        return perms;
    }
}
