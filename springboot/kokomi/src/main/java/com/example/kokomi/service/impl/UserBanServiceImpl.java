package com.example.kokomi.service.impl;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.kokomi.common.BanLevel;
import com.example.kokomi.common.BanText;
import com.example.kokomi.common.ResultCode;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.RolePermissionMapper;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.service.UserBanService;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.util.PermissionCache;
import com.example.kokomi.util.UserTokenVersionCache;

import cn.hutool.core.util.StrUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserBanServiceImpl implements UserBanService {

    private static final String DEFAULT_REASON = "违反社区规范";

    private final UserMapper userMapper;
    private final RolePermissionMapper rolePermissionMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String punish(Long targetId, int level, Integer days, String reason) {
        if (targetId == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
        }
        if (!BanLevel.isValid(level)) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "不支持的处罚方式");
        }

        Long operatorId = LoginUserHolder.getUserId();
        if (operatorId != null && operatorId.equals(targetId)) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "不能处罚自己");
        }

        User target = userMapper.selectById(targetId);
        if (target == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
        }

        // 有后台管理权限的人不能被这样处理掉，否则可能把最后一个管理员锁在门外
        Set<String> perms = new HashSet<>(rolePermissionMapper.selectPermissionsByUserId(targetId));
        if (perms.contains("user:manage")) {
            throw new CustomerException(ResultCode.NO_PERMISSION, "不能处罚拥有后台管理权限的用户");
        }

        LocalDateTime until = (days != null && days > 0) ? LocalDateTime.now().plusDays(days) : null;
        String text = StrUtil.isBlank(reason)
                ? DEFAULT_REASON
                : StrUtil.maxLength(reason.trim(), 200);

        // 只有封号才作废登录态。
        // 禁言的本意是「还能登录、还能看帖，只是发不出内容」，把人踢下线纯属误伤；
        // 拦截在 checkCanSpeak 里查库完成，不依赖 token 版本。
        boolean kickOut = level == BanLevel.BAN;
        userMapper.banUser(targetId, level, until, text, kickOut ? 1 : 0);

        if (kickOut) {
            // 版本号变了，内存里缓的旧值必须清掉，否则拦截器拿缓存比对会放行
            UserTokenVersionCache.removeVersion(targetId);
        }
        PermissionCache.remove(targetId);

        log.info("处罚用户 {} -{}（{}），理由：{}（{}）", targetId, BanLevel.labelOf(level),
                BanText.untilText(until), text, kickOut ? "已强制下线" : "保持登录");
        return target.getName();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void release(Long targetId) {
        if (targetId == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
        }
        User user = userMapper.selectById(targetId);
        if (user == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
        }
        if (!BanLevel.isPunished(user.getStatus())) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "该用户没有被处罚");
        }
        userMapper.unbanUser(targetId);
        // 封号时版本号已经 +1，旧 token 早就失效了，清掉缓存让对方重新登录时能拿到新值；
        // 禁言没动过版本号，这一句只是顺手（回表查到的值本来就一致），
        // 对方手里那份还活着的 token 会立刻恢复发言能力，不用重新登录。
        UserTokenVersionCache.removeVersion(targetId);
        PermissionCache.remove(targetId);
    }

    @Override
    public void checkCanSpeak(Long userId) {
        if (userId == null) {
            return;
        }
        User state = userMapper.selectBanState(userId);
        if (state == null || !BanLevel.isPunished(state.getStatus())) {
            return;
        }

        // 临时处罚到期：顺手解除，这次请求直接放行
        if (state.getBanUntil() != null && state.getBanUntil().isBefore(LocalDateTime.now())) {
            userMapper.unbanUser(userId);
            UserTokenVersionCache.removeVersion(userId);
            return;
        }

        if (state.getStatus() == BanLevel.BAN) {
            // 正常流程走不到这里（封号时 token 已被作废），
            // 除非有人直接改库或者 token 还没失效，兜一层保险
            throw new CustomerException(ResultCode.AUTHOR_ERROR,
                    BanText.loginDenied(state.getBanUntil(), state.getBanReason()));
        }
        // 禁言用单独的码（506）而不是 403：
        // 前端要靠它分辨「角色没权限」和「被禁言了」，后者要立刻把发布框换成提示条
        throw new CustomerException(ResultCode.MUTED,
                BanText.speakDenied(state.getBanUntil(), state.getBanReason()));
    }
}
