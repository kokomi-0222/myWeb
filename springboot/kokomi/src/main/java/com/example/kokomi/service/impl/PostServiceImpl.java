package com.example.kokomi.service.impl;


import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import jakarta.servlet.http.HttpServletRequest;

import com.example.kokomi.mapper.*;
import com.example.kokomi.util.PermissionCache;
import com.example.kokomi.util.TextUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.dto.CreatePostDTO;
import com.example.kokomi.dto.PostMediaDTO;
import com.example.kokomi.dto.PostPageQueryDTO;
import com.example.kokomi.entity.Comment;
import com.example.kokomi.entity.Post;
import com.example.kokomi.entity.PostLike;
import com.example.kokomi.entity.PostMedia;
import com.example.kokomi.entity.PostTag;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.service.PostService;
import com.example.kokomi.service.NotificationService;
import com.example.kokomi.service.UserBanService;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.vo.PageVO;
import com.example.kokomi.vo.PostAuthorVO;
import com.example.kokomi.vo.PostDetailVO;
import com.example.kokomi.vo.PostMediaVO;

import lombok.RequiredArgsConstructor;
@Service
@RequiredArgsConstructor
public class PostServiceImpl implements PostService {

    private final PostMapper postMapper;
    private final PostMediaMapper postMediaMapper;
    private final PostLikeMapper postLikeMapper;
    private final PostTagMapper postTagMapper;
    private final UserMapper userMapper;
    private final UserRoleMapper userRoleMapper;
    private final RolePermissionMapper rolePermissionMapper;
    private final CommentMapper commentMapper;
    private final NotificationService notificationService;
    private final UserBanService userBanService;

    @Value("${app.upload-path}")
    private String uploadPath;

    @Value("${app.base-url}")
    private String baseUrl;

    @Override
    public PostDetailVO getPostById(Long id) {
        Post post = postMapper.selectById(id);
        if (post == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "帖子不存在");
        }
        // 浏览量 +1：同一访客 10 分钟内重复刷新只计一次
        if (shouldCountView(id)) {
            postMapper.incrementViews(id);
            post.setViews((post.getViews() == null ? 0 : post.getViews()) + 1);
        }
        return convertToVO(post);
    }

    @Override
    public PageVO<PostDetailVO> getPostPage(PostPageQueryDTO dto) {
        return getPostList(dto);
    }

    @Override
    public PageVO<PostDetailVO> getMyPosts(PostPageQueryDTO dto) {
        dto.setUserId(LoginUserHolder.getUserId());
        return getPostList(dto);
    }

    @Override
    public PageVO<PostDetailVO> getUserPosts(PostPageQueryDTO dto) {
        Long targetUserId = dto.getUserId();
        if (targetUserId == null || targetUserId <= 0) {
            return PageVO.build(new ArrayList<>(), 0L, dto.getPageNum(), dto.getPageSize());
        }
        return getPostList(dto);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public PostDetailVO createPost(CreatePostDTO dto) {
        Long userId = LoginUserHolder.getUserId();
        // 被禁言 / 封号的人不能发新帖（前端已经把发布框禁掉了，这里兜底）
        userBanService.checkCanSpeak(userId);

        Post post = new Post();
        post.setTitle(dto.getTitle() != null ? dto.getTitle().trim() : "");
        // 正文保留首行缩进（显示端是 pre-wrap），只清尾部空白与开头空行
        post.setContent(TextUtils.normalizeContent(dto.getContent()));
        post.setUserId(userId);
        post.setType(dto.getType() != null ? dto.getType().trim() : "");

        postMapper.insert(post);

        // 插入媒体（将图片从 temp 移到 images）
        if (dto.getMedia() != null && !dto.getMedia().isEmpty()) {
            // 确保 images 目录存在
            File imagesDirFile = new File(uploadPath + "images/");
            if (!imagesDirFile.exists()) {
                imagesDirFile.mkdirs();
            }

            List<PostMedia> mediaList = new ArrayList<>();
            int sort = 0;
            for (PostMediaDTO md : dto.getMedia()) {
                PostMedia m = new PostMedia();
                m.setPostId(post.getId());

                // 将 temp 目录中的图片移动到 images 目录（仅接受合法的 temp URL）
                String finalUrl = moveTempFileToImages(md.getUrl());
                if (finalUrl == null) {
                    continue; // 非法的媒体 URL，跳过不入库
                }

                m.setThumbnailUrl(finalUrl);
                m.setPreviewUrl(finalUrl);
                m.setRawUrl(finalUrl);
                m.setType(md.getType() != null ? md.getType() : "image");
                m.setWidth(md.getWidth());
                m.setHeight(md.getHeight());
                m.setSize(md.getSize());
                m.setAlt(md.getAlt() != null ? md.getAlt() : "");
                m.setFormat(md.getFormat() != null ? md.getFormat() : "");
                m.setIsAnimated(md.getIsAnimated() != null ? md.getIsAnimated() : 0);
                m.setSort(sort);
                sort++;
                mediaList.add(m);
            }
            if (!mediaList.isEmpty()) {
                postMediaMapper.insertBatch(mediaList);
            }
        }

        // 插入标签
        if (dto.getTags() != null && !dto.getTags().isEmpty()) {
            postTagMapper.insertBatch(post.getId(), dto.getTags());
        }

        return convertToVO(post);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public PostDetailVO updatePost(Long postId, CreatePostDTO dto) {
        Long userId = LoginUserHolder.getUserId();

        Post post = postMapper.selectById(postId);
        if (post == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "帖子不存在");
        }

        // 权限：作者本人随便改自己的帖；别人改需要 post:edit（版主 / 编辑 / 管理员）
        boolean isOwner = post.getUserId().equals(userId);
        boolean hasEditPerm = hasPermission(userId, "post:edit");
        if (!isOwner && !hasEditPerm) {
            throw new CustomerException(ResultCode.NO_PERMISSION, "无权编辑该帖子");
        }
        if (isOwner) {
            // 禁言的人连自己的旧帖也不能改——不然等于换个地方继续发内容。
            // 版主 / 编辑改别人的帖不受影响。
            userBanService.checkCanSpeak(userId);
        }

        // 只覆盖文案与类型，互动计数一律不动
        post.setTitle(dto.getTitle() != null ? dto.getTitle().trim() : "");
        post.setContent(TextUtils.normalizeContent(dto.getContent()));
        post.setType(dto.getType() != null ? dto.getType().trim() : "");
        postMapper.update(post);

        // ---- 图片：按「文件名」做差异对比 ----
        // 前端提交的每一项有两种来源：老图（已在 images 目录）和新图（还在 temp 目录）。
        // 老图原样留下，新图搬进 images。为了顺序可控，DB 行统一删掉重插，
        // 但只有「这次没再出现」的老图才真删文件，避免误删还在用的图。
        List<PostMedia> oldMedia = postMediaMapper.selectByPostId(postId);

        Set<String> keptFiles = new HashSet<>();
        List<PostMedia> newMediaList = new ArrayList<>();
        if (dto.getMedia() != null) {
            File imagesDirFile = new File(uploadPath + "images/");
            if (!imagesDirFile.exists()) {
                imagesDirFile.mkdirs();
            }

            int sort = 0;
            for (PostMediaDTO md : dto.getMedia()) {
                String finalUrl = resolveMediaUrl(md.getUrl());
                if (finalUrl == null) {
                    continue; // 既不是本站老图也不是合法临时图，跳过
                }
                keptFiles.add(fileNameOf(finalUrl));

                PostMedia m = new PostMedia();
                m.setPostId(postId);
                m.setThumbnailUrl(finalUrl);
                m.setPreviewUrl(finalUrl);
                m.setRawUrl(finalUrl);
                m.setType(md.getType() != null ? md.getType() : "image");
                m.setWidth(md.getWidth());
                m.setHeight(md.getHeight());
                m.setSize(md.getSize());
                m.setAlt(md.getAlt() != null ? md.getAlt() : "");
                m.setFormat(md.getFormat() != null ? md.getFormat() : "");
                m.setIsAnimated(md.getIsAnimated() != null ? md.getIsAnimated() : 0);
                m.setSort(sort);
                sort++;
                newMediaList.add(m);
            }
        }

        // 被移除的老图：连文件一起清掉（deleteImageFile 内部会校验路径与存在性）
        for (PostMedia old : oldMedia) {
            if (!keptFiles.contains(fileNameOf(old.getThumbnailUrl()))) {
                deleteImageFile(old.getThumbnailUrl());
            }
        }

        postMediaMapper.deleteByPostId(postId);
        if (!newMediaList.isEmpty()) {
            postMediaMapper.insertBatch(newMediaList);
        }

        // 标签：null 表示这次没提交标签（保持原样），非 null 才整体替换
        if (dto.getTags() != null) {
            postTagMapper.deleteByPostId(postId);
            if (!dto.getTags().isEmpty()) {
                postTagMapper.insertBatch(postId, dto.getTags());
            }
        }

        return convertToVO(post);
    }

    /**
     * 解析编辑时提交的图片地址。
     * <ul>
     *   <li>已经在 /upload/images/ 下的老图：校验文件名后原样保留（不限定域名，
     *       换过 base-url 也能对上）</li>
     *   <li>还在 /upload/temp/ 下的新图：搬进 images 目录并返回永久地址</li>
     *   <li>其它任意地址：返回 null，调用方跳过</li>
     * </ul>
     */
    private String resolveMediaUrl(String url) {
        if (url == null) {
            return null;
        }
        if (url.contains("/upload/images/")) {
            String filename = url.substring(url.lastIndexOf("/") + 1);
            if (filename.isEmpty() || filename.contains("/") || filename.contains("\\")
                    || filename.contains("..")) {
                return null;
            }
            return baseUrl + "/upload/images/" + filename;
        }
        return moveTempFileToImages(url);
    }

    /** 取 URL 里的文件名，用于媒体差异对比（跨域名、跨协议都只比文件名） */
    private String fileNameOf(String url) {
        if (url == null) {
            return "";
        }
        return url.substring(url.lastIndexOf("/") + 1);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deletePost(Long postId) {
        Long currentUserId = LoginUserHolder.getUserId();

        // 查询帖子是否存在
        Post post = postMapper.selectById(postId);
        if (post == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "帖子不存在");
        }

        // 检查权限：帖子作者 或 拥有 post:delete 权限的用户
        boolean isOwner = post.getUserId().equals(currentUserId);
        boolean hasDeletePerm = hasPermission(currentUserId, "post:delete");

        if (!isOwner && !hasDeletePerm) {
            throw new CustomerException(ResultCode.NO_PERMISSION, "无权删除该帖子");
        }

        deletePostInternal(postId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deletePostByAdmin(Long postId) {
        if (postMapper.selectById(postId) == null) {
            return; // 已经被作者自己删掉了，幂等返回
        }
        deletePostInternal(postId);
    }

    /**
     * 真正的删除动作：清图片文件 + 清关联表 + 删帖子。
     * 权限判断留在两个入口方法里，这里只管删。
     */
    private void deletePostInternal(Long postId) {
        // 删除帖子关联的图片文件
        List<PostMedia> mediaList = postMediaMapper.selectByPostId(postId);
        for (PostMedia media : mediaList) {
            deleteImageFile(media.getThumbnailUrl());
        }

        // 删除评论中关联的图片文件（需在删DB记录前完成）
        List<Comment> comments = commentMapper.selectByPostId(postId);
        for (Comment comment : comments) {
            deleteImageFile(comment.getImage());
        }

        // 删除关联数据：媒体、标签、评论、帖子
        postMediaMapper.deleteByPostId(postId);
        postTagMapper.deleteByPostId(postId);
        commentMapper.deleteByPostId(postId);
        postMapper.deleteById(postId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void like(Long postId) {
        Long userId = LoginUserHolder.getUserId();

        Post post = postMapper.selectById(postId);
        if (post == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "帖子不存在");
        }

        // 原子 INSERT IGNORE：遇唯一约束冲突时返回 0，消除 check-then-act 竞态
        PostLike like = new PostLike();
        like.setPostId(postId);
        like.setUserId(userId);
        int inserted = postLikeMapper.insertIgnore(like);
        if (inserted > 0) {
            postMapper.incrementLikes(postId);
            // 通知作者。点赞类通知按 (接收者, 触发者, 类型, 目标) 去重：
            // 取消赞再点赞只会刷新原通知的时间，不会在消息中心叠加新条目。
            String title = post.getTitle();
            String suffix = (title == null || title.isBlank()) ? "" : "《" + title + "》";
            notificationService.notify(post.getUserId(), userId, "like_post",
                    postId, null, "赞了你的帖子" + suffix);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void unlike(Long postId) {
        Long userId = LoginUserHolder.getUserId();

        Post post = postMapper.selectById(postId);
        if (post == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "帖子不存在");
        }

        // 直接用 DELETE 返回值判断是否真正删除了记录，避免 check-then-act 竞态
        int deleted = postLikeMapper.deleteByPostIdAndUserId(postId, userId);
        if (deleted > 0) {
            postMapper.decrementLikes(postId);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void forward(Long postId) {
        Long userId = LoginUserHolder.getUserId();

        Post post = postMapper.selectById(postId);
        if (post == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "帖子不存在");
        }

        // 转发不做幂等：同一用户对同一帖子可以多次转发，每次都计数
        postMapper.incrementForwards(postId);

        String title = post.getTitle();
        String suffix = (title == null || title.isBlank()) ? "" : "《" + title + "》";
        notificationService.notify(post.getUserId(), userId, "forward",
                postId, null, "转发了你的帖子" + suffix);
    }

    /**
     * 将临时文件从 temp 目录迁移到 images 目录，返回永久访问 URL。
     * 仅接受以 {@code /upload/temp/} 为路径的合法临时文件 URL，
     * 拒绝外部 URL、javascript: 协议等任意字符串。
     *
     * @param url 客户端传入的临时文件 URL
     * @return 迁移成功返回永久 URL，否则返回 null（调用方应跳过该媒体项）
     */
    private String moveTempFileToImages(String url) {
        // 必须是本地上传的临时文件 URL
        if (url == null || !url.contains("/upload/temp/")) {
            return null;
        }
        String filename = url.substring(url.lastIndexOf("/") + 1);
        // 防止路径穿越：文件名不能包含路径分隔符或上级目录标记
        if (filename.isEmpty() || filename.contains("/") || filename.contains("\\")
                || filename.contains("..")) {
            return null;
        }
        File tempFile = new File(uploadPath + "temp/" + filename);
        File imageFile = new File(uploadPath + "images/" + filename);
        try {
            // 直接 move，消除 exists() → move() 之间的 TOCTOU 竞态窗口
            Files.move(tempFile.toPath(), imageFile.toPath(),
                    StandardCopyOption.REPLACE_EXISTING);
            return baseUrl + "/upload/images/" + filename;
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * 检查用户是否拥有指定权限（优先查缓存，缓存缺失时查 DB 并回填）。
     */
    private boolean hasPermission(Long userId, String permCode) {
        if (PermissionCache.hasPermission(userId, permCode)) {
            return true;
        }
        // 缓存缺失：从 DB 加载 roles + permissions 并回填缓存
        java.util.Set<String> roles = new java.util.HashSet<>(
                userRoleMapper.selectRolesByUserId(userId));
        java.util.Set<String> perms = new java.util.HashSet<>(
                rolePermissionMapper.selectPermissionsByUserId(userId));
        PermissionCache.put(userId, roles, perms);
        return perms.contains(permCode);
    }

    /**
     * 安全删除 images 目录下的图片文件。
     * 仅处理合法路径，防止路径穿越。
     */
    private void deleteImageFile(String url) {
        if (url == null || !url.contains("/upload/images/")) {
            return;
        }
        String filename = url.substring(url.lastIndexOf("/") + 1);
        if (filename.contains("/") || filename.contains("\\") || filename.contains("..")) {
            return;
        }
        File file = new File(uploadPath + "images/" + filename);
        if (file.exists()) {
            file.delete();
        }
    }

    @Override
    public Map<String, Long> getStats() {
        Map<String, Long> stats = new java.util.HashMap<>();
        stats.put("posts", postMapper.countAll());
        stats.put("users", userMapper.countAll());
        stats.put("comments", commentMapper.countAll());
        return stats;
    }

    private PageVO<PostDetailVO> getPostList(PostPageQueryDTO dto) {        int offset = (dto.getPageNum() - 1) * dto.getPageSize();

        List<Post> postList = postMapper.selectPostPage(dto, offset);
        Long total = postMapper.selectPostCount(dto);

        // 一次性批量组装（原来是每条帖子 4 次额外查询，10 条帖子 42 次 SQL）
        return PageVO.build(toVOList(postList), total, dto.getPageNum(), dto.getPageSize());
    }

    /**
     * 批量把帖子转成 VO。
     * <p>
     * 作者、媒体、标签、点赞状态四类关联数据各用一次 IN 查询取全，
     * 整体 SQL 次数固定为 4~5 次，与帖子条数无关。
     */
    private List<PostDetailVO> toVOList(List<Post> posts) {
        List<PostDetailVO> voList = new ArrayList<>();
        if (posts == null || posts.isEmpty()) {
            return voList;
        }

        List<Long> postIds = posts.stream().map(Post::getId).toList();
        Set<Long> authorIds = posts.stream()
                .map(Post::getUserId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        // 作者：一次批量查，同一作者只查一次
        Map<Long, User> authorMap = authorIds.isEmpty()
                ? Map.of()
                : userMapper.selectByIds(authorIds).stream()
                        .collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a));

        // 媒体 / 标签：按 post_id 分组
        Map<Long, List<PostMedia>> mediaMap = postMediaMapper.selectByPostIds(postIds).stream()
                .collect(Collectors.groupingBy(PostMedia::getPostId));
        Map<Long, List<String>> tagMap = postTagMapper.selectByPostIds(postIds).stream()
                .collect(Collectors.groupingBy(PostTag::getPostId,
                        Collectors.mapping(PostTag::getTagName, Collectors.toList())));

        // 当前用户点过赞的帖子集合，未登录时为空
        Long currentUserId = LoginUserHolder.getUserId();
        Set<Long> likedIds = currentUserId == null
                ? Set.of()
                : new HashSet<>(postLikeMapper.selectLikedPostIds(currentUserId, postIds));

        for (Post post : posts) {
            PostDetailVO vo = new PostDetailVO();
            vo.setId(post.getId());
            vo.setTitle(post.getTitle());
            vo.setContent(post.getContent());
            vo.setCreatedAt(post.getCreatedAt());
            vo.setViews(post.getViews());
            vo.setLikes(post.getLikes());
            vo.setCommentsCount(post.getComments());
            vo.setForward(post.getForwards());
            vo.setType(post.getType());

            User user = authorMap.get(post.getUserId());
            if (user != null) {
                PostAuthorVO authorVO = new PostAuthorVO();
                authorVO.setId(user.getId());
                authorVO.setName(user.getName());
                authorVO.setNameColor(user.getNameColor());
                authorVO.setRoleColor(user.getRoleColor());
                authorVO.setPrimaryRole(user.getPrimaryRole());
                authorVO.setAvatar(user.getAvatar());
                authorVO.setBadge(user.getBadge());
                authorVO.setOrnament(user.getOrnament());
                vo.setAuthor(authorVO);
            }

            List<PostMediaVO> mediaVOList = new ArrayList<>();
            for (PostMedia m : mediaMap.getOrDefault(post.getId(), List.of())) {
                PostMediaVO mv = new PostMediaVO();
                mv.setId(String.valueOf(m.getId()));
                mv.setThumbnailUrl(m.getThumbnailUrl());
                mv.setPreviewUrl(m.getPreviewUrl());
                mv.setRowUrl(m.getRawUrl());
                mv.setType(m.getType());
                mv.setWidth(m.getWidth());
                mv.setHeight(m.getHeight());
                mv.setSize(m.getSize());
                mv.setAlt(m.getAlt());
                mv.setOrientation(1);
                mv.setFormat(m.getFormat());
                mv.setIsAnimated(m.getIsAnimated() != null && m.getIsAnimated() == 1);
                mediaVOList.add(mv);
            }
            vo.setMedia(mediaVOList);

            vo.setTag(tagMap.getOrDefault(post.getId(), List.of()));
            vo.setLikedByMe(likedIds.contains(post.getId()));
            voList.add(vo);
        }
        return voList;
    }

    /** 单条转换（创建帖子后立即返回用） */
    private PostDetailVO convertToVO(Post post) {
        List<PostDetailVO> list = toVOList(List.of(post));
        return list.isEmpty() ? new PostDetailVO() : list.get(0);
    }

    /**
     * 浏览量防刷：同一访客对同一帖子在窗口期内只计一次。
     * 纯内存实现，重启后清零——浏览量本来就不是精确指标，够用即可。
     */
    private static final long VIEW_WINDOW_MS = 10 * 60 * 1000L;
    private static final Map<String, Long> VIEW_HITS = new ConcurrentHashMap<>();

    private boolean shouldCountView(Long postId) {
        long now = System.currentTimeMillis();
        // 简单容量保护：超过 5 万条时清掉过期项，避免无界增长
        if (VIEW_HITS.size() > 50_000) {
            VIEW_HITS.entrySet().removeIf(e -> now - e.getValue() > VIEW_WINDOW_MS);
        }
        String key = viewKey(postId);
        Long last = VIEW_HITS.get(key);
        if (last != null && now - last < VIEW_WINDOW_MS) {
            return false;
        }
        VIEW_HITS.put(key, now);
        return true;
    }

    private String viewKey(Long postId) {
        Long userId = LoginUserHolder.getUserId();
        if (userId != null) {
            return postId + ":u" + userId;
        }
        try {
            ServletRequestAttributes attrs =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs != null) {
                HttpServletRequest req = attrs.getRequest();
                // Nginx 已经设置了 X-Real-IP，优先用它；直连时退回 RemoteAddr
                String ip = req.getHeader("X-Real-IP");
                if (ip == null || ip.isBlank()) {
                    ip = req.getRemoteAddr();
                }
                return postId + ":ip" + ip;
            }
        } catch (Exception ignored) {
            // 拿不到请求上下文（例如内部调用）就退化成共享计数
        }
        return postId + ":anon";
    }
}