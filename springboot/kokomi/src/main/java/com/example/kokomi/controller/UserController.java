package com.example.kokomi.controller;

import com.example.kokomi.common.Result;
import com.example.kokomi.common.ResultCode;
import com.example.kokomi.bo.UserBO;

import com.example.kokomi.dto.EncryptDataDTO;
import com.example.kokomi.dto.RegisterFormDTO;
import com.example.kokomi.dto.ChangeEmailDTO;
import com.example.kokomi.dto.ResetPasswordDTO;
import com.example.kokomi.dto.UserUpdateDTO;
import com.example.kokomi.dto.VerifyCodeDTO;
import com.example.kokomi.dto.VerifySendDTO;
import com.example.kokomi.exception.CustomerException;
import jakarta.validation.Valid;
import com.example.kokomi.service.UserService;
import com.example.kokomi.service.UserVerifyService;
import com.example.kokomi.util.CaptchaCache;
import com.example.kokomi.util.LoginUserHolder;

import cn.hutool.core.util.StrUtil;
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
     * 用户就得重新收一封邮件。ticket 只绑定邮箱、30 分钟有效，失败可重试。
     */
    @PostMapping("/register/verify-email")
    public Result<Map<String, String>> verifyRegisterEmail(@Valid @RequestBody VerifyCodeDTO dto) {
        String ticket = userVerifyService.verifyRegisterEmail(dto.getEmail(), dto.getCode());
        return Result.success(Map.of("ticket", ticket));
    }

    /**
     * 注册前给邮箱发验证码（**免登录**）。
     * <p>
     * 这是全站唯一一个不需要 token 就能触发的发信接口，所以防护做了四层：
     * 图形验证码（人机）、同 IP 限注册频率（RegisterRateLimit）、
     * 同邮箱 60 秒 1 封 / 每小时 5 封、全站每分钟 20 封 / 每小时 120 封
     * （EmailCodeCache 的全局配额）。
     * <p>
     * 人机校验为什么要放在这里而不是 Service：发码是个「没有业务状态、纯副作用」的动作，
     * 四个发码入口都是同一套前置条件，统一在 Controller 用 {@link #requireCaptcha} 挡住，
     * Service 里的频控/配额逻辑一行都不用改。
     * <p>
     * 邮箱已被占用时直接报错 —— 注册场景和「找回密码」不一样，
     * 这里必须告诉用户真实原因，否则他会一直试下去。
     */
    @PostMapping("/register/email-code")
    public Result<VerifySendVO> sendRegisterCode(@RequestBody(required = false) VerifySendDTO dto) {
        VerifySendDTO req = dto == null ? new VerifySendDTO() : dto;
        requireCaptcha(req.getCaptchaKey(), req.getCaptchaCode());
        VerifySendVO vo = userVerifyService.sendRegisterCode(req.getEmail());
        CaptchaCache.remove(req.getCaptchaKey());
        return Result.success(vo);
    }

    /**
     * 给指定邮箱发验证码（60 秒一次、每小时 5 封）。
     * 注意：注册接口本身不发信 —— 否则批量注册就成了发信机。
     * 必须是登录状态下主动点「发送验证码」才会真的发。
     *
     * <p>body 里的 email 不带就用账号上已有的；新注册的账号没有邮箱，必须带。
     * <p>已经登录也要过人机：登录态可能是脚本拿老 token 刷的，而邮件配额是站级的。
     */
    @PostMapping("/verify/send")
    public Result<VerifySendVO> sendVerifyCode(
            @RequestBody(required = false) VerifySendDTO dto) {
        VerifySendDTO req = dto == null ? new VerifySendDTO() : dto;
        requireCaptcha(req.getCaptchaKey(), req.getCaptchaCode());
        VerifySendVO vo = userVerifyService.sendCode(LoginUserHolder.getUserId(), req.getEmail());
        CaptchaCache.remove(req.getCaptchaKey());
        return Result.success(vo);
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
        requireCaptcha(dto.getCaptchaKey(), dto.getCaptchaCode());
        VerifySendVO vo = userVerifyService.sendChangeCode(
                LoginUserHolder.getUserId(), dto.getEmail(), dto.getEncryptedData());
        CaptchaCache.remove(dto.getCaptchaKey());
        return Result.success(vo);
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
     * 邮箱没有绑定账号时直接报 400「该邮箱没有绑定账号」（而不是假装已发送）——
     * 和注册接口「该邮箱已被注册」是同一个口径，理由见 UserVerifyServiceImpl。
     */
    @PostMapping("/password/forgot/send")
    public Result<VerifySendVO> sendResetCode(@RequestBody(required = false) VerifySendDTO dto) {
        VerifySendDTO req = dto == null ? new VerifySendDTO() : dto;
        requireCaptcha(req.getCaptchaKey(), req.getCaptchaCode());
        VerifySendVO vo = userVerifyService.sendResetCode(req.getEmail());
        CaptchaCache.remove(req.getCaptchaKey());
        return Result.success(vo);
    }

    /**
     * 找回密码第 1 步的「下一步」：只校验验证码，不改任何东西（免登录）。
     * <p>
     * 界面和注册一个节奏：第 1 步邮箱 + 码，第 2 步只剩新密码。码在第 2 步还会再验一次
     * （这里只验不消费），所以中间不会出现「第 1 步通过了、第 2 步却说码失效」。
     */
    @PostMapping("/password/forgot/verify")
    public Result<Void> verifyResetCode(@Valid @RequestBody VerifyCodeDTO dto) {
        userVerifyService.verifyResetCode(dto.getEmail(), dto.getCode());
        return Result.success();
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

    /**
     * 自助注销账号（不可逆），入口在「个人中心 → 账号管理 → 危险区域」。
     * <p>
     * 和「解绑邮箱」「改密码」一样要再验一次密码：注销之后账号无法恢复、
     * 用户名和邮箱立刻被别人占用，光有 token 不够证明是本人。
     * <p>
     * 成功后该账号的所有登录态立即失效（token_version + 1），
     * 前端拿到 success 就应该清掉本地 token 并跳首页。
     */
    @PostMapping("/deactivate")
    public Result<Void> deactivate(@RequestBody EncryptDataDTO dto) {
        userService.deactivate(dto.getEncryptedData());
        return Result.success(null, "账号已注销");
    }

    /**
     * 发码接口的人机校验（四个发码入口共用）。
     * <p>
     * 为什么用 {@link CaptchaCache#verify} 而不是 {@code verifyAndRemove}：
     * 发码后面还有一堆会失败的业务校验（邮箱已被注册 / 邮箱没有绑定账号 / 还没验密码 /
     * 60 秒冷却中）—— 一上来就把图烧掉，用户只是把邮箱打错一位就得重看一张图。
     * 所以这里只验不删，等 Service 正常返回（真的走到发信那一步，或者给了一句
     * 「还在冷却」的明确答复）之后，再由调用方 {@code remove} 掉。
     * <p>
     * 代价是同一个 key 可以被反复试，所以 {@code CaptchaCache} 那边加了
     * 「累计错 3 次即作废」；4 位字符给 3 次机会，暴力枚举基本没有收益。
     */
    private void requireCaptcha(String key, String code) {
        if (StrUtil.isBlank(key) || StrUtil.isBlank(code)) {
            throw new CustomerException(ResultCode.CAPTCHA_ERROR, "请先完成人机验证");
        }
        if (!CaptchaCache.verify(key, code)) {
            throw new CustomerException(ResultCode.CAPTCHA_ERROR, "图形验证码不对，换一张再试");
        }
    }

}