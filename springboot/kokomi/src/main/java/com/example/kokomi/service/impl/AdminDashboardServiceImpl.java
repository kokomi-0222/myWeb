package com.example.kokomi.service.impl;

import com.example.kokomi.mapper.AdminStatMapper;
import com.example.kokomi.service.AdminDashboardService;
import com.example.kokomi.vo.AdminStatVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AdminDashboardServiceImpl implements AdminDashboardService {

    /** 两块「最近」列表各取 5 条，再多后台首屏就太长了 */
    private static final int RECENT_LIMIT = 5;

    private final AdminStatMapper adminStatMapper;

    @Override
    public AdminStatVO stats() {
        AdminStatVO vo = adminStatMapper.selectCounts();
        if (vo == null) {
            vo = new AdminStatVO();
        }
        vo.setRecentUsers(adminStatMapper.selectRecentUsers(RECENT_LIMIT));
        vo.setRecentPosts(adminStatMapper.selectRecentPosts(RECENT_LIMIT));
        return vo;
    }
}
