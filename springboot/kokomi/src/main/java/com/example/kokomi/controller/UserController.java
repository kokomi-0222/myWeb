package com.example.kokomi.controller;

import com.example.kokomi.common.Result;
import com.example.kokomi.bo.UserBO;

import com.example.kokomi.dto.EncryptDataDTO;
import com.example.kokomi.dto.UserUpdateDTO;
import com.example.kokomi.dto.VerifyCodeDTO;
import jakarta.validation.Valid;
import com.example.kokomi.service.UserService;
import com.example.kokomi.service.UserVerifyService;
import com.example.kokomi.util.LoginUserHolder;

import com.example.kokomi.vo.LoginVO;
import com.example.kokomi.vo.UserInfoVO;
import com.example.kokomi.vo.VerifySendVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;


@RestController
@RequestMapping("/user")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final UserVerifyService userVerifyService;

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

    /**
     * 给当前登录用户的邮箱发验证码（60 秒一次、每小时 5 封）。
     * 注意：注册接口本身不发信 —— 否则批量注册就成了发信机。
     * 必须是登录状态下主动点「发送验证码」才会真的发。
     */
    @PostMapping("/verify/send")
    public Result<VerifySendVO> sendVerifyCode() {
        return Result.success(userVerifyService.sendCode(LoginUserHolder.getUserId()));
    }

    /** 提交邮箱验证码，成功后账号即可发帖 / 评论 / 举报 */
    @PostMapping("/verify/confirm")
    public Result<Void> confirmVerify(@Valid @RequestBody VerifyCodeDTO dto) {
        userVerifyService.confirm(LoginUserHolder.getUserId(), dto.getCode());
        return Result.success();
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

    /**
     * 公开的用户主页资料（未登录也能看）。
     * 只返回昵称、头像、签名、帖子数等展示字段，不含邮箱/手机号。
     */
    @GetMapping("/profile/{id}")
    public Result<com.example.kokomi.vo.UserProfileVO> profile(@PathVariable Long id) {
        return Result.success(userService.getPublicProfile(id));
    }

}