import { availableStock, candidateRemovalSealed, removalFee } from "./business.js";
import { element } from "./dom.js";
import { confirmAction } from "./confirmation.js";
import { rules } from "./generated-rules.js";
import { themeFor } from "./order-rules.js";
import { cardImage, packImage, roomButton, roomImage, roomTab, roomTabs } from "./room-ui.js";
import { describeTeachingReward } from "./teaching-rules.js";
function targetCard(order) {
    const goal = order.challenge?.goal;
    return goal?.kind === "card" ? themeFor(order.themeId)?.cards.find(card => card.id === goal.cardId) : undefined;
}
export function goalLabel(order) {
    const goal = order.challenge?.goal;
    if (!goal)
        return "";
    if (goal.kind === "heat")
        return `新增 ${goal.exactTarget ?? goal.target} 热度`;
    if (goal.kind === "count")
        return `抽到 ${goal.target} 张 ${goal.rarity} 或以上`;
    return `抽到「${targetCard(order)?.name ?? goal.cardId}」`;
}
export function challengeCardArt(order) {
    const card = targetCard(order);
    const path = card && rules.art.cards[card.id];
    if (!card || !path)
        return;
    const art = new Image();
    art.className = "challenge-card-art";
    art.src = path;
    art.alt = `目标卡面：${card.name}`;
    art.loading = "lazy";
    return art;
}
let shopFilter;
let shopSelection = rules.starter.id;
let shopPage = 0;
const shopLabels = ["晒太阳", "晚安电台", "河畔微风", "天空旅行", "星光来信", "静夜森林", "四季花语"];
const shopPackNames = ["sun", "night", "river", "sky", "post", "forest", "garden"];
const shopIcons = ["✦", "☾", "❀", "♧", "✉", "✧", "❁"];
const grades = ["N", "R", "SR", "SSR", "UR"];
export function renderMarket(profile, busy, send) {
    element("market-balance").textContent = `余额 ${profile.wallet} 金币 · 历史最高粉丝 ${profile.peakFans}`;
    const list = element("market-list");
    const render = () => {
        const tabs = roomTabs("商店主题");
        tabs.classList.add("shop-theme-tabs");
        tabs.append(roomTab("★ 全部", !shopFilter, () => { shopFilter = undefined; shopPage = 0; shopSelection = rules.themes[0].id; render(); }));
        for (const [index, theme] of rules.themes.entries()) {
            const tab = roomTab(`${shopIcons[index]} ${shopLabels[index]}`, shopFilter === theme.id, () => {
                shopFilter = shopSelection = theme.id;
                render();
            });
            tab.title = theme.name;
            tab.setAttribute("aria-label", theme.name);
            tabs.append(tab);
        }
        const items = shopFilter ? rules.themes.filter(theme => theme.id === shopFilter)
            : rules.themes.slice(shopPage * 4, shopPage * 4 + 4);
        const grid = document.createElement("div");
        grid.className = "shop-shelves";
        for (const theme of items) {
            const locked = profile.peakFans < theme.unlock_fans;
            const tile = document.createElement("article");
            tile.dataset.theme = theme.id;
            const button = roomTab("", shopSelection === theme.id, () => { shopSelection = theme.id; render(); });
            button.className = "shop-product";
            button.dataset.locked = String(locked);
            const gallery = document.createElement("span");
            gallery.className = "shop-display";
            const pack = packImage(theme.id, "shop-pack-art");
            if (pack) {
                const wrapper = document.createElement("span");
                wrapper.className = "shop-pack-wrap";
                const themeIndex = rules.themes.findIndex(entry => entry.id === theme.id);
                const packaged = new Image();
                packaged.src = `./assets/ui/shop-pack-${shopPackNames[themeIndex]}-v2.webp`;
                packaged.className = "shop-complete-pack";
                packaged.alt = `${theme.name}主题包装`;
                wrapper.append(packaged);
                gallery.append(wrapper);
            }
            for (const card of theme.cards.slice(-3)) {
                const art = cardImage(card, "shop-example");
                if (art)
                    gallery.append(art);
            }
            if (locked) {
                const lock = document.createElement("span");
                lock.className = "shop-lock";
                lock.setAttribute("aria-hidden", "true");
                const lockArt = new Image();
                lockArt.src = "./assets/ui/shop-lock-chain.webp";
                lockArt.alt = "";
                lockArt.className = "shop-lock-art";
                lock.append(lockArt);
                const gate = document.createElement("span");
                gate.textContent = `${theme.unlock_fans} 粉丝解锁`;
                lock.append(gate);
                gallery.append(lock);
            }
            if (shopSelection === theme.id) {
                const badge = document.createElement("span");
                badge.className = "shop-badge";
                badge.textContent = "精选";
                button.append(badge);
            }
            const name = document.createElement("strong");
            name.textContent = theme.name;
            const status = document.createElement("small");
            status.textContent = locked ? `${theme.unlock_fans} 粉丝解锁` : `库存 ${profile.stock[theme.id]} 包`;
            const price = document.createElement("b");
            price.innerHTML = `<span class="shop-coin" aria-hidden="true"></span>${theme.cost}`;
            button.append(gallery, name, status, price);
            tile.append(button);
            grid.append(tile);
        }
        const switcher = roomTabs("商店货架");
        switcher.classList.add("shop-page-switch");
        if (!shopFilter) {
            switcher.append(roomTab("‹ 1", shopPage === 0, () => { shopPage = 0; shopSelection = rules.themes[0].id; render(); }), roomTab("2 ›", shopPage === 1, () => { shopPage = 1; shopSelection = rules.themes[4].id; render(); }));
        }
        const theme = themeFor(shopSelection) ?? rules.themes[0];
        const locked = profile.peakFans < theme.unlock_fans;
        const detail = document.createElement("section");
        detail.className = "shop-odds lesson";
        const illustration = theme.id === rules.starter.id ? document.createElement("img") : packImage(theme.id);
        if (illustration) {
            illustration.className = "shop-odds-art";
            illustration.alt = "";
            if (theme.id === rules.starter.id)
                illustration.src = "./assets/ui/shop-odds.webp";
            else {
                illustration.dataset.pack = "";
                illustration.src = `./assets/ui/shop-pack-${shopPackNames[rules.themes.findIndex(entry => entry.id === theme.id)]}-v2.webp`;
            }
        }
        const title = document.createElement("h3");
        title.textContent = `${shopLabels[rules.themes.findIndex(entry => entry.id === theme.id)]}系列`;
        const oddsLabel = document.createElement("p");
        oddsLabel.className = "shop-odds-label";
        oddsLabel.textContent = theme.name + " · 每一次开启，都是新的心动";
        const rates = document.createElement("div");
        rates.className = "odds-rates";
        for (const [index, grade] of grades.entries()) {
            const rate = document.createElement("div");
            const amount = document.createElement("b");
            rate.className = "rarity";
            rate.dataset.rarity = grade;
            amount.textContent = `${(theme.bps[index] / 100).toFixed(2)}%`;
            rate.append(grade, amount);
            rates.append(rate);
        }
        const catalog = document.createElement("details");
        const catalogTitle = document.createElement("summary");
        catalogTitle.innerHTML = '<span>♧ 概率详情</span><span>查看全部卡牌 ›</span>';
        const cards = document.createElement("div");
        cards.className = "shop-catalog-cards";
        for (const card of theme.cards) {
            const entry = document.createElement("figure");
            const art = cardImage(card, "shop-catalog-art");
            if (art)
                entry.append(art);
            const label = document.createElement("figcaption");
            label.textContent = `${card.name} · ${card.rarity}`;
            entry.append(label);
            cards.append(entry);
        }
        catalog.append(catalogTitle, cards);
        const oddsContent = document.createElement("div");
        oddsContent.className = "shop-odds-content";
        const heading = document.createElement("div");
        heading.className = "shop-detail-heading";
        const catalogButton = roomButton("系列图鉴 ›", () => { catalog.open = !catalog.open; catalogButton.setAttribute("aria-expanded", String(catalog.open)); });
        catalogButton.className = "shop-catalog-button";
        catalogButton.setAttribute("aria-expanded", "false");
        catalog.setAttribute("id", "shop-series-catalog");
        catalogButton.setAttribute("aria-controls", "shop-series-catalog");
        catalog.ontoggle = () => catalogButton.setAttribute("aria-expanded", String(catalog.open));
        heading.append(title, catalogButton);
        const inset = document.createElement("div");
        inset.className = "shop-probability-inset";
        inset.append(catalog, rates);
        oddsContent.append(heading, oddsLabel, inset);
        if (illustration)
            detail.append(illustration);
        detail.append(oddsContent);
        const purchase = document.createElement("form");
        purchase.className = "shop-purchase lesson";
        const quantity = document.createElement("input");
        quantity.type = "number";
        quantity.min = "1";
        quantity.step = "1";
        quantity.value = "1";
        quantity.setAttribute("aria-label", `${theme.name} 购买数量`);
        quantity.disabled = locked;
        const step = (change) => {
            const value = quantity.valueAsNumber;
            quantity.value = String(Number.isSafeInteger(value) ? Math.max(1, value + change) : 1);
            updateTotal();
        };
        const less = roomButton("−", () => step(-1));
        less.setAttribute("aria-label", "减少购买数量");
        const more = roomButton("+", () => step(1));
        more.setAttribute("aria-label", "增加购买数量");
        const max = roomButton("最大", () => { quantity.value = String(Math.floor(profile.wallet / theme.cost)); updateTotal(); });
        less.disabled = more.disabled = locked;
        max.disabled = locked || profile.wallet < theme.cost;
        const buy = document.createElement("button");
        buy.className = "primary shop-buy shop-buy-one";
        const buyTen = roomButton("购买 10 包", () => send({ type: "buy", revision: profile.revision, themeId: theme.id, quantity: 10 }));
        buyTen.className = "quiet shop-buy shop-buy-ten";
        buyTen.innerHTML = `<span>购买 10 包</span><small><i class="shop-coin" aria-hidden="true"></i>${theme.cost * 10}</small>`;
        buyTen.disabled = locked || busy || profile.wallet < 10 * theme.cost;
        const cost = document.createElement("output");
        function updateTotal() {
            const value = quantity.valueAsNumber;
            const amount = value * theme.cost;
            const valid = Number.isSafeInteger(value) && value > 0 && Number.isSafeInteger(amount);
            buy.replaceChildren();
            const label = document.createElement("span");
            label.textContent = valid ? `购买 ${value} 包` : "购买";
            const price = document.createElement("small");
            price.textContent = valid ? `◉ ${amount}` : "—";
            buy.append(label, price);
            buy.disabled = locked || busy || !valid || amount > profile.wallet;
            cost.value = locked ? `历史粉丝 ${theme.unlock_fans} 解锁` : !valid ? "请输入正整数"
                : `合计 ${amount} 金币${amount > profile.wallet ? " · 金币不足" : ""}`;
        }
        updateTotal();
        quantity.oninput = updateTotal;
        purchase.onsubmit = event => {
            event.preventDefault();
            if (!buy.disabled)
                send({ type: "buy", revision: profile.revision, themeId: theme.id, quantity: quantity.valueAsNumber });
        };
        const controls = document.createElement("div");
        controls.className = "shop-quantity";
        const quantityLabel = document.createElement("label");
        quantityLabel.textContent = "购买数量";
        quantityLabel.htmlFor = "shop-quantity-input";
        quantity.id = "shop-quantity-input";
        controls.append(quantityLabel, less, quantity, more, max);
        purchase.append(controls, buy, buyTen, cost);
        const navigation = document.createElement("div");
        navigation.className = "shop-navigation";
        const previousThemes = roomButton("‹", () => tabs.scrollBy({ left: -tabs.clientWidth * .7, behavior: "smooth" }));
        previousThemes.setAttribute("aria-label", "查看前面的主题");
        const nextThemes = roomButton("›", () => tabs.scrollBy({ left: tabs.clientWidth * .7, behavior: "smooth" }));
        nextThemes.setAttribute("aria-label", "查看后面的主题");
        previousThemes.className = nextThemes.className = "shop-theme-arrow";
        const updateThemeArrows = () => {
            previousThemes.disabled = tabs.scrollLeft <= 1;
            nextThemes.disabled = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 1;
        };
        tabs.onscroll = updateThemeArrows;
        requestAnimationFrame(updateThemeArrows);
        navigation.append(previousThemes, tabs, nextThemes, switcher);
        list.replaceChildren(navigation, grid, detail, purchase);
    };
    render();
}
const coinIcon = "./assets/ui/summary-metric-coins-v2.webp";
const giftIcon = "./assets/ui/live-r7/reward-glasses.webp";
const fineIcon = "./assets/ui/live-orders/red-envelope.webp";
let candidateLiveId;
let selectedCandidate;
function candidateMetric(label, amount, icon, unit) {
    const line = document.createElement("span");
    line.className = "candidate-metric";
    const caption = document.createElement("span");
    caption.textContent = label;
    const value = document.createElement("strong");
    value.textContent = String(amount);
    if (icon)
        value.prepend(roomImage(icon, "", unit));
    line.append(caption, value);
    return line;
}
function candidateCard(order, available) {
    const row = document.createElement("article");
    row.dataset.order = order.id;
    const face = document.createElement("button");
    face.type = "button";
    face.className = "candidate-card";
    face.dataset.tier = String(order.challenge?.band ?? 0);
    const body = document.createElement("span");
    body.className = "candidate-face";
    const banner = document.createElement("span");
    banner.className = "candidate-banner";
    const cover = packImage(order.themeId, "candidate-cover");
    if (cover)
        banner.append(cover);
    const band = order.challenge?.band;
    if (band !== undefined) {
        const stars = document.createElement("span");
        stars.className = "candidate-stars";
        stars.setAttribute("aria-hidden", "true");
        for (let i = 0; i <= band; i++) {
            const star = document.createElement("span");
            star.className = "candidate-star";
            stars.append(star);
        }
        const description = document.createElement("span");
        description.className = "candidate-visually-hidden";
        description.textContent = `难度 ${band + 1} 星`;
        banner.append(description, stars);
    }
    const tick = document.createElement("span");
    tick.className = "candidate-tick";
    tick.textContent = "✓";
    tick.setAttribute("aria-hidden", "true");
    banner.append(tick);
    const pack = document.createElement("span");
    pack.className = "candidate-pack";
    const name = themeFor(order.themeId).name;
    pack.textContent = `${name.split("·").pop()} · 拆 ${order.quantity} 包`;
    const goal = document.createElement("strong");
    goal.className = "candidate-goal";
    goal.textContent = goalLabel(order) || "完成订单并发货";
    const terms = document.createElement("span");
    terms.className = "candidate-terms";
    terms.append(order.selfOpen ? candidateMetric("卡牌", "归你") : candidateMetric("货款", order.payment, coinIcon, "金币"));
    if (order.challenge) {
        const success = candidateMetric("成功", `×${order.challenge.glasses}`, giftIcon, "墨镜");
        const failure = candidateMetric("失败", order.challenge.fine, fineIcon, "金币红包");
        failure.classList.add("candidate-failure");
        terms.append(success, failure);
    }
    if (available < order.quantity) {
        const flag = document.createElement("span");
        flag.className = "candidate-stock-flag";
        flag.textContent = `库存不足 · 余 ${available} 包`;
        terms.append(flag);
    }
    body.append(banner, pack, goal, terms);
    face.append(body);
    row.append(face);
    return row;
}
function showCandidateRisk(order, profile) {
    const dialog = element("candidate-risk-dialog");
    const body = element("candidate-risk-body");
    const stock = document.createElement("p");
    stock.textContent = `${themeFor(order.themeId).name} · 需拆 ${order.quantity} 包 · 可用 ${availableStock(profile, order.themeId)} 包`;
    body.replaceChildren(stock);
    const contract = order.challenge;
    if (contract) {
        const percent = (p) => `${(p * 100).toFixed(1)}%`;
        const heading = document.createElement("p");
        heading.textContent = goalLabel(order);
        const tools = contract.tools.map(tool => {
            const label = describeTeachingReward({ kind: "coupon", id: "", key: tool.key, rarity: tool.rarity }).replace(" ×1", "");
            return `${label} ${tool.expected.toFixed(2)} 张`;
        }).join("、");
        const range = contract.range ? `（${percent(contract.range[0])}–${percent(contract.range[1])}）` : "";
        const estimate = document.createElement("p");
        estimate.textContent = `最近一轮预估：不用券 ${percent(contract.without)} · 按策略 ${percent(contract.withTools)}${range} · ${tools || "预计不用券"}`;
        const balance = document.createElement("p");
        balance.textContent = `余额 ${profile.wallet} 金币 · 失败需付 ${contract.fine} 金币红包` +
            (profile.wallet + order.payment < contract.fine ? " · 届时付不起将强制下播、退回礼物并掉粉。" : "。");
        body.append(heading, estimate, balance);
        const art = challengeCardArt(order);
        if (art)
            body.append(art);
    }
    dialog.onclose = () => document.dispatchEvent(new Event("game:modalchange"));
    dialog.showModal();
    document.dispatchEvent(new Event("game:modalchange"));
}
export function renderCandidates(profile, busy, send) {
    const { live } = profile;
    const panel = element("candidate-panel");
    panel.hidden = !live || !!live.report;
    if (!live || live.report) {
        selectedCandidate = candidateLiveId = undefined;
        return;
    }
    const list = element("candidate-list");
    const sameLive = candidateLiveId === live.id;
    const left = sameLive ? list.scrollLeft : 0;
    const restoreFocus = list.contains(document.activeElement);
    const oldIndex = Array.from(list.children).findIndex(row => row.dataset.order === selectedCandidate);
    const orders = live.candidates;
    const kept = sameLive && orders.find(order => order.id === selectedCandidate);
    const firstAvailable = orders.find(order => availableStock(profile, order.themeId) >= order.quantity);
    const selected = kept || (sameLive && oldIndex >= 0 ? orders[Math.min(oldIndex, orders.length - 1)] : firstAvailable || orders[0]);
    selectedCandidate = selected?.id;
    candidateLiveId = live.id;
    const count = element("candidate-count");
    if (count.textContent !== String(orders.length))
        count.textContent = String(orders.length);
    const message = element("candidate-message");
    const sealed = candidateRemovalSealed(live);
    message.textContent = sealed ? "最后一包已结算，请完成本单后再移除其他候选。" : live.task
        ? "当前任务完成后可接下一单。" : firstAvailable ? "" :
        totalAvailableMessage(profile, orders.length);
    message.hidden = !message.textContent;
    const accept = element("candidate-accept");
    const remove = element("candidate-remove");
    const risk = element("candidate-risk");
    const rows = orders.map(order => candidateCard(order, availableStock(profile, order.themeId)));
    function select(order) {
        selectedCandidate = order?.id;
        for (const row of rows)
            row.firstElementChild.setAttribute("aria-pressed", String(row.dataset.order === selectedCandidate));
        panel.querySelector(".candidate-actions").hidden = !order;
        risk.hidden = !order;
        if (!order)
            return;
        const enough = availableStock(profile, order.themeId) >= order.quantity;
        accept.textContent = !enough ? "库存不足" : order.selfOpen ? "接挑战" : "接单";
        accept.disabled = busy || !!live?.task || !enough;
        accept.onclick = () => send({ type: "accept", revision: profile.revision, id: order.id });
        const fee = removalFee(order);
        remove.replaceChildren("移除", roomImage(coinIcon, "", "金币"), String(fee));
        const reason = orders.length <= 1 ? "至少保留一条挑战订单" : profile.wallet < fee ? `余额少 ${fee - profile.wallet} 金币` : "";
        remove.title = reason || `移除需发 ${fee} 金币红包`;
        remove.setAttribute("aria-label", `移除，${fee} 金币${reason ? `，${reason}` : ""}`);
        remove.disabled = busy || sealed || !!reason;
        remove.onclick = async () => {
            if (await confirmAction("移除挑战订单", `发 ${fee} 金币红包移除这条候选？`, "发红包并移除")) {
                send({ type: "remove", revision: profile.revision, id: order.id, seed: crypto.getRandomValues(new Uint32Array(1))[0] });
            }
        };
        risk.onclick = () => showCandidateRisk(order, profile);
    }
    for (const [index, row] of rows.entries()) {
        row.firstElementChild.onclick = () => select(orders[index]);
    }
    list.replaceChildren(...rows);
    list.scrollLeft = left;
    list.hidden = orders.length === 0;
    select(selected);
    const chosen = rows.find(row => row.dataset.order === selectedCandidate)?.firstElementChild;
    if (restoreFocus)
        chosen?.focus({ preventScroll: true });
    if (!kept && chosen && list.clientWidth)
        chosen.scrollIntoView({ block: "nearest", inline: "nearest" });
    const previous = element("candidate-prev");
    const next = element("candidate-next");
    previous.parentElement.hidden = orders.length <= 3;
    const updateArrows = () => {
        previous.disabled = list.scrollLeft < 2;
        next.disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
    };
    const step = (direction) => list.scrollBy({
        left: direction * list.clientWidth,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
    previous.onclick = () => step(-1);
    next.onclick = () => step(1);
    list.onscroll = updateArrows;
    requestAnimationFrame(updateArrows);
}
function totalAvailableMessage(profile, count) {
    if (rules.themes.every(theme => profile.stock[theme.id] === 0))
        return "本场卡包已拆完，可从顶部下播。";
    return count ? "当前候选库存不足，可从顶部下播。" : "暂时没有挑战订单，可从顶部下播。";
}
