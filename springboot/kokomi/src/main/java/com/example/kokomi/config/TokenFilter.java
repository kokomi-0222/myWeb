package com.example.kokomi.config;

import com.example.kokomi.entity.User;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.util.JwtUtil;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.util.UserTokenVersionCache;
import jakarta.annotation.Resource;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * 从请求头中提取 JWT Token 并设置用户 ID 到 ThreadLocal
 * 即使是未登录也能访问的公开接口，也能获取到当前用户信息
 * <p>
 * 校验 JWT 签名、过期时间以及 tokenVersion，
 * 确保密码修改后旧 Token 在所有接口（包括公开接口）上失效。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class TokenFilter implements Filter {

    @Resource
    private UserMapper userMapper;

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        String header = httpRequest.getHeader("Authorization");

        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            if (JwtUtil.validateToken(token)) {
                Long userId = JwtUtil.getUserId(token);
                // 校验 tokenVersion，确保密码修改后旧 Token 在所有接口上失效
                if (isTokenVersionValid(userId, JwtUtil.getTokenVersion(token))) {
                    LoginUserHolder.setUserId(userId);
                }
            }
        }

        try {
            chain.doFilter(request, response);
        } finally {
            LoginUserHolder.clear();
        }
    }

    /**
     * 校验 Token 中的版本号是否与数据库中当前版本号一致。
     * 优先查缓存，缓存未命中时查数据库并回填缓存。
     * 与 {@code LoginInterceptor} 中的校验逻辑保持一致。
     */
    private boolean isTokenVersionValid(Long userId, Integer tokenVersion) {
        Integer cacheVersion = UserTokenVersionCache.getVersion(userId);
        if (cacheVersion != null) {
            return cacheVersion.equals(tokenVersion);
        }
        // 缓存未命中，查数据库
        User user = userMapper.selectById(userId);
        if (user == null) {
            return false;
        }
        Integer dbVersion = user.getTokenVersion();
        UserTokenVersionCache.setVersion(userId, dbVersion);
        return dbVersion.equals(tokenVersion);
    }
}