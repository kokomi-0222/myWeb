package com.example.kokomi.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.kokomi.common.Result;
import com.example.kokomi.service.NotificationService;
import com.example.kokomi.vo.NotificationVO;
import com.example.kokomi.vo.PageVO;

import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    /** 我的通知列表 */
    @GetMapping
    public Result<PageVO<NotificationVO>> list(
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(notificationService.getMyNotifications(pageNum, pageSize));
    }

    /** 未读数，用于顶栏/侧栏红点 */
    @GetMapping("/unread-count")
    public Result<Long> unreadCount() {
        return Result.success(notificationService.getUnreadCount());
    }

    /** 全部标为已读 */
    @PostMapping("/read-all")
    public Result<Void> markAllRead() {
        notificationService.markAllRead();
        return Result.success();
    }

    /** 单条标为已读 */
    @PostMapping("/{id}/read")
    public Result<Void> markRead(@PathVariable Long id) {
        notificationService.markRead(id);
        return Result.success();
    }
}
