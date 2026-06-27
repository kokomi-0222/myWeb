package com.example.kokomi.annotation;

import java.lang.annotation.*;

/**
 * 声明式权限校验注解。
 * 标记在 Controller 方法上，由 {@code PermissionInterceptor} 强制实施。
 *
 * <pre>
 *   @RequirePermission("post:delete")
 *   public Result&lt;Void&gt; deletePost(@PathVariable Long postId) { ... }
 * </pre>
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequirePermission {
    /** 权限编码，如 post:delete */
    String value();
    /** 校验失败时返回给客户端的提示信息 */
    String message() default "权限不足";
}
