package com.example.kokomi.interceptor;

import com.example.kokomi.bo.UserBO;
import com.example.kokomi.common.ResultCode;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.service.UserService;
import com.example.kokomi.util.JwtUtil;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.util.UserTokenVersionCache;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class LoginInterceptor implements HandlerInterceptor {

    @Resource
    private UserService userService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {

        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String header = request.getHeader("Authorization");
        //System.out.println("header:" + header);
        // 无 token
        if (header == null || !header.startsWith("Bearer ")) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "未登录，请先登录");
        }

        String token = header.substring(7);
        //System.out.println("token:" + token);
        boolean valid = JwtUtil.validateToken(token);

        if (!valid) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "登录已过期，请重新登录");
        }

        // 放入当前线程
        Long userId = JwtUtil.getUserId(token);
        //System.out.println("userId:" + userId);
        Integer tokenVersion = JwtUtil.getTokenVersion(token);
        //System.out.println("tokenVersion:" + tokenVersion);

        Integer cacheVersion = UserTokenVersionCache.getVersion(userId);
        Integer dbVersion;
        if (cacheVersion != null) {
            // 缓存命中，直接用，不查库
            dbVersion = cacheVersion;
        } else{
            UserBO user = userService.findById(userId);
            if (user == null) {
                throw new CustomerException(ResultCode.AUTHOR_ERROR, "用户不存在");
            }
            dbVersion = user.getTokenVersion();
            // 写入内存缓存
            UserTokenVersionCache.setVersion(userId, dbVersion);
        }

        //System.out.println("dbVersion:" + dbVersion);
        if (!dbVersion.equals(tokenVersion)) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "密码已修改，请重新登录");
        }
        //System.out.println("setUserId:" + userId);
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