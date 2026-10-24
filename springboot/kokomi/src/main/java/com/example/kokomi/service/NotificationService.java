package com.example.kokomi.service;

import com.example.kokomi.vo.PageVO;
import com.example.kokomi.vo.NotificationVO;

public interface NotificationService {

    /**
     * 产生一条通知。
     * <p>
     * 内部会跳过「自己操作自己」的情况（recipient 等于 sender 直接返回），
     * 调用方不需要每次判断。
     *
     * @param type like_post / like_comment / comment / reply
     */
    void notify(Long recipientId, Long senderId, String type,
                Long postId, Long commentId, String content);

    /** 当前登录用户的通知分页 */
    PageVO<NotificationVO> getMyNotifications(int pageNum, int pageSize);

    /** 当前登录用户的未读数 */
    long getUnreadCount();

    /** 把某条通知标记为已读（只能标记自己的） */
    void markRead(Long id);

    /** 全部标记为已读 */
    void markAllRead();
}
