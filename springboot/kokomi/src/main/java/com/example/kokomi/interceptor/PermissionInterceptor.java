package com.example.kokomi.interceptor;

import com.example.kokomi.annotation.RequirePermission;
import com.example.kokomi.common.ResultCode;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.RolePermissionMapper;
import com.example.kokomi.mapper.UserRoleMapper;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.util.PermissionCache;
import jakarta.annotation.Resource;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.HashSet;
import java.util.Set;

/**
 * 权限拦截器 —— 在 {@code LoginInterceptor} 之后执行，
 * 强制实施 {@link RequirePermission} 注解声明的权限校验。
 * <p>
 * 缓存命中时 O(1) 查找；缓存缺失时自动从 DB 加载并回填缓存。
 */
@Component
public class PermissionInterceptor implements HandlerInterceptor {

    @Resource
    private UserRoleMapper userRoleMapper;

    @Resource
    private RolePermissionMapper rolePermissionMapper;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) {
        // 非 Controller 方法（如静态资源）直接放行
        if (!(handler instanceof HandlerMethod hm)) {
            return true;
        }

        RequirePermission annotation = hm.getMethodAnnotation(RequirePermission.class);
        if (annotation == null) {
            return true; // 无注解的方法不需要权限校验
        }

        Long userId = LoginUserHolder.getUserId();
        if (userId == null) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "请先登录");
        }

        String requiredPerm = annotation.value();

        // 缓存命中，直接校验
        if (!PermissionCache.hasPermission(userId, requiredPerm)) {
            // 缓存缺失：从 DB 加载并回填缓存
            Set<String> roles = new HashSet<>(userRoleMapper.selectRolesByUserId(userId));
            Set<String> perms = new HashSet<>(
                    rolePermissionMapper.selectPermissionsByUserId(userId));
            PermissionCache.put(userId, roles, perms);

            if (!perms.contains(requiredPerm)) {
                throw new CustomerException(ResultCode.NO_PERMISSION, annotation.message());
            }
        }
        return true;
    }
}
