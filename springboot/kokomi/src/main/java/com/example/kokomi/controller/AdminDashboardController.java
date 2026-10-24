package com.example.kokomi.controller;

import com.example.kokomi.annotation.RequirePermission;
import com.example.kokomi.common.Result;
import com.example.kokomi.dto.CreateTopicDTO;
import com.example.kokomi.dto.UpdateTopicDTO;
import com.example.kokomi.service.AdminDashboardService;
import com.example.kokomi.service.TopicService;
import com.example.kokomi.vo.AdminStatVO;
import com.example.kokomi.vo.TopicVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 后台管理：概览 + 话题管理。
 * <p>
 * 整个 /admin/** 统一用 {@code user:manage} 把关——「能进后台」就是这一个权限，
 * 不再为每个后台动作单独造权限码，否则权限码会越铺越多、实际只有站长一个人用。
 * 前台发布框新建话题仍走 {@code POST /topic}（{@code topic:create}），两处最终都进 TopicService。
 */
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
public class AdminDashboardController {

    private final AdminDashboardService adminDashboardService;
    private final TopicService topicService;

    /** 概览：总数、今日新增、最近注册用户、最新帖子 */
    @GetMapping("/stats")
    @RequirePermission(value = "user:manage", message = "只有管理员可以进入后台")
    public Result<AdminStatVO> stats() {
        return Result.success(adminDashboardService.stats());
    }

    /** 话题列表：含「帖子用过但没登记」的兜底项（registered=false） */
    @GetMapping("/topics")
    @RequirePermission(value = "user:manage", message = "只有管理员可以管理话题")
    public Result<List<TopicVO>> topics() {
        return Result.success(topicService.list());
    }

    /** 新建话题（后台入口） */
    @PostMapping("/topic")
    @RequirePermission(value = "user:manage", message = "只有管理员可以管理话题")
    public Result<TopicVO> createTopic(@Valid @RequestBody CreateTopicDTO dto) {
        return Result.success(topicService.create(dto), "话题已创建");
    }

    /** 改展示名 / 颜色 / 排序 */
    @PutMapping("/topic/{id}")
    @RequirePermission(value = "user:manage", message = "只有管理员可以管理话题")
    public Result<TopicVO> updateTopic(@PathVariable Long id,
                                       @Valid @RequestBody UpdateTopicDTO dto) {
        return Result.success(topicService.update(id, dto), "话题已更新");
    }

    /** 删除话题：话题下还有帖子会被拒绝 */
    @DeleteMapping("/topic/{id}")
    @RequirePermission(value = "user:manage", message = "只有管理员可以管理话题")
    public Result<Void> deleteTopic(@PathVariable Long id) {
        topicService.remove(id);
        return Result.success(null, "话题已删除");
    }
}
