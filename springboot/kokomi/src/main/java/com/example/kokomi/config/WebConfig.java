package com.example.kokomi.config;

import com.example.kokomi.interceptor.LoginInterceptor;
import com.example.kokomi.interceptor.PermissionInterceptor;
import jakarta.annotation.Resource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Resource
    private AuthProperties authProperties;
    @Resource
    private LoginInterceptor loginInterceptor;
    @Resource
    private PermissionInterceptor permissionInterceptor;

    @Value("${app.upload-path}")
    private String uploadPath;

    // 静态资源映射
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/upload/**")
                .addResourceLocations("file:" + uploadPath);
    }

    // 拦截器
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(loginInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns(authProperties.getExcludePaths())
                // 必须放行静态图片
                .excludePathPatterns("/upload/**");

        // 权限拦截器（在登录拦截器之后执行，LoginUserHolder 已设置）
        registry.addInterceptor(permissionInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns(authProperties.getExcludePaths())
                .excludePathPatterns("/upload/**");
    }
}