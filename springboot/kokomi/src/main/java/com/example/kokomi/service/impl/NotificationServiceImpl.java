package com.example.kokomi.service.impl;

import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.kokomi.entity.Notification;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.common.ResultCode;
import com.example.kokomi.mapper.NotificationMapper;
import com.example.kokomi.service.NotificationService;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.vo.NotificationVO;
import com.example.kokomi.vo.PageVO;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationServiceImpl implements NotificationService {

    private final NotificationMapper notificationMapper;

    /** 摘要列长度，和 DDL 里的 varchar(200) 对齐 */
    private static final int MAX_CONTENT_LENGTH = 200;

    /**
     * 需要去重的类型：同一接收者 + 同一触发者 + 同一目标只保留一条。
     * <p>
     * 点赞是可反复切换的动作（点赞 → 取消 → 再点赞），如果每次都插一条，
     * 消息中心会被同一件事刷满。这里改成“存在则刷新时间”，列表里始终只有一条。
     * <p>
     * 评论 / 回复 / 转发不去重：同一个人对同一帖子评论多次是多个独立事件，应该各留一条。
     */
    private static final Set<String> DEDUP_TYPES = Set.of("like_post", "like_comment");

    @Override
    public void notify(Long recipientId, Long senderId, String type,
                       Long postId, Long commentId, String content) {
        // 自己给自己点赞/评论不需要提醒
        if (recipientId == null || senderId == null || recipientId.equals(senderId)) {
            return;
        }
        try {
            Notification n = new Notification();
            n.setRecipientId(recipientId);
            n.setSenderId(senderId);
            n.setType(type);
            n.setPostId(postId);
            n.setCommentId(commentId);
            n.setContent(truncate(content));

            // 点赞类：已有同一条就只更新时间（顶到列表最前 + 重新未读），不再新增行
            if (DEDUP_TYPES.contains(type) && notificationMapper.refresh(n) > 0) {
                return;
            }
            // 用 INSERT IGNORE 兜住并发：两个请求同时走到这里时，唯一索引只放行一条
            notificationMapper.insertIgnore(n);
        } catch (Exception e) {
            // 通知属于附属功能：写失败不能影响点赞/评论主流程
            log.warn("写入通知失败 recipient={} sender={} type={}", recipientId, senderId, type, e);
        }
    }

    @Override
    public PageVO<NotificationVO> getMyNotifications(int pageNum, int pageSize) {
        Long userId = requireLogin();
        int safePage = Math.max(pageNum, 1);
        int safeSize = Math.min(Math.max(pageSize, 1), 50);
        int offset = (safePage - 1) * safeSize;

        List<NotificationVO> list = notificationMapper.selectPage(userId, offset, safeSize);
        Long total = notificationMapper.countByRecipient(userId);
        return PageVO.build(list, total == null ? 0L : total, safePage, safeSize);
    }

    @Override
    public long getUnreadCount() {
        Long userId = LoginUserHolder.getUserId();
        if (userId == null) {
            return 0;
        }
        Long count = notificationMapper.countUnread(userId);
        return count == null ? 0L : count;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void markRead(Long id) {
        Long userId = requireLogin();
        notificationMapper.markRead(id, userId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void markAllRead() {
        Long userId = requireLogin();
        notificationMapper.markAllRead(userId);
    }

    private Long requireLogin() {
        Long userId = LoginUserHolder.getUserId();
        if (userId == null) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "未登录，请先登录");
        }
        return userId;
    }

    private String truncate(String content) {
        if (content == null) {
            return "";
        }
        String text = content.trim();
        return text.length() <= MAX_CONTENT_LENGTH
                ? text
                : text.substring(0, MAX_CONTENT_LENGTH - 1) + "…";
    }
}
