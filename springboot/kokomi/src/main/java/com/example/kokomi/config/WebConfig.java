package com.example.kokomi.config;

import com.example.kokomi.interceptor.LoginInterceptor;
import jakarta.annotation.Resource;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Resource
    private AuthProperties authProperties;

    // 静态资源映射（正确！）
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 访问 /file/xxx → 映射到本地 upload/ 文件夹
        registry.addResourceHandler("/upload/**")
                .addResourceLocations("file:./upload/");
    }


    // 拦截器
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new LoginInterceptor())
                .addPathPatterns("/**")
                .excludePathPatterns(authProperties.getExcludePaths())
                // 必须放行静态图片！！！
                .excludePathPatterns("/upload/**");
    }
}