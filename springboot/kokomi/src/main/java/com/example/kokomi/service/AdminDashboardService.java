package com.example.kokomi.service;

import com.example.kokomi.vo.AdminStatVO;

/**
 * 后台概览页数据。
 */
public interface AdminDashboardService {

    /** 总数 / 今日新增 / 最近注册用户 / 最新帖子 */
    AdminStatVO stats();
}
