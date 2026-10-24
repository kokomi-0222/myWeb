package com.example.kokomi.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Param;

import com.example.kokomi.entity.Notification;
import com.example.kokomi.vo.NotificationVO;

public interface NotificationMapper {

    int insert(Notification notification);

    /**
     * 插入但忽略唯一键冲突。
     * <p>
     * 点赞类通知在库里有唯一索引（见 sql_notification_dedup.sql），
     * 并发下两个请求可能都判断“不存在”，这里靠索引把重复的那条挡掉，
     * 不会出现两条一模一样的「赞了你的帖子」。
     */
    int insertIgnore(Notification notification);

    /**
     * 刷新点赞类通知：同一接收者 + 同一触发者 + 同一目标的旧通知不新增行，
     * 只更新时间并重新置为未读。返回 0 表示此前没有通知。
     */
    int refresh(Notification notification);

    /**
     * 我的通知分页。直接返回 VO，SQL 里 JOIN 出触发者昵称和头像，
     * 一次查询解决，不再为每条通知补查用户。
     */
    List<NotificationVO> selectPage(@Param("recipientId") Long recipientId,
                                    @Param("offset") int offset,
                                    @Param("limit") int limit);

    Long countByRecipient(@Param("recipientId") Long recipientId);

    Long countUnread(@Param("recipientId") Long recipientId);

    /** 标记单条已读，必须带 recipientId 防止改到别人的通知 */
    int markRead(@Param("id") Long id, @Param("recipientId") Long recipientId);

    int markAllRead(@Param("recipientId") Long recipientId);
}
