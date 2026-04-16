package com.example.kokomi.exception;

import com.example.kokomi.common.Result;
import com.example.kokomi.common.ResultCode;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    /**
     * 处理我们自定义的业务异常
     */
    @ExceptionHandler(CustomerException.class)
    public Result<?> handleCustomerException(CustomerException e) {
        // 异常里的 code 和 msg 直接返回
        return Result.error(e.getCode(), e.getMessage());
    }

    /**
     * 【关键】处理请求方法错误：POST访问GET接口 → 直接返回友好提示
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public Result<?> handleMethodNotSupported() {
        return Result.error(405, "请求方式错误，请检查前端使用 GET/POST 类型");
    }
    /**
     * 处理所有其他未知异常
     */
    @ExceptionHandler(Exception.class)
    public Result<?> handleException(Exception e) {
        return Result.error(ResultCode.SERVER_ERROR, "服务器繁忙");
    }
}