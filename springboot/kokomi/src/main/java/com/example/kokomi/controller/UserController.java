package com.example.kokomi.controller;

import com.example.kokomi.common.Result;
import com.example.kokomi.bo.UserBO;

import com.example.kokomi.dto.EncryptDataDTO;
import com.example.kokomi.dto.RegisterFormDTO;
import com.example.kokomi.dto.ChangeEmailDTO;
import com.example.kokomi.dto.ResetPasswordDTO;
import com.example.kokomi.dto.UserUpdateDTO;
import com.example.kokomi.dto.VerifyCodeDTO;
import com.example.kokomi.dto.VerifySendDTO;
import jakarta.validation.Valid;
import com.example.kokomi.service.UserService;
import com.example.kokomi.service.UserVerifyService;
import com.example.kokomi.util.LoginUserHolder;

import com.example.kokomi.vo.LoginVO;
import com.example.kokomi.vo.UserInfoVO;
import com.example.kokomi.vo.VerifySendVO;
import java.util.Map;

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

    /**
     * 注册第二步：用户名 + 密码，凭第一步拿到的 ticket 建号。
     * <p>
     * 只有密码走 RSA：用户名默认是邮箱（最长 50 字符），整包塞进 RSA 会超长
     * （RSA-1024 一块最多 117 字节），前端根本加密不出来（详见 RegisterFormDTO）。
     * <p>
     * 邮箱从 ticket 里取，不看请求体 —— 否则能「验 A 的邮箱、注册成 B 的邮箱」。
     * 建号成功直接是普通用户（member）、email_verified=1，并且顺手返回 token，
     * 前端拿到就登录上了，不用再输一遍密码。
     * <p>
     * 不再需要图形验证码：邮箱已经当场验过，再要一道图灵测试只是给真人添麻烦。
     */
    @PostMapping("register")
    public Result<LoginVO> register(@RequestBody RegisterFormDTO dto) {
        return userService.register(dto);
    }

    /**
     * 注册第一步的后半：校验邮箱验证码 → 发一张 ticket。
     * <p>
     * 免登录。为什么单独一个接口而不是留到第二步一起交：验证码命中即消费
     * （见 EmailCodeCache），第二步要是因为「用户名被占用」失败一次，
     * 用户就得重新收一封邮件。ticket 只绑定邮箱、10 分钟有效，失败可重试。
     */
    @PostMapping("/register/verify-email")
    public Result<Map<String, String>> verifyRegisterEmail(@Valid @RequestBody VerifyCodeDTO dto) {
        String ticket = userVerifyService.verifyRegisterEmail(dto.getEmail(), dto.getCode());
        return Result.success(Map.of("ticket", ticket));
    }

    /**
     * 注册前给邮箱发验证码（**免登录**）。
     * <p>
     * 这是全站唯一一个不需要 token 就能触发的发信接口，所以防护做了三层：
     * 同 IP 限注册频率（RegisterRateLimit）、同邮箱 60 秒 1 封 / 每小时 5 封、
     * 全站每分钟 8 封 / 每小时 60 封（EmailCodeCache 的全局配额）。
     * <p>
     * 邮箱已被占用时直接报错 —— 注册场景和「找回密码」不一样，
     * 这里必须告诉用户真实原因，否则他会一直试下去。
     */
    @PostMapping("/register/email-code")
    public Result<VerifySendVO> sendRegisterCode(@RequestBody(required = false) VerifySendDTO dto) {
        return Result.success(userVerifyService.sendRegisterCode(dto == null ? null : dto.getEmail()));
    }

    /**
     * 给指定邮箱发验证码（60 秒一次、每小时 5 封）。
     * 注意：注册接口本身不发信 —— 否则批量注册就成了发信机。
     * 必须是登录状态下主动点「发送验证码」才会真的发。
     *
     * <p>body 里的 email 不带就用账号上已有的；新注册的账号没有邮箱，必须带。
     */
    @PostMapping("/verify/send")
    public Result<VerifySendVO> sendVerifyCode(
            @RequestBody(required = false) VerifySendDTO dto) {
        String email = dto == null ? null : dto.getEmail();
        return Result.success(userVerifyService.sendCode(LoginUserHolder.getUserId(), email));
    }

    /** 提交邮箱验证码：成功后邮箱绑定到账号，游客会顺带升成普通用户（能评论了） */
    @PostMapping("/verify/confirm")
    public Result<Void> confirmVerify(@Valid @RequestBody VerifyCodeDTO dto) {
        userVerifyService.confirm(LoginUserHolder.getUserId(), dto.getEmail(), dto.getCode());
        return Result.success();
    }

    /**
     * 换绑邮箱第一步：验当前密码 → 给新邮箱发验证码。
     * <p>
     * 密码是这一步唯一的身份复核点（换绑 = 换掉找回密码的凭据，
     * 不验密码就等于「拿到登录态就能接管账号」）。
     * <p>
     * 不想换只想丢掉邮箱的话走下面的 /email/unbind（同样要验密码）。
     */
    @PostMapping("/email/change/send")
    public Result<VerifySendVO> sendChangeCode(@RequestBody ChangeEmailDTO dto) {
        return Result.success(userVerifyService.sendChangeCode(
                LoginUserHolder.getUserId(), dto.getEmail(), dto.getEncryptedData()));
    }

    /** 换绑邮箱第二步：新邮箱 + 验证码。角色不动，只换联系方式 */
    @PostMapping("/email/change/confirm")
    public Result<Void> confirmChange(@Valid @RequestBody VerifyCodeDTO dto) {
        userVerifyService.confirmChange(LoginUserHolder.getUserId(), dto.getEmail(), dto.getCode());
        return Result.success();
    }

    /**
     * 解绑邮箱：清空邮箱 + 验证位归零，**角色不动**。
     * <p>
     * 代价只是「不能再走忘记密码」，账号照常发帖评论 —— 发言看的是权限码，
     * 跟邮箱没有关系。要当前密码是因为它能改写找回凭据，不验密码就变成
     * 「拿到登录态的人解绑再绑自己的邮箱 → 重置密码接管账号」。
     */
    @PostMapping("/email/unbind")
    public Result<Void> unbindEmail(@RequestBody EncryptDataDTO dto) {
        userVerifyService.unbind(LoginUserHolder.getUserId(), dto.getEncryptedData());
        return Result.success();
    }

    /**
     * 找回密码第一步：给已绑定的邮箱发重置验证码（免登录）。
     * <p>
     * 无论邮箱有没有注册都返回同样的文案 —— 否则这个接口就是个账号探测器。
     */
    @PostMapping("/password/forgot/send")
    public Result<VerifySendVO> sendResetCode(@RequestBody(required = false) VerifySendDTO dto) {
        return Result.success(userVerifyService.sendResetCode(dto == null ? null : dto.getEmail()));
    }

    /**
     * 找回密码第二步：验证码 + 新密码。
     * <p>
     * 成功后旧密码立即作废、其它设备上的登录全部失效（token_version + 1）。
     */
    @PostMapping("/password/forgot/reset")
    public Result<Void> resetPassword(@Valid @RequestBody ResetPasswordDTO dto) {
        userVerifyService.resetPassword(dto.getEmail(), dto.getCode(), dto.getEncryptedData());
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