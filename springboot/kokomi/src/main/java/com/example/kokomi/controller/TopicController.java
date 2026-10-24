package com.example.kokomi.controller;

import com.example.kokomi.annotation.RequirePermission;
import com.example.kokomi.common.Result;
import com.example.kokomi.dto.CreateTopicDTO;
import com.example.kokomi.service.TopicService;
import com.example.kokomi.vo.TopicVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/topic")
@RequiredArgsConstructor
public class TopicController {

    private final TopicService topicService;

    // 话题列表（公开）：首页话题栏、手机端热搜、发布框分类都读这份。
    // 必须在 auth.excludePaths 里放行，否则未登录访客打开首页就 401。
    @GetMapping("/list")
    public Result<List<TopicVO>> list() {
        return Result.success(topicService.list());
    }

    // 新建话题：只有持有 topic:create 权限的角色（当前仅 admin）能调用
    @PostMapping
    @RequirePermission(value = "topic:create", message = "只有站长可以新建话题")
    public Result<TopicVO> create(@Valid @RequestBody CreateTopicDTO dto) {
        return Result.success(topicService.create(dto));
    }
}
