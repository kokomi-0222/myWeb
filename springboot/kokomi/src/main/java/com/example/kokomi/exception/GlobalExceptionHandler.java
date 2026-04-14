package com.example.kokomi.exception;

import com.example.kokomi.common.Result;
import com.example.kokomi.common.ResultCode;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(CustomerException.class)
    public Result<?> handleCustomerException(CustomerException e) {
        // 异常里的 code 和 msg 直接返回
        return Result.error(e.getCode(), e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public Result<?> handleException(Exception e) {
        return Result.error(ResultCode.SERVER_ERROR, "服务器繁忙");
    }
}