package com.example.kokomi.service;

import com.example.kokomi.dto.CreateTopicDTO;
import com.example.kokomi.dto.UpdateTopicDTO;
import com.example.kokomi.vo.TopicVO;

import java.util.List;

public interface TopicService {

    /** 话题列表（话题表 ∪ 帖子里实际出现过的 type），带帖子数 */
    List<TopicVO> list();

    /** 新建话题，权限由 Controller 上的注解把关 */
    TopicVO create(CreateTopicDTO dto);

    /**
     * 改话题的展示名 / 颜色 / 排序（后台）。
     * 只改 name 不动 value：value 是写进 post.type 的内部标识，
     * 动它就得批量改历史帖子，风险大于收益。
     */
    TopicVO update(Long id, UpdateTopicDTO dto);

    /** 删话题（后台）：话题下还有帖子时拒绝，避免帖子变成无归属 */
    void remove(Long id);
}
