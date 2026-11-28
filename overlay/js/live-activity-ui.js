import { element } from "./dom.js";
const viewers = ["星辰喵呜", "小鱼干干", "奶茶不加冰", "月下旅人", "芋圆小鱼", "猫窝观察员",
    "布丁补给站", "橘猫电台", "桃桃汽水", "今晚早点睡", "晒太阳协会", "毛绒收集员"];
const chatLines = {
    N: ["这张也好可爱", "卡面的颜色看着好舒服", "猫猫今天也在努力"],
    R: ["这张想放进收藏架", "我喜欢这个卡面！", "这包开得好顺"],
    SR: ["出稀有啦！", "终于闪了一张！", "这张好看，先截个图"],
    SSR: ["是 SSR！", "金光来了！", "这张我蹲好久了"],
    UR: ["UR！猫猫今天运气爆棚", "这张也太闪了！", "今晚的高能时刻！"],
    redpacket: ["谢谢主播的红包", "收到红包啦！", "下一单也加油"],
};
const giftNames = { 1: "墨镜", 5: "小鱼干", 50: "猫猫火箭", 500: "星空城堡" };
function viewerName(id, offset = 0) {
    const hash = Array.from(id).reduce((value, char) => Math.imul(value, 31) + char.charCodeAt(0) >>> 0, 0);
    return viewers[(hash + offset) % viewers.length];
}
function giftSource(event) {
    return event.source === "viewer" ? viewerName(event.id) + (event.givers > 1 ? ` 等 ${event.givers} 人` : "")
        : event.source === "customer" ? "订单客户" : "挑战奖励";
}
function giftName(event) {
    return giftNames[event.face] ?? "礼物";
}
export function createLiveActivity(enabled) {
    const banner = element("gift-banner");
    let liveId = "";
    let lastIds = new Set();
    let queue = [];
    let timer;
    let historyKey = "";
    function resetOverlay() {
        window.clearTimeout(timer);
        timer = undefined;
        queue = [];
        banner.hidden = true;
    }
    function animateNext() {
        if (!enabled()) {
            resetOverlay();
            return;
        }
        const gift = queue.shift();
        if (!gift) {
            resetOverlay();
            return;
        }
        banner.dataset.tier = gift.face >= 50 ? "special" : "normal";
        banner.dataset.source = gift.source;
        element("gift-banner-art").dataset.kind = gift.face === 1 ? "glasses" : "gift";
        element("gift-banner-source").textContent = giftSource(gift);
        element("gift-banner-name").textContent = `${gift.source === "challenge" ? "获得" : "送出"} ${giftName(gift)}`;
        element("gift-banner-count").textContent = `×${gift.count}`;
        banner.hidden = false;
        banner.getAnimations().forEach(animation => animation.cancel());
        timer = window.setTimeout(animateNext, gift.face >= 50 ? 2550 : 1900);
        const soft = document.querySelector(".shell")?.classList.contains("soft-light") ||
            matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!soft)
            banner.animate([
                { opacity: 0, transform: "translateX(14px) scale(.94)" },
                { opacity: 1, transform: "translateX(0) scale(1)", offset: .15 },
                { opacity: 1, transform: "translateX(0) scale(1)", offset: .87 },
                { opacity: 0, transform: "translateY(-5px)" },
            ], { duration: gift.face >= 50 ? 2550 : 1900, easing: "ease-out", fill: "both" });
    }
    function renderHistory(events) {
        const key = events.map(event => event.id).join("|");
        if (key === historyKey)
            return;
        historyKey = key;
        const comments = events.filter((event) => event.kind === "comment");
        const feed = element("live-comment-feed");
        const rows = comments.slice().reverse().flatMap(event => {
            const lines = chatLines[event.rarity];
            const messages = Array.from({ length: Math.min(event.count, 2) }, (_, index) => {
                const row = document.createElement("li");
                const name = document.createElement("b");
                name.textContent = viewerName(event.id, index);
                row.append(name, ` ${lines[(event.id.length + index) % lines.length]}`);
                return row;
            });
            if (event.count > messages.length) {
                const more = document.createElement("li");
                more.textContent = `另有 ${event.count - messages.length} 条回复`;
                messages.push(more);
            }
            return messages;
        });
        feed.replaceChildren(...rows.slice(0, 18));
        element("live-no-comments").hidden = rows.length > 0;
        const gifts = events.filter((event) => event.kind === "gift").slice(-8).reverse();
        const history = element("live-gift-history");
        history.replaceChildren(...gifts.map(gift => {
            const row = document.createElement("li");
            row.textContent = `${giftSource(gift)} · ${giftName(gift)} ×${gift.count} · ${gift.milli / 1000} 金币`;
            return row;
        }));
        element("live-no-gifts").hidden = gifts.length > 0;
    }
    return {
        hide: resetOverlay,
        update(id, events) {
            const resumed = liveId !== id;
            liveId = id;
            if (resumed)
                resetOverlay();
            if (!resumed && enabled()) {
                for (const event of events) {
                    if (event.kind !== "gift" || lastIds.has(event.id))
                        continue;
                    const pending = queue.find(item => item.face === event.face && item.source === event.source);
                    if (pending) {
                        pending.count += event.count;
                        pending.givers += event.givers;
                        pending.milli += event.milli;
                    }
                    else
                        queue.push({ ...event });
                }
                if (timer === undefined && queue.length)
                    animateNext();
            }
            lastIds = new Set(events.map(event => event.id));
            renderHistory(events);
        },
    };
}
