package com.example.kokomi.util;

import java.security.SecureRandom;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 「这个邮箱已经验过了」的临时凭证（注册第二步用）。
 *
 * <p>为什么需要它：注册现在分两步 —— 先验邮箱、再设密码。
 * 第二步不想让用户再输一遍验证码（码 10 分钟就过期，而想密码往往要更久），
 * 所以第一步验过之后发一张 ticket，第二步凭 ticket 建号。
 *
 * <p>ticket 的安全边界：
 * <ul>
 *   <li>随机 16 字节、只存在内存里，不是可猜测的编号；</li>
 *   <li>和邮箱绑定，过期后只能重新验一次邮箱（成本很低）；</li>
 *   <li>不绑定 IP —— 手机从 Wi-Fi 切 4G 很正常，绑 IP 只会误伤。</li>
 * </ul>
 * ticket 被重放也没有额外风险：email 上有唯一索引，同一个邮箱建不出第二个号。
 *
 * <p>⚠️ <b>同一邮箱只保留一张有效票</b>（{@link #TICKET_OF_EMAIL} 反查索引）。
 * 这一条是必须的：验证码第一步现在是「只验不消费」（见 {@link EmailCodeCache#verify}），
 * 同一个码在 10 分钟内能被反复验证，而每验一次本来就要发一张新票 ——
 * 没有反查索引的话，一个人拿自己邮箱收到的码狂刷这个接口，内存就会被无限灌满，
 * 30 分钟后才开始有过期回收，几百万个 Entry 直接把堆撑爆。
 * 现在无论验多少次，同一邮箱拿到的都是同一张票（前端无感：票都绑同一个邮箱）。
 */
public final class RegisterTicketCache {

    /**
     * 凭证有效期。
     * <p>为什么比邮箱验证码（10 分钟）长一倍多：验证码要「赶紧复制过来」，10 分钟是合理的；
     * 而 ticket 之后用户要做的事是**想一个密码**，还可能去倒杯水、被别的窗口打断。
     * 之前和验证码一样设 10 分钟，用户在第 2 步停久一点就会看到「邮箱验证已过期，
     * 请重新验证邮箱」，等于前面白验一次。ticket 是绑定邮箱的一次性凭证、
     * 建号成功即作废，放宽到 30 分钟不会削弱什么。
     */
    private static final long EXPIRE_MS = 30 * 60 * 1000L;
    /**
     * 缓存上限。
     * <p>按「同一邮箱只留一张票」之后，这里的条数 ≈ 30 分钟内验过邮箱的人数，
     * 而全站发码配额是 120 封/小时，所以稳态只有几十条，5000 是 100 倍余量。
     * 真撞到上限说明要么发码配额被调得很大、要么有人在刷 ——
     * 这时候**宁可不发新票**（上层回「注册人数较多」），也不能让 Map 无界增长。
     */
    private static final int MAX_SIZE = 5000;

    /** ticket → 邮箱 */
    private static final Map<String, Entry> TICKETS = new ConcurrentHashMap<>();
    /** 邮箱 → ticket（同一邮箱同一时刻只保留一张有效票） */
    private static final Map<String, String> TICKET_OF_EMAIL = new ConcurrentHashMap<>();

    private static final SecureRandom RANDOM = new SecureRandom();

    private RegisterTicketCache() {
    }

    /**
     * 给一个已经验过的邮箱发凭证；该邮箱已有未过期的票就直接复用。
     *
     * @return ticket（32 位十六进制）；缓存已满且清完过期项仍满时返回 {@code null}
     */
    public static String issue(String email) {
        if (email == null || email.isBlank()) {
            return null;
        }
        long now = System.currentTimeMillis();

        // ① 这个邮箱手里已经有一张没过期的票 → 原样再给一次，别签发新的
        String existing = TICKET_OF_EMAIL.get(email);
        if (existing != null) {
            Entry entry = TICKETS.get(existing);
            if (entry != null && entry.expireAt > now) {
                return existing;
            }
            TICKET_OF_EMAIL.remove(email, existing);
            if (entry != null) {
                TICKETS.remove(existing, entry);
            }
        }

        // ② 到上限了先扫一遍过期项；扫完还满就拒绝，绝不无界增长
        if (TICKETS.size() >= MAX_SIZE) {
            purgeExpired(now);
            if (TICKETS.size() >= MAX_SIZE) {
                return null;
            }
        }

        String ticket = randomHex(16);
        TICKETS.put(ticket, new Entry(email, now + EXPIRE_MS));
        TICKET_OF_EMAIL.put(email, ticket);
        return ticket;
    }

    /**
     * 校验凭证并取出邮箱，**不删除**。
     *
     * <p>为什么不在这里删：注册可能因为「密码不一致」失败，用户改一下就该能重新提交；
     * 一验就删等于把失败成本转嫁给用户。真正用完（建号成功）时调 {@link #remove}。
     *
     * @return 邮箱；ticket 不存在 / 已过期返回 null
     */
    public static String peek(String ticket) {
        if (ticket == null || ticket.isBlank()) {
            return null;
        }
        Entry entry = TICKETS.get(ticket);
        if (entry == null) {
            return null;
        }
        if (entry.expireAt <= System.currentTimeMillis()) {
            // 顺手把两条索引一起清掉，否则 TICKET_OF_EMAIL 会攒一堆死记录
            TICKETS.remove(ticket, entry);
            TICKET_OF_EMAIL.remove(entry.email, ticket);
            return null;
        }
        return entry.email;
    }

    /** 建号成功后作废凭证 */
    public static void remove(String ticket) {
        if (ticket == null) {
            return;
        }
        Entry entry = TICKETS.remove(ticket);
        if (entry != null) {
            // 带上 ticket 做值匹配：万一这个邮箱刚换了新票，别把新票的索引也删了
            TICKET_OF_EMAIL.remove(entry.email, ticket);
        }
    }

    /** 当前缓存里有多少张票（只给测试 / 排查用） */
    public static int size() {
        return TICKETS.size();
    }

    private static void purgeExpired(long now) {
        TICKETS.entrySet().removeIf(e -> {
            boolean stale = e.getValue().expireAt <= now;
            if (stale) {
                TICKET_OF_EMAIL.remove(e.getValue().email, e.getKey());
            }
            return stale;
        });
    }

    private static String randomHex(int bytes) {
        byte[] buf = new byte[bytes];
        RANDOM.nextBytes(buf);
        StringBuilder sb = new StringBuilder(bytes * 2);
        for (byte b : buf) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }

    private static final class Entry {
        private final String email;
        private final long expireAt;

        private Entry(String email, long expireAt) {
            this.email = email;
            this.expireAt = expireAt;
        }
    }
}
