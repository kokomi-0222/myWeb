package com.example.kokomi.config;

import com.example.kokomi.util.JwtUtil;
import com.example.kokomi.util.LoginUserHolder;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * 从请求头中提取 JWT Token 并设置用户 ID 到 ThreadLocal
 * 即使是未登录也能访问的公开接口，也能获取到当前用户信息
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class TokenFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        String header = httpRequest.getHeader("Authorization");

        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            if (JwtUtil.validateToken(token)) {
                LoginUserHolder.setUserId(JwtUtil.getUserId(token));
            }
        }

        try {
            chain.doFilter(request, response);
        } finally {
            LoginUserHolder.clear();
        }
    }
}