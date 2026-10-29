package com.example.kokomi.task;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.example.kokomi.util.TempFileCleaner;

import lombok.extern.slf4j.Slf4j;

/**
 * 定时清理 upload/temp 里过期的临时上传文件。
 *
 * <p>配图上传先落 temp，提交时才 move 进 images。用户传了不提交（关弹窗、断网、
 * 换一张重传）文件就一直留在 temp，磁盘只增不减。
 *
 * <p>清理频率默认<b>每周一次</b>（周一凌晨 4:17）。temp 只放「传了没提交」的残留，
 * 攒一周的量一次清干净即可，没必要一天几趟。
 *
 * <p>保留窗口默认 24 小时：发帖/评论/换头像基本是「传完几分钟内提交」，
 * 24 小时足够覆盖「晚上写好、第二天再发」。窗口内不动文件，正在编辑的图不会被误删。
 *
 * <p>刻意<b>不查数据库</b>：temp 就是垃圾桶，过期的直接删，哪怕某条历史数据里
 * 还存着指向它的 URL（用户明确要求如此）。真被删了也不会让帖子发不出去 ——
 * {@code moveTempFileToImages} 失败只是跳过该项媒体，帖子照常入库，只是少一张图。
 *
 * <p>开关与窗口都在 application.yaml 的 {@code app.upload-cleanup.*} 下，改配置重启即可。
 */
@Slf4j
@Component
public class TempFileCleanupTask {

    @Value("${app.upload-path}")
    private String uploadPath;

    @Value("${app.upload-cleanup.retention-hours:24}")
    private long retentionHours;

    @Value("${app.upload-cleanup.enabled:true}")
    private boolean enabled;

    /**
     * 每周一凌晨 4:17 跑一次（错开整点，也错开周日夜里的备份）。
     *
     * <p>cron 走占位符，想改成每周几/几点直接改 yaml，不用重新打包。
     * ⚠️ Spring 的 cron 是 6 段（秒 分 时 日 月 周），最后一段写 {@code MON} 或 {@code 1}。
     */
    @Scheduled(cron = "${app.upload-cleanup.cron:0 17 4 * * MON}")
    public void cleanup() {
        if (!enabled) {
            return;
        }
        try {
            Path tempDir = Paths.get(uploadPath, "temp");
            if (!Files.isDirectory(tempDir)) {
                return; // 还没人上传过，目录不存在
            }
            // 下限 1 小时：真配成 0 或负数时宁可少清，也别把用户正在编辑的图清掉
            long ttlMillis = Math.max(1, retentionHours) * 3600_000L;
            long start = System.currentTimeMillis();
            TempFileCleaner.CleanResult result = TempFileCleaner.clean(tempDir, ttlMillis);
            long cost = System.currentTimeMillis() - start;

            // 一周才一轮，两种情况都打一行：一是清理结果，二是「确实跑了但没什么可清」，
            // 后者是确认调度还活着的唯一凭据。
            if (!result.isEmpty()) {
                log.info("清理 upload/temp：删除 {} 个超过 {} 小时的文件，释放 {}，失败 {} 个，耗时 {} ms",
                        result.deletedFiles(), retentionHours, sizeText(result.freedBytes()),
                        result.failedFiles(), cost);
            } else {
                log.info("清理 upload/temp：本轮无过期文件（保留 {} 小时），耗时 {} ms",
                        retentionHours, cost);
            }
        } catch (RuntimeException e) {
            // 调度线程里抛出去只会被记成 error，这里显式兜住保证下一轮照跑
            log.warn("清理 upload/temp 失败：{}", e.toString());
        }
    }

    /** 字节数转人话：小文件报 B，别让「释放 0 KB」看起来像没删。 */
    private static String sizeText(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        }
        if (bytes < 1024 * 1024) {
            return String.format("%.1f KB", bytes / 1024.0);
        }
        return String.format("%.1f MB", bytes / (1024.0 * 1024));
    }
}
