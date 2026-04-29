package com.example.kokomi.interceptor;

import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.util.JwtUtil;
import com.example.kokomi.util.LoginUserHolder;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public class LoginInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {

        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String header = request.getHeader("Authorization");
        //System.out.println("header:" + header);
        // 无 token
        if (header == null || !header.startsWith("Bearer ")) {
            throw new CustomerException(401, "未登录，请先登录");
        }

        String token = header.substring(7);
        boolean valid = JwtUtil.validateToken(token);

        if (!valid) {
            throw new CustomerException(401, "登录已过期，请重新登录");
        }

        // 放入当前线程
        Long userId = JwtUtil.getUserId(token);
        LoginUserHolder.setUserId(userId);
        //System.out.println("登录信息校验成功！");
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        // 必须清除，防止内存泄漏
        LoginUserHolder.clear();
    }
}