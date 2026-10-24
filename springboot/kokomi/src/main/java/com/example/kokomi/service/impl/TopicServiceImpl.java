package com.example.kokomi.service.impl;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.dto.CreateTopicDTO;
import com.example.kokomi.dto.UpdateTopicDTO;
import com.example.kokomi.entity.Topic;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.TopicMapper;
import com.example.kokomi.service.TopicService;
import com.example.kokomi.vo.TopicVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class TopicServiceImpl implements TopicService {

    /**
     * 自动配色用的调色板。新话题不指定颜色时按名称哈希取一个，
     * 保证「同名的永远是同一个颜色」，不会每次刷新都变。
     * 前 7 个就是原有分类的配色，索引靠前更容易被选中。
     */
    private static final String[] PALETTE = {
            "#00aeec", "#fb7299", "#6b7cff", "#f5a623", "#23c343", "#8b5cf6",
            "#8a8a8a", "#ff6b6b", "#12b8a6", "#e668c6", "#f0932b", "#4cd137",
    };

    /** 颜色只接受 #RGB / #RRGGBB，防止把 CSS 里塞进奇怪的东西 */
    private static final Pattern COLOR_PATTERN = Pattern.compile("^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$");

    private final TopicMapper topicMapper;

    @Override
    public List<TopicVO> list() {
        List<Topic> topics = topicMapper.selectAll();

        // 统计各话题下的帖子数。用 LinkedHashMap 保持遍历顺序稳定
        Map<String, Long> postCounts = new LinkedHashMap<>();
        for (TopicVO c : topicMapper.countPostByType()) {
            if (c.getValue() != null) {
                postCounts.put(c.getValue(), c.getCount() == null ? 0L : c.getCount());
            }
        }

        List<TopicVO> result = new ArrayList<>();
        Set<String> registered = new HashSet<>();

        // 1) 话题表里登记过的，顺序以 sort 为准（包括还没人发帖的新话题）
        for (Topic t : topics) {
            TopicVO vo = new TopicVO();
            vo.setId(t.getId());
            vo.setName(t.getName());
            vo.setValue(t.getValue());
            vo.setColor(t.getColor());
            vo.setSort(t.getSort());
            vo.setCount(postCounts.getOrDefault(t.getValue(), 0L));
            vo.setRegistered(true);
            result.add(vo);
            registered.add(t.getValue());
        }

        // 2) 兜底：帖子里用过、但话题表没登记的类型（历史数据 / 手工写进 type 的值）
        for (Map.Entry<String, Long> e : postCounts.entrySet()) {
            if (registered.contains(e.getKey())) {
                continue;
            }
            TopicVO vo = new TopicVO();
            vo.setName(e.getKey());
            vo.setValue(e.getKey());
            vo.setColor(hashColor(e.getKey()));
            vo.setSort(Integer.MAX_VALUE); // 排在登记过的话题后面
            vo.setCount(e.getValue());
            vo.setRegistered(false); // 只存在于老帖子的 post.type 里，话题表没登记
            result.add(vo);
        }

        return result;
    }

    @Override
    @Transactional
    public TopicVO create(CreateTopicDTO dto) {
        String name = dto.getName() == null ? "" : dto.getName().trim();
        if (name.isEmpty()) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "话题名称不能为空");
        }

        // value 决定 post.type 里存什么。不填就用中文名，搜索照样按 type = 值 匹配
        String value = (dto.getValue() == null || dto.getValue().isBlank())
                ? name
                : dto.getValue().trim();

        if (topicMapper.selectByValue(value) != null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "话题「" + name + "」已经存在了");
        }
        // 中文名也算重复：value 不同但 name 相同，话题栏会出现两个一样的标签
        if (!value.equals(name)) {
            boolean nameTaken = topicMapper.selectAll().stream()
                    .anyMatch(t -> name.equals(t.getName()));
            if (nameTaken) {
                throw new CustomerException(ResultCode.PARAM_ERROR, "话题「" + name + "」已经存在了");
            }
        }

        Topic topic = new Topic();
        topic.setName(name);
        topic.setValue(value);
        topic.setColor((dto.getColor() == null || dto.getColor().isBlank())
                ? hashColor(name)
                : dto.getColor().trim());

        Integer maxSort = topicMapper.selectMaxSort();
        topic.setSort((maxSort == null ? 0 : maxSort) + 1);

        topicMapper.insert(topic);

        TopicVO vo = new TopicVO();
        vo.setId(topic.getId());
        vo.setName(topic.getName());
        vo.setValue(topic.getValue());
        vo.setColor(topic.getColor());
        vo.setSort(topic.getSort());
        vo.setCount(0L);
        vo.setRegistered(true);
        return vo;
    }

    @Override
    @Transactional
    public TopicVO update(Long id, UpdateTopicDTO dto) {
        Topic topic = topicMapper.selectById(id);
        if (topic == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "话题不存在或已被删除");
        }

        String newName = dto.getName() == null ? null : dto.getName().trim();
        if (newName != null && newName.isEmpty()) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "话题名称不能为空");
        }
        // 同名检查：value 不同但 name 相同也不行，话题栏会出现两个一模一样的标签
        if (newName != null
                && !newName.equals(topic.getName())
                && topicMapper.selectAll().stream()
                        .anyMatch(t -> !id.equals(t.getId()) && newName.equals(t.getName()))) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "话题「" + newName + "」已经存在了");
        }

        String newColor = dto.getColor() == null ? null : dto.getColor().trim();
        if (newColor != null && !newColor.isEmpty() && !COLOR_PATTERN.matcher(newColor).matches()) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "颜色格式应为 #RRGGBB");
        }

        // 只把真正要改的字段塞进去，Mapper 里用 <if> 拼 SET，不会把没传的字段清空
        Topic patch = new Topic();
        patch.setId(id);
        patch.setName(newName != null && !newName.isEmpty() ? newName : null);
        patch.setColor(newColor != null && !newColor.isEmpty() ? newColor : null);
        patch.setSort(dto.getSort());
        if (patch.getName() != null || patch.getColor() != null || patch.getSort() != null) {
            topicMapper.update(patch);
        }

        Topic latest = topicMapper.selectById(id);
        TopicVO vo = new TopicVO();
        vo.setId(latest.getId());
        vo.setName(latest.getName());
        vo.setValue(latest.getValue());
        vo.setColor(latest.getColor());
        vo.setSort(latest.getSort());
        vo.setRegistered(true);
        Long used = topicMapper.countPostsByValue(latest.getValue());
        vo.setCount(used == null ? 0L : used);
        return vo;
    }

    @Override
    @Transactional
    public void remove(Long id) {
        Topic topic = topicMapper.selectById(id);
        if (topic == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "话题不存在或已被删除");
        }
        // 只删空话题。有帖子的场景让站长先去改帖子的话题，
        // 否则这些帖子的 type 会指向一个不存在的分类，只能靠兜底逻辑显示。
        Long used = topicMapper.countPostsByValue(topic.getValue());
        if (used != null && used > 0) {
            throw new CustomerException(ResultCode.PARAM_ERROR,
                    "「" + topic.getName() + "」下还有 " + used + " 篇帖子，不能删除");
        }
        topicMapper.deleteById(id);
    }

    /** 同名恒定同色：靠 String.hashCode 保证，不引入随机数 */
    private static String hashColor(String seed) {
        int idx = Math.floorMod(seed.hashCode(), PALETTE.length);
        return PALETTE[idx];
    }
}
