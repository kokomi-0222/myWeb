package com.example.kokomi.controller;

import com.example.kokomi.common.Result;
import com.example.kokomi.bo.UserBO;

import com.example.kokomi.dto.LoginEncryptDTO;
import com.example.kokomi.dto.UserUpdateDTO;
import com.example.kokomi.service.UserService;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.util.RsaUtil;
import com.example.kokomi.vo.LoginVO;
import com.example.kokomi.vo.UserInfoVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;


@RestController
@RequestMapping("/user")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final RsaUtil rsaUtil;

    @PostMapping("/login")
    public Result<LoginVO> login(@RequestBody LoginEncryptDTO dto) {
        UserBO userBO = userService.login(dto);
        LoginVO loginVO = LoginVO.fromUserBO(userBO);
        return Result.success(loginVO);
    }

    @GetMapping("/info")
    public Result<UserInfoVO> info() {
        Long userId = LoginUserHolder.getUserId();
        //System.out.println("查询用户：" + userId);
        UserBO userBO = userService.findById(userId);
        UserInfoVO userInfo = UserInfoVO.fromUserBO(userBO);
        return Result.success(userInfo);
    }

    @PostMapping("/update")
    public Result<String> updateUserInfo(@RequestBody UserUpdateDTO userUpdateDto) {
        userService.updateUserInfo(userUpdateDto);
        return Result.success("保存成功");
    }

}