package com.example.kokomi.exception;

import com.example.kokomi.common.Result;
import com.example.kokomi.common.ResultCode;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.io.IOException;
import java.sql.SQLException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    /**
     * 自定义业务异常
     */
    @ExceptionHandler(CustomerException.class)
    public Result<?> handleCustomerException(CustomerException e) {
        return Result.error(e.getCode(), e.getMessage());
    }

    /**
     * 参数校验失败（@Valid）
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result<?> handleValidationException(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .reduce((a, b) -> a + "; " + b)
                .orElse("参数校验失败");
        return Result.error(ResultCode.PARAM_ERROR, msg);
    }

    /**
     * 请求方法错误（GET/POST）
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public Result<?> handleMethodNotSupported() {
        return Result.error(405, "请求方式错误，请检查前端使用 GET/POST 类型");
    }

    /**
     * IO 异常（文件操作失败）
     */
    @ExceptionHandler(IOException.class)
    public Result<?> handleIOException(IOException e) {
        e.printStackTrace();
        return Result.error(ResultCode.SERVER_ERROR, "文件操作失败");
    }

    /**
     * SQL 异常
     */
    @ExceptionHandler(SQLException.class)
    public Result<?> handleSQLException(SQLException e) {
        e.printStackTrace();
        return Result.error(ResultCode.SERVER_ERROR, "数据库操作失败");
    }

    /**
     * 其他未知异常
     */
    @ExceptionHandler(Exception.class)
    public Result<?> handleException(Exception e) {
        e.printStackTrace();
        return Result.error(ResultCode.SERVER_ERROR, "服务器繁忙");
    }
}
