import { availableStock, candidateRemovalSealed, removalFee } from "../js/business.js";
import { element } from "../js/dom.js";
import { confirmAction } from "./confirmation.js";
import { rules } from "../js/generated-rules.js";
import { themeFor } from "../js/order-rules.js";
import { cardImage, packImage, roomButton, roomTab, roomTabs } from "../js/room-ui.js";
import { describeTeachingReward } from "../js/teaching-rules.js";
function targetCard(order) {
    const goal = order.challenge?.goal;
    return goal?.kind === "card" ? themeFor(order.themeId)?.cards.find(card => card.id === goal.cardId) : undefined;
}
export function goalLabel(order) {
    const goal = order.challenge?.goal;
    if (!goal)
        return "";
    if (goal.kind === "heat")
        return `新增热度达到 ${goal.exactTarget ?? goal.target}`;
    if (goal.kind === "count")
        return `抽出 ${goal.target} 张 ${goal.rarity} 或以上`;
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
export function renderCandidates(profile, busy, send) {
    const live = profile.live;
    const panel = element("candidate-panel");
    panel.hidden = !live || !!live.report;
    if (!live || live.report)
        return;
    const hasAvailable = live.candidates.some(order => availableStock(profile, order.themeId) >= order.quantity);
    const sealed = candidateRemovalSealed(live);
    element("candidate-message").textContent = sealed ? "最后一包已结算，请完成本单后再移除其他候选。"
        : live.task ? "当前任务需先结算，拆卡期间可发红包移除其他候选。"
            : hasAvailable ? "接单后预留对应主题的全部所需卡包。"
                : "当前没有可接订单，可以直接下播。";
    element("candidate-list").replaceChildren(...live.candidates.map(order => {
        const row = document.createElement("article");
        row.className = "shop-row";
        row.dataset.order = order.id;
        const title = document.createElement("h3");
        const kind = order.selfOpen ? "自拆挑战" : order.challenge ? "附挑战订单" : "纯订单";
        row.dataset.kind = order.selfOpen ? "self" : order.challenge ? "challenge" : "order";
        title.textContent = `${kind} · ${themeFor(order.themeId).name}`;
        const details = document.createElement("p");
        const available = availableStock(profile, order.themeId);
        const payout = order.selfOpen ? "卡牌归你" : `发货得 ${order.payment} 金币`;
        details.textContent = `需要 ${order.quantity} 包 · 可用 ${available} 包 · ${payout}`;
        const contract = order.challenge;
        if (contract) {
            const conditions = document.createElement("p");
            conditions.textContent = `${["低", "中", "高"][contract.band]}难度 · ${goalLabel(order)} · 成功 ${contract.glasses} 个墨镜 · 失败红包 ${contract.fine} 金币`;
            const estimate = document.createElement("p");
            const percent = (p) => `${(p * 100).toFixed(1)}%`;
            const tools = contract.tools.map(tool => {
                const label = describeTeachingReward({ kind: "coupon", id: "", key: tool.key, rarity: tool.rarity }).replace(" ×1", "");
                return `${label} ${tool.expected.toFixed(2)} 张`;
            }).join("、");
            const range = contract.range ? `（${percent(contract.range[0])}–${percent(contract.range[1])}）` : "";
            estimate.textContent = `最近一轮预估：不用券 ${percent(contract.without)} · 按策略 ${percent(contract.withTools)}${range} · ${tools || "预计不用券"}`;
            row.append(title, details);
            const art = challengeCardArt(order);
            if (art)
                conditions.prepend(art);
            conditions.className = "challenge-condition";
            row.append(conditions, estimate);
        }
        const actions = document.createElement("div");
        actions.className = "shop-controls";
        const accept = document.createElement("button");
        accept.className = "quiet";
        accept.textContent = available >= order.quantity ? (order.selfOpen ? "接挑战" : "接单") : "库存不足";
        accept.disabled = busy || !!live.task || available < order.quantity;
        accept.onclick = () => send({ type: "accept", revision: profile.revision, id: order.id });
        const remove = document.createElement("button");
        remove.className = "quiet";
        const fee = removalFee(order);
        remove.textContent = `移除 · ${fee} 金币`;
        remove.disabled = busy || sealed || live.candidates.length <= 1 || profile.wallet < fee;
        remove.onclick = async () => {
            if (await confirmAction("移除候选", `发 ${fee} 金币红包移除这条候选？`, "发红包并移除")) {
                send({ type: "remove", revision: profile.revision, id: order.id, seed: crypto.getRandomValues(new Uint32Array(1))[0] });
            }
        };
        actions.append(accept, remove);
        if (!contract)
            row.append(title, details);
        row.append(actions);
        return row;
    }));
}
