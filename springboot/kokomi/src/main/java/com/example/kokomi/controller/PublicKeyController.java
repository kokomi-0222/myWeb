package com.example.kokomi.controller;

import com.example.kokomi.common.Result;
import com.example.kokomi.config.RsaProperties;
import jakarta.annotation.Resource;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class PublicKeyController {

    private final RsaProperties rsaProperties;

    @GetMapping("/publicKey")
    public Result<Map<String, Object>> publicKey() {
        Map<String, Object> map = new HashMap<>();
        map.put("publicKey", rsaProperties.getPublicKey());
        map.put("mockServer", false);
        return Result.success(map);
    }
}