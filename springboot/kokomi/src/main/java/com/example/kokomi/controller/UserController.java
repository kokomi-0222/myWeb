package com.example.kokomi.controller;

import com.example.kokomi.common.Result;
import com.example.kokomi.dto.LoginDto;
import com.example.kokomi.bo.UserBO;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.service.UserService;
import com.example.kokomi.vo.LoginVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.util.UUID;

@RestController
@RequestMapping("/user")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @PostMapping("/login")
    public Result<LoginVO> login(@RequestBody LoginDto loginDto) {
        UserBO userBO = userService.login(loginDto);
        LoginVO loginVO = LoginVO.fromUserBO(userBO);
        return Result.success(loginVO);
    }


    // 头像上传
    @PostMapping("/upload/avatar")
    public Result<String> uploadAvatar(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new CustomerException(400, "请选择要上传的头像");
        }

        String originalFilename = file.getOriginalFilename();
        String suffix = originalFilename.substring(originalFilename.lastIndexOf("."));

        // 只允许图片类型
        if (!suffix.matches(".(jpg|jpeg|png|gif|webp)$")) {
            throw new CustomerException(400, "只支持 jpg、png、gif、webp 格式");
        }

        // 生成唯一文件名
        String fileName = UUID.randomUUID() + suffix;
        File dir = new File("./upload/images/");

        if (!dir.exists()) {
            dir.mkdirs();
        }

        try {
            file.transferTo(new File(dir, fileName));
        } catch (IOException e) {
            throw new CustomerException(500, "头像上传失败");
        }

        // 返回可直接访问的 URL
        String avatarUrl = "http://localhost:8080/images/" + fileName;
        return Result.success(avatarUrl);
    }
}