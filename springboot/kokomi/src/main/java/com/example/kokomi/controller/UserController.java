package com.example.kokomi.controller;

import com.example.kokomi.common.Result;
import com.example.kokomi.bo.UserBO;

import com.example.kokomi.dto.EncryptDataDTO;
import com.example.kokomi.dto.UserUpdateDTO;
import jakarta.validation.Valid;
import com.example.kokomi.service.UserService;
import com.example.kokomi.util.LoginUserHolder;

import com.example.kokomi.vo.LoginVO;
import com.example.kokomi.vo.UserInfoVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;


@RestController
@RequestMapping("/user")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @PostMapping("/login")
    public Result<LoginVO> login(@RequestBody EncryptDataDTO dto) {
        UserBO userBO = userService.login(dto);
        LoginVO loginVO = LoginVO.fromUserBO(userBO);
        return Result.success(loginVO);
    }

    @PostMapping("register")
    public  Result<Void> register(@RequestBody EncryptDataDTO dto){
        return userService.register(dto);
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
    public Result<String> updateUserInfo(@Valid @RequestBody UserUpdateDTO userUpdateDto) {
        userService.updateUserInfo(userUpdateDto);
        return Result.success("保存成功");
    }

    @PostMapping("/password")
    public Result<String> updatePassword(@RequestBody EncryptDataDTO dto){
        return userService.updatePassword(dto);
    }


}