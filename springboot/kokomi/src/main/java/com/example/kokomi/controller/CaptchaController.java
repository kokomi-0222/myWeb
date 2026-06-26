package com.example.kokomi.controller;

import cn.hutool.captcha.CaptchaUtil;
import cn.hutool.captcha.ShearCaptcha;
import com.example.kokomi.common.Result;
import com.example.kokomi.util.CaptchaCache;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class CaptchaController {

    @GetMapping("/captcha")
    public Result<Map<String, Object>> getCaptcha() {
        // 生成扭曲干扰型验证码（宽200, 高80, 4位字符, 4条干扰线）
        ShearCaptcha captcha = CaptchaUtil.createShearCaptcha(200, 80, 4, 4);
        String code = captcha.getCode();

        // 转 Base64
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        captcha.write(out);
        String base64 = "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());

        // 存入缓存
        String key = UUID.randomUUID().toString().replace("-", "");
        CaptchaCache.put(key, code);

        Map<String, Object> result = new HashMap<>();
        result.put("captchaKey", key);
        result.put("captchaImage", base64);
        return Result.success(result);
    }
}
