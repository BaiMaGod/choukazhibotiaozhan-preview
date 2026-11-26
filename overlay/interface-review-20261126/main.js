import { createPackPresentation, nextRevealSlot } from "../js/pack-presentation.js";
import { createCardView, decorateResult, attachCardTilt, prepareCardVisual, warmCardVisual } from "../js/pack-fx/card-view.js";
import { cardVisual, pouchArt, cardBackArt } from "../js/pack-fx/resources.js";
import { RARITIES, effectiveRarity, visibleCards } from "../js/pack.js";
import { defaultSettings, readSettings, reachesPause } from "../js/controls.js";
import { DeviceClock } from "../js/clock.js";
import { TapCloud, PlatformFailure, currentTap, openShare, playRewardedAd, playRewardedShare, probeShare, supportsShareRewards } from "../js/taptap.js";
import { openPackStore, transactPack, transactTeaching } from "../js/save.js";
import { rules } from "../js/generated-rules.js";
import { beijingDay, teachingView } from "../js/teaching.js";
import { describeTeachingReward, teachingOrder, teachingRarities } from "../js/teaching-rules.js";
import { challengeProgress, openingAudience, recentRareCards } from "../js/business.js";
import { drawOddsStages, themeFor, totalStock } from "../js/order-rules.js";
import { createScene } from "../js/scene.js";
import { element } from "../js/dom.js";
import { challengeCardArt, goalLabel, renderCandidates, renderMarket } from "../js/business-ui.js";
import { rewardAllowed, rewardValid } from "../js/rewards.js";
import { renderTalentTree } from "../js/talent-ui.js";
import { hasSet, signInAmounts } from "../js/growth.js";
import { cardImage, installPageHud, packImage, roomButton, roomTab, roomTabs } from "../js/room-ui.js";
import { canUpgrade, finalCards, guaranteeFor, heldCoupons } from "../js/challenges.js";
import { installLiveDrawer } from "../js/live-layout.js";
const shell = document.querySelector(".shell");
const liveDrawer = installLiveDrawer(shell, () => scheduleAuto());
const liveInteractionTabs = Array.from(document.querySelectorAll(".live-interaction-tabs button"));
function showScreen(screen) {
    if (shell.dataset.screen !== screen) {
        liveDrawer.close();
        if (screen === "home" || screen === "summary")
            presentation.clear();
        shell.dataset.screen = screen;
        shell.scrollTop = 0;
        const autoButton = element("auto-pack");
        if (screen === "live") {
            element("live-auto-anchor").append(autoButton);
            selectLiveInteraction(liveInteractionTabs[0]);
        }
        else {
            element("pause-play").before(autoButton);
            element("gift-banner").hidden = true;
        }
    }
    element("scene-title").textContent = {
        home: "抽卡直播间", live: "抽卡直播间", summary: "本场直播\n圆满结束", free: "局外自由拆卡", demo: "拆卡试玩",
    }[screen];
    element("scene-subtitle").textContent = {
        home: "✦ 挑战每张都是 SSR ✦", live: "✦ 挑战每张都是 SSR ✦", summary: "✦ 感谢每一次陪伴 ✦",
        free: "✦ 随时享受拆卡乐趣 ✦", demo: "",
    }[screen];
    instruction.hidden = screen === "home";
    const platform = element("platform-status");
    const panel = screen === "home" ? homeBenefits : shell;
    if (platform.parentElement !== panel)
        panel.append(platform);
    element("live-hud").hidden = screen !== "live";
    element("live-interactions").hidden = screen !== "live";
    element("live-tools-bar").hidden = screen !== "live";
    element("live-pack-overview").hidden = screen !== "live";
    element("live-auto-anchor").hidden = screen !== "live";
}
const primary = element("primary");
const skip = element("skip");
const sound = element("sound");
const gesture = element("gesture");
const slots = Array.from(element("slots").children);
const tools = element("tools");
const options = element("upgrade-options");
const settlement = element("settlement");
const rewards = element("rewards");
const instruction = element("instruction");
const errorPanel = element("error");
const startConfirm = element("start-confirm");
const checkInMenu = element("home-check-in");
const dailyMenu = element("home-daily");
const homeBenefits = element("home-benefits");
const requireCloud = rules.platform.requireCloud;
const isDemo = !requireCloud && new URLSearchParams(location.search).get("demo") === "1";
let cloud;
const deviceClock = new DeviceClock(Date.now(), performance.now());
function gameNow() {
    const clock = deviceClock.read(Date.now(), performance.now());
    const warning = element("clock-warning");
    warning.hidden = !clock.unstable;
    return clock.now;
}
let db;
let scene;
let pack = null;
let teaching;
let canTear = false;
let nextTeachingPreview = false;
let busy = false;
let ready = false;
let audio;
let settings = { ...defaultSettings };
try {
    settings = readSettings(localStorage);
}
catch { /* Use session defaults. */ }
const pauseMenu = element("play-pause");
const settingsMenu = element("play-settings");
const oddsMenu = element("odds-dialog");
const archiveMenu = element("archive-dialog");
const cardDetails = element("card-detail");
let auto = false;
let autoTimer = 0;
const presentation = createPackPresentation(element("pack-table"), {
    onOpen: () => { if (ready && canTear && !busy)
        open();
    else
        presentation.failOpen(); },
    audio: { context: () => audio, enabled: () => settings.packSound },
    onSound: (kind, rarity) => playSound(kind, rarity),
    card: (url, rarity) => {
        const id = Object.entries(rules.art.cards).find(([, path]) => path === url)?.[0];
        const def = id && rules.themes.flatMap(theme => [...theme.cards]).find(card => card.id === id);
        return cardVisual(url, rarity, id, def ? def.name : undefined);
    },
});
let clearDetailTilt;
let revealDue = 0;
let musicTimer = 0;
let musicIndex = 0;
function updateSoundButton() {
    const on = settings.packSound || settings.rewardSound;
    sound.textContent = on ? "音效开" : "音效关";
    sound.setAttribute("aria-pressed", String(on));
    sound.setAttribute("aria-label", sound.textContent);
}
function unlockSound() {
    if (!(settings.packSound || settings.rewardSound || settings.music) || !window.AudioContext)
        return;
    try {
        audio ?? (audio = new AudioContext());
        if (audio.state === "suspended")
            void audio.resume().catch(() => { });
    }
    catch { /* Playback availability does not affect the save transaction. */ }
}
function playNotes(notes, gain, length, type = "sine") {
    if (!audio || audio.state !== "running")
        return;
    const context = audio;
    notes.forEach((pitch, index) => {
        const oscillator = context.createOscillator();
        const volume = context.createGain();
        const start = context.currentTime + index * .055;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(pitch, start);
        volume.gain.setValueAtTime(.001, start);
        volume.gain.linearRampToValueAtTime(gain, start + .016);
        volume.gain.exponentialRampToValueAtTime(.001, start + length - .01);
        oscillator.connect(volume).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + length);
        oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
    });
}
function playSound(action, rarity) {
    const rare = rarity !== undefined && RARITIES.indexOf(rarity) >= 2;
    if (settings.vibration && (rare || action === "open") && typeof navigator.vibrate === "function") {
        try {
            navigator.vibrate(rare ? 22 : 10);
        }
        catch { /* Vibration is optional. */ }
    }
    if (!(rare || action === "gift" ? settings.rewardSound : settings.packSound))
        return;
    const pitches = { N: [392], R: [440], SR: [523, 659], SSR: [523, 659, 784], UR: [523, 659, 784, 1047] };
    playNotes(rarity ? pitches[rarity] : action === "open" ? [220, 177] : [440, 587], .11, .2, action === "open" ? "triangle" : "sine");
}
function syncMusic() {
    clearInterval(musicTimer);
    musicTimer = 0;
    if (!settings.music || document.hidden || !ready)
        return;
    const melody = [261.63, 329.63, 392, 440, 392, 329.63, 293.66, 349.23];
    musicTimer = window.setInterval(() => playNotes([melody[musicIndex++ % melody.length]], .032, .85), 720);
}
function saveSettings() {
    try {
        localStorage.setItem("ssr-live-settings-v1", JSON.stringify(settings));
    }
    catch { /* Session settings still apply. */ }
    updateSoundButton();
    unlockSound();
    syncMusic();
}
function renderPack(currentPack, settled, openable, focusSlot, themeId = rules.starter.id) {
    // A completed previous pack is not the unopened next pack.
    if (openable) {
        currentPack = null;
        settled = false;
    }
    const cards = visibleCards(currentPack);
    const current = cards[focusSlot ?? cards.length - 1];
    const art = element("approved-art");
    const url = current ? rules.art.cards[current.id]
        : currentPack ? undefined : rules.art.packs[themeId];
    art.classList.toggle("card-grade-frame", !!current);
    art.dataset.rarity = current?.rarity ?? "";
    art.style.removeProperty("--tear");
    art.onload = () => {
        if (art.hidden || art.getAttribute("src") !== url)
            return;
        scene.draw(current?.rarity, !!currentPack, 0, true);
    };
    art.onerror = () => {
        if (art.getAttribute("src") !== url)
            return;
        art.hidden = true;
        scene.draw(current?.rarity, !!currentPack);
    };
    art.hidden = !url;
    if (url && art.getAttribute("src") !== url)
        art.src = url;
    scene.draw(current?.rarity, !!currentPack, 0, !!currentPack || (!!url && art.complete && art.naturalWidth > 0));
    element("pack-state").textContent = settled ? "已结算" : currentPack ? `已揭 ${currentPack.revealed} / 5` : "未拆封";
    const rarity = element("rarity");
    rarity.hidden = !current;
    rarity.textContent = current?.rarity ?? "";
    rarity.dataset.rarity = current?.rarity ?? "";
    element("card-name").textContent = current?.name ?? (currentPack ? "依次翻开 5 张卡" : themeFor(themeId)?.name ?? "卡包");
    const table = element("pack-table");
    let seal = table.querySelector(".pack-seal");
    if (!seal) {
        seal = document.createElement("img");
        seal.className = "pack-seal";
        seal.alt = "";
        table.append(seal);
    }
    seal.hidden = !!currentPack || !url;
    if (url && !currentPack && seal.getAttribute("src") !== url)
        seal.src = url;
    table.style.removeProperty("--rip-progress");
    table.dataset.packState = !currentPack ? "sealed" : cards.length ? "revealed" : "open";
    const featuredSlot = cards.reduce((last, card, index) => {
        const featured = last < 0 ? undefined : cards[last].rarity;
        return card.rarity === "UR" || (card.rarity === "SSR" && featured !== "UR") ? index : last;
    }, -1);
    const sticker = element("live-rarity-sticker");
    const showLiveRare = shell.dataset.screen === "live" && featuredSlot >= 0;
    table.toggleAttribute("data-live-rare", showLiveRare);
    table.style.setProperty("--rare-slot", String(featuredSlot));
    table.dataset.liveRareSlot = String(featuredSlot);
    sticker.hidden = !showLiveRare;
    const rarityLabel = document.createElement("span");
    rarityLabel.textContent = featuredSlot < 0 ? "" : `${cards[featuredSlot].rarity}!`;
    sticker.replaceChildren(rarityLabel);
    slots.forEach((slot, index) => {
        const card = cards[index];
        slot.dataset.rarity = card?.rarity ?? "";
        slot.toggleAttribute("data-featured", index === featuredSlot);
        slot.querySelector("strong").textContent = card?.rarity ?? "?";
        if (slot.dataset.card !== (card?.id ?? "")) {
            slot.dataset.card = card?.id ?? "";
            slot.querySelector("img")?.remove();
            if (card) {
                const face = cardImage(card);
                if (face)
                    slot.prepend(face);
            }
        }
        slot.setAttribute("aria-label", card ? `第 ${index + 1} 张，${card.name}，${card.rarity}` : `第 ${index + 1} 张，未揭晓`);
    });
    slots.forEach(decorateResult);
    canTear = openable && !busy;
    presentation.syncSealed(!currentPack && url ? pouchArt(url) : undefined, themeId, canTear);
    gesture.textContent = canTear ? "← 滑动撕开封口 →" : "";
    gesture.setAttribute("aria-label", "横向滑动卡包封口");
    gesture.dataset.enabled = String(canTear);
}
function render(focusSlot) {
    renderPack(pack, !!pack?.rewards, !pack, focusSlot);
    const choosing = pack?.revealed === 5 && !pack.rewards;
    tools.hidden = !choosing;
    element("tool-title").textContent = "本包道具";
    options.replaceChildren();
    if (choosing && pack) {
        const currentPack = pack;
        const used = currentPack.upgraded !== null;
        element("coupon-count").textContent = used ? "升品券已使用" : "SSR 升品券 ×1";
        if (!used) {
            currentPack.cards.slice(0, 3).forEach((card, slot) => {
                const button = document.createElement("button");
                const grade = document.createElement("b");
                button.type = "button";
                grade.textContent = `${card.rarity} → ${effectiveRarity(card, true)}`;
                button.append(grade, card.name);
                button.onclick = () => void commit({ type: "upgrade", id: currentPack.id, slot });
                options.append(button);
            });
        }
    }
    settlement.hidden = !pack?.rewards;
    rewards.replaceChildren();
    if (pack?.rewards) {
        element("reward-count").textContent = `${pack.rewards.length} 份`;
        for (const reward of pack.rewards) {
            const item = document.createElement("li");
            item.className = "rarity";
            item.dataset.rarity = reward.rarity;
            item.dataset.rewardId = reward.id;
            item.textContent = reward.name;
            rewards.append(item);
        }
    }
    primary.disabled = busy;
    if (!pack) {
        primary.textContent = "滑动顶部封口";
        instruction.textContent = "在卡包顶部横向滑动，撕开封口后自动翻卡。";
    }
    else if (pack.rewards) {
        primary.textContent = "再试一次";
        instruction.textContent = "本包结算已保存。可重新开始一包固定示例。";
    }
    else if (choosing) {
        primary.textContent = pack.upgraded === null ? "不使用道具" : "完成使用";
        instruction.textContent = pack.upgraded === null ? "可用一张升品券，选择一张卡升一级。确认后按最终品级发奖。" : "升品已保存。点「完成使用」后发放本包奖励。";
    }
    else {
        primary.textContent = `自动翻卡 ${pack.revealed} / 5`;
        instruction.textContent = "揭完全部 5 张后进入道具阶段。";
    }
}
function showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    element("error-message").textContent = message;
    errorPanel.hidden = false;
}
async function commit(action) {
    if (busy || !ready)
        return;
    unlockSound();
    busy = true;
    primary.disabled = true;
    gesture.dataset.enabled = "false";
    errorPanel.hidden = true;
    const previous = pack;
    clearTimeout(autoTimer);
    try {
        pack = await transactPack(db, action);
        const samePack = previous?.id === pack?.id;
        const revealed = samePack && action.type === "reveal" && (pack?.revealed ?? 0) > (previous?.revealed ?? 0);
        const upgraded = samePack && action.type === "upgrade" && previous?.upgraded === null && pack?.upgraded === action.slot;
        const shown = visibleCards(pack);
        const rarity = revealed ? shown[shown.length - 1]?.rarity : undefined;
        scene.stopUr();
        busy = false;
        render(upgraded ? action.slot : undefined);
        await presentPack(previous, pack, action.type === "open", rarity);
        scheduleAuto();
        if (upgraded || (!previous?.rewards && pack?.rewards)) {
            playSound(action.type, rarity);
        }
    }
    catch (error) {
        busy = false;
        presentation.failOpen();
        render();
        showError(error);
    }
}
function open(tool) {
    if (isDemo)
        return void commit({ type: "open", id: crypto.randomUUID() });
    const business = teaching.business;
    const seed = newSeed();
    if (business?.free)
        return sendBusiness({ type: "open-free", revision: business.revision, seed });
    if (business)
        return sendBusiness({ type: "open-order-pack", revision: business.revision, seed, tool });
    const broadcast = teaching.broadcast;
    if (broadcast) {
        nextTeachingPreview = false;
        void commitTeaching({ type: "open", broadcastId: broadcast.id, index: broadcast.packs.length, seed });
    }
}
primary.onclick = () => {
    if (canTear) {
        instruction.textContent = "请在卡包顶部横向滑动撕开封口。";
        return;
    }
    if (busy || nextRevealSlot(isDemo ? pack : currentGamePack()) !== null)
        return;
    if (!isDemo && !teaching.business) {
        const view = teachingView(teaching);
        if (view.phase === "live" && !view.shipment && view.pack?.settledAt != null &&
            view.completed < teachingRarities.length && view.completed === view.opened) {
            nextTeachingPreview = true;
            renderTeaching();
            return;
        }
    }
    if (!isDemo)
        return teaching.business ? businessPrimary(teaching.business) : teachingPrimary();
    if (!pack)
        return;
    if (pack.rewards)
        return void commit({ type: "reset", id: pack.id });
    if (pack.revealed === 5)
        return void commit({ type: "finish", id: pack.id });
    void commit({ type: "reveal", id: pack.id, slot: pack.revealed });
};
function gold(milli) {
    return `${milli / 1000} 金币`;
}
function renderStamina(now) {
    const { current, nextRecoveryAt } = teaching.stamina;
    const display = element("stamina");
    display.textContent = `${current}/${rules.stamina.max}`;
    if (nextRecoveryAt === null)
        return;
    const seconds = Math.max(0, Math.ceil((nextRecoveryAt - now) / 1000));
    const countdown = document.createElement("small");
    countdown.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    display.append(countdown);
}
function renderTeaching() {
    if (teaching.business) {
        renderBusiness(teaching.business);
        refreshPlayControls();
        return;
    }
    const view = teachingView(teaching);
    const live = view.phase === "live";
    const summary = view.phase === "summary";
    showScreen(summary ? "summary" : live ? "live" : "home");
    for (const id of ["open-shop", "open-talents", "open-collection", "open-free", "open-check-in", "open-daily", "open-benefits"]) {
        element(id).disabled = true;
    }
    element("restart-live").hidden = !summary;
    element("restart-live").disabled = teaching.stamina.current < rules.stamina.spend;
    element("live-heat").textContent = `热度 ${view.heat}`;
    element("live-audience").textContent = `在线 ${view.online}`;
    if (live) {
        const packs = teaching.broadcast?.packs ?? [];
        const visits = packs.reduce((sum, pack) => sum + (pack.settledAt ? pack.interaction.visitors : 0), 0);
        renderLiveInteraction(view.comments, visits, view.fans, view.giftCount, view.giftGrossMilli, view.online, String(view.heat), packs.flatMap(pack => visibleCards(pack)));
        renderLivePackOverview(rules.starter.id, `${view.completed} / ${teachingRarities.length} 包已结算`, view.completed, teachingRarities.length);
        const progress = element("lesson-pack-progress");
        progress.max = teachingRarities.length;
        progress.value = view.completed;
        element("lesson-progress-number").textContent = `${view.completed} / ${teachingRarities.length}`;
        const rewardLabel = document.createElement("span");
        rewardLabel.textContent = "达标：";
        const rewardArt = document.createElement("img");
        rewardArt.src = "./assets/ui/live-r7/reward-glasses.webp";
        rewardArt.alt = "墨镜";
        const rewardCount = document.createElement("strong");
        rewardCount.textContent = `墨镜×${teachingOrder.mainGift}`;
        const rewardBonus = document.createElement("small");
        rewardBonus.textContent = `超额 +${teachingOrder.bonusGift}`;
        element("lesson-order-reward").replaceChildren(rewardLabel, rewardArt, rewardCount, rewardBonus);
        const art = element("lesson-pack-art");
        const url = rules.art.packs[rules.starter.id];
        art.hidden = !url;
        if (url && art.getAttribute("src") !== url)
            art.src = url;
    }
    element("live-shipment-display").hidden = !live || !view.shipment;
    if (view.shipment) {
        element("shipment-pack-art").src = rules.art.packs[rules.starter.id];
        element("shipment-copy").textContent = `货款 ${teachingOrder.saleGold} 金币已到账 · 可查看账单后下播`;
        element("live-receipt-art").src = rules.art.packs[rules.starter.id];
        element("live-receipt-summary").textContent = `货款 ${teachingOrder.saleGold} 金币已到账`;
    }
    const inPack = live && !view.shipment;
    const settledPack = view.pack?.settledAt != null;
    const readyToOpen = inPack && view.completed < teachingRarities.length && view.completed === view.opened;
    element("profile").hidden = false;
    element("coins").textContent = String(view.wallet);
    element("inventory").textContent = `${view.inventory} 包`;
    element("fans").textContent = String(view.fans);
    renderStamina(gameNow());
    element("mode-label").textContent = view.phase === "home" ? "直播准备" : summary ? "本场回顾" : "首次教学";
    element("edition").textContent = live ? `${view.completed} / 3 包` : "";
    element("lesson").hidden = !live || !!view.shipment;
    element("lesson-progress").textContent = `${view.completed} / 3 包已结算`;
    element("lesson-terms").textContent = `达标送 ${teachingOrder.mainGift} 个墨镜，超额加 ${teachingOrder.bonusGift} 个。失败红包 ${teachingOrder.failureGold} 金币。`;
    element("lesson-main-goal").textContent = `SSR+ ${view.mainReached ? "已达成" : "待达成"}`;
    element("lesson-main-goal").toggleAttribute("data-reached", view.mainReached);
    element("lesson-bonus-goal").textContent = `UR ${view.bonusReached ? "已达成" : "待达成"}`;
    element("lesson-bonus-goal").toggleAttribute("data-reached", view.bonusReached);
    element("live-stats").textContent = `预留 ${view.reserved} 包 · 待发货 ${teachingOrder.saleGold} 金币`;
    element("pack-table").hidden = !inPack;
    element("slots").hidden = !inPack;
    tools.hidden = true;
    renderPack(inPack ? view.pack : null, settledPack, readyToOpen && (!view.pack || nextTeachingPreview));
    element("pack-title").textContent = `教学第 ${Math.max(1, view.opened + Number(nextTeachingPreview))} 包`;
    settlement.hidden = !inPack || !settledPack || nextTeachingPreview;
    rewards.replaceChildren();
    if (!settlement.hidden && view.pack) {
        const reward = view.pack.reward;
        const item = document.createElement("li");
        item.className = "rarity";
        item.dataset.rarity = reward.rarity;
        item.dataset.rewardId = reward.id;
        item.textContent = describeTeachingReward(reward);
        element("reward-count").textContent = "1 份";
        rewards.append(item);
    }
    renderReceipt(view);
    element("continue-live").hidden = !live || !view.shipment;
    renderArchive(view.seenCards, "教学图鉴");
    primary.hidden = view.phase === "home" && !!view.settlement;
    element("action-bar").hidden = primary.hidden;
    primary.disabled = busy || (view.phase === "home" && teaching.stamina.current < rules.stamina.spend);
    if (summary) {
        primary.textContent = "返回首页";
        instruction.textContent = "直播已结束，未拆库存保留。";
    }
    else if (!live) {
        primary.textContent = primary.disabled && teaching.stamina.current < rules.stamina.spend ? "体力不足" : "开始直播";
        instruction.textContent = "";
    }
    else if (view.shipment) {
        primary.textContent = "下播结算";
        instruction.textContent = "货款已到账。下播时将整场礼物按 50% 分成。";
    }
    else if (view.completed === teachingRarities.length) {
        primary.textContent = "打包发货";
        instruction.textContent = `三包已完成，发货收 ${teachingOrder.saleGold} 金币并登记客户礼物。`;
    }
    else if (readyToOpen) {
        primary.textContent = view.pack && !nextTeachingPreview ? "拆下一包" : "滑动撕开";
        instruction.textContent = "首次教学采用保底，后续自然抽卡无教学保底。教学期间不能用券。";
    }
    else if (view.pack) {
        primary.textContent = `自动翻卡 ${view.pack.revealed} / 5`;
        instruction.textContent = "揭完 5 张后结算本包，教学获得的券留到教学后使用。";
    }
    refreshPlayControls();
}
function renderLivePackOverview(themeId, progress, completed = 0, total = 0) {
    const image = element("live-pack-art");
    const url = themeId && rules.art.packs[themeId];
    image.hidden = !url;
    const foilUrl = url ? pouchArt(url) : undefined;
    if (foilUrl && image.getAttribute("src") !== foilUrl)
        image.src = foilUrl;
    element("live-pack-overview").style.setProperty("--pack-face", foilUrl ? `url("${foilUrl}")` : "none");
    const themeName = themeId ? themeFor(themeId).name : "等待接单";
    element("live-pack-name").textContent = themeName.split("·")[0];
    element("live-pack-name").title = themeName;
    image.alt = themeId ? `${themeName}卡包` : "";
    element("live-pack-progress").textContent = progress;
    const meter = element("live-pack-meter");
    meter.hidden = total <= 0;
    meter.max = Math.max(1, total);
    meter.value = completed;
}
function renderLiveInteraction(comments, visits, fanChange, gifts, grossMilli, online, heat, cards) {
    element("live-comments").textContent = `${comments} 条`;
    element("live-visits").textContent = visits === undefined ? "无记录" : `${visits} 人次`;
    element("live-gross").textContent = gold(grossMilli);
    element("live-online").textContent = String(online);
    element("live-heat-data").textContent = heat;
    element("live-gift-count").textContent = `${gifts} 份`;
    element("live-gift-activity").textContent = `${gifts} 份`;
    element("live-fan-change").textContent = `${fanChange > 0 ? "+" : ""}${fanChange}`;
    element("live-gift-total").textContent = gold(grossMilli);
    element("live-gift-average").textContent = gifts ? gold(Math.round(grossMilli / gifts)) : "—";
    const recent = recentRareCards(cards).slice(-3).reverse();
    const moments = element("live-moments");
    const recentFeed = cards.slice(-3).reverse();
    const key = [...recent, ...recentFeed].map(card => `${card.id}:${card.rarity}`).join("|");
    if (moments.dataset.cards === key)
        return;
    moments.dataset.cards = key;
    const feed = element("live-event-feed");
    feed.replaceChildren(...recentFeed.map(card => {
        const row = document.createElement("p");
        row.className = "live-real-event";
        row.dataset.rarity = card.rarity;
        const art = cardImage(card);
        if (art)
            row.append(art);
        const badge = document.createElement("em");
        badge.textContent = card.rarity;
        row.append(badge, `揭出 ${card.name}`);
        return row;
    }));
    moments.replaceChildren(...recent.map(card => {
        const row = document.createElement("p");
        const art = cardImage(card);
        if (art)
            row.append(art);
        row.append(`${card.rarity} · ${card.name}`);
        return row;
    }));
    if (!recent.length)
        moments.textContent = "本场暂未揭出 SSR 或 UR";
}
function selectLiveInteraction(button) {
    for (const tab of liveInteractionTabs) {
        const active = tab === button;
        tab.setAttribute("aria-pressed", String(active));
        element(tab.getAttribute("aria-controls")).hidden = !active;
    }
}
for (const tab of liveInteractionTabs)
    tab.onclick = () => selectLiveInteraction(tab);
function renderSummaryChat(comments, gifts) {
    element("summary-comments").textContent = `${comments} 条`;
    element("summary-gifts").textContent = `${gifts} 份`;
}
function renderReceiptHighlights(values) {
    const panel = element("receipt-highlights");
    panel.hidden = values.length === 0;
    const heading = document.createElement("h3");
    heading.textContent = "本场收获";
    const grid = document.createElement("div");
    grid.className = "receipt-rewards-grid";
    grid.append(...values.map(([art, label, amount]) => {
        const item = document.createElement("div");
        item.dataset.rewardArt = art;
        const icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
        const name = document.createElement("small");
        name.textContent = label;
        const value = document.createElement("b");
        value.textContent = amount;
        // The reward art is a category illustration, not a fake awarded card.
        // Specific card faces and actual sets are rendered in the gallery below.
        item.append(icon, name, value);
        return item;
    }));
    panel.replaceChildren(heading, grid);
}
function renderReceipt(view) {
    const receipt = element("receipt");
    receipt.hidden = !view.shipment || view.phase === "home";
    if (receipt.hidden || !view.shipment)
        return;
    const { shipment, settlement } = view;
    if (settlement) {
        shell.dataset.settlement = "normal";
        renderSummaryChat(view.comments, view.giftCount);
    }
    element("receipt-kicker").textContent = settlement ? "感谢大家陪伴，今天的直播到这里啦！" : "教学订单已完成";
    element("receipt-title").textContent = settlement ? "直播结算" : "已发货";
    const rows = [
        ["本场热度", String(view.heat), "heat"],
        ["顾客货款", `+${shipment.saleGold} 金币`, "coins"],
        ["本场礼物毛额", gold(view.giftGrossMilli), "gift"],
        ["客户墨镜", `${shipment.sunglasses} 个`, "gift"],
        ["系统成功奖", `+${shipment.systemGold} 金币 · +${shipment.fans} 粉丝`, "fans"],
    ];
    if (settlement)
        rows.push(["礼物到账", `+${settlement.giftNetGold} 金币`, "coins"], ["粉丝增长", `+${view.fans}`, "fans"], ["最终余额", `${view.wallet} 金币`, "wallet"]);
    const cards = settlement ? teaching.broadcast?.packs.flatMap(pack => pack.cards) ?? [] : [];
    const rare = recentRareCards(cards);
    renderReceiptRows(settlement ? [
        ["本场热度", String(view.heat), "heat"], ["订单总额", `${shipment.saleGold} 金币`, "coins"],
        ["礼物毛额", gold(view.giftGrossMilli), "gift"],
        ["礼物到账", `+${settlement.giftNetGold} 金币`, "split"],
        ["最终余额", `${view.wallet} 金币`, "wallet"], ["粉丝增长", `+${view.fans}`, "fans"],
        ["稀有卡回顾", `${rare.length} 张`, "cards"], ["新集齐套组", "0 套", "sets"],
    ] : rows, settlement ? rows.filter(([label]) => ["客户墨镜", "系统成功奖"].includes(label)) : []);
    renderReceiptHighlights(settlement ? [
        ["coins", "顾客货款", `+${shipment.saleGold} 金币`],
        ["fans", "粉丝增长", `+${view.fans}`],
        ...receiptCardHighlights(rare),
        ["gift", "礼物到账", `+${settlement.giftNetGold} 金币`],
    ] : []);
    renderReceiptCards(rare);
    const pending = view.dailyPendingGold ? ` · 每日里程碑待领 ${view.dailyPendingGold} 金币` : "";
    element("receipt-note").textContent = `今日已结算 ${teaching.daily.packIds.length} 包${pending}`;
}
function receiptCardHighlights(rare, sets = []) {
    // Stable five-column settlement: zero stays zero and never invents an extra prize.
    return [["rare", "稀有卡回顾", `${rare.length} 张`],
        ["sets", "新集齐套组", `${sets.length} 套`]];
}
function renderReceiptCards(rare, sets = []) {
    const display = element("receipt-cards");
    display.hidden = shell.dataset.screen !== "summary";
    const gallery = document.createElement("div");
    gallery.className = "receipt-gallery";
    const label = document.createElement("h3");
    label.textContent = "本场高稀有度卡牌";
    const cardGrid = document.createElement("div");
    cardGrid.className = "receipt-card-grid";
    for (const card of rare) {
        const tile = document.createElement("figure");
        tile.dataset.rarity = card.rarity;
        const image = cardImage(card);
        if (image) {
            image.alt = "";
            tile.append(image);
        }
        const caption = document.createElement("figcaption");
        caption.textContent = card.rarity;
        tile.title = card.name;
        tile.setAttribute("aria-label", `${card.name} · ${card.rarity}`);
        tile.append(caption);
        cardGrid.append(tile);
    }
    if (!rare.length) {
        const empty = receiptEmpty("本场未揭出 SSR 或 UR");
        gallery.append(label, empty);
    }
    else
        gallery.append(label, cardGrid);
    const setList = document.createElement("div");
    setList.className = "receipt-sets";
    const setLabel = document.createElement("h3");
    setLabel.textContent = "新集齐的套组";
    const setGrid = document.createElement("div");
    setGrid.className = "receipt-set-grid";
    setGrid.tabIndex = 0;
    setGrid.setAttribute("role", "group");
    setGrid.setAttribute("aria-label", "已集齐套组，可左右滑动查看");
    setGrid.append(...sets.map(id => {
        const tile = document.createElement("figure");
        const image = packImage(id);
        if (image)
            tile.append(image);
        const title = document.createElement("figcaption");
        title.textContent = themeFor(id).name;
        const count = document.createElement("small");
        count.textContent = `${themeFor(id).cards.length}/${themeFor(id).cards.length}`;
        title.append(document.createElement("br"), count);
        tile.append(title);
        return tile;
    }));
    setList.append(setLabel, sets.length ? setGrid : receiptEmpty("本场无新套组"));
    display.replaceChildren(gallery, setList);
}
function receiptEmpty(message) {
    const empty = document.createElement("p");
    empty.className = "receipt-empty";
    empty.textContent = message;
    return empty;
}
function renderReceiptRows(rows, detailRows = []) {
    const renderRows = (values) => values.map(([label, value, art]) => {
        const row = document.createElement("div");
        if (art)
            row.dataset.metricArt = art;
        const term = document.createElement("dt");
        const amount = document.createElement("dd");
        term.textContent = label;
        // Preserve precision and units while giving the number its own visual hierarchy.
        const match = value.match(/^([+−-]?[\d.,]+)(.*)$/);
        if (match) {
            const number = document.createElement("strong");
            const unit = document.createElement("small");
            const [integer, fraction] = match[1].split(".");
            number.textContent = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
                (fraction === undefined ? "" : `.${fraction}`);
            unit.textContent = match[2];
            amount.append(number, unit);
        }
        else
            amount.textContent = value;
        row.append(term, amount);
        return row;
    });
    element("receipt-rows").replaceChildren(...renderRows(rows));
    const details = element("receipt-details");
    details.hidden = detailRows.length === 0;
    details.open = false;
    element("receipt-detail-rows").replaceChildren(...renderRows(detailRows));
}
function teachingPrimary() {
    const view = teachingView(teaching);
    const broadcast = teaching.broadcast;
    if (view.phase === "home" && !broadcast) {
        showStartConfirm({ [rules.starter.id]: view.inventory }, "教学订单需要拆完 3 包并发货，之后可以下播。");
    }
    else if (broadcast) {
        const broadcastId = broadcast.id;
        if (view.phase === "summary")
            void commitTeaching({ type: "home", broadcastId });
        else if (view.shipment)
            void commitTeaching({ type: "stop", broadcastId });
        else if (view.completed === teachingRarities.length)
            void commitTeaching({ type: "ship", broadcastId });
        else if (view.completed === view.opened) {
            instruction.textContent = "请在卡包顶部横向滑动撕开封口。";
        }
        else if (view.pack)
            void commitTeaching({ type: "reveal", broadcastId, packId: view.pack.id, slot: view.pack.revealed });
    }
}
function showStartConfirm(stock, note) {
    startConfirm.returnValue = "";
    const tiles = rules.themes.map(theme => {
        const tile = document.createElement("div");
        tile.className = "inventory-item";
        const cover = packImage(theme.id);
        if (cover) {
            cover.src = pouchArt(cover.src);
            tile.append(cover);
        }
        const label = document.createElement("strong");
        label.textContent = theme.name;
        const count = document.createElement("span");
        count.textContent = `${stock[theme.id] ?? 0} 包`;
        tile.append(label, count);
        return tile;
    });
    element("prep-inventory").replaceChildren(...tiles);
    const total = Object.values(stock).reduce((sum, count) => sum + count, 0);
    element("prep-count").textContent = `${total} 包`;
    element("prep-stamina").textContent = `消耗 ${rules.stamina.spend} 点`;
    element("start-stock").textContent = total ? "开播后可按订单与挑战拆包。" : "当前无库存，确认仍将消耗体力。";
    element("start-rules").textContent = note;
    element("confirm-start").disabled = teaching.stamina.current < rules.stamina.spend;
    installPageHud(startConfirm, showSettings);
    startConfirm.showModal();
    startConfirm.scrollTop = 0;
}
element("restart-live").onclick = async () => {
    if (!ready || busy)
        return;
    const profile = teaching.business;
    if (profile?.live?.report) {
        await commitTeaching({ type: "business", command: { type: "leave-report", revision: profile.revision } });
    }
    else if (teaching.broadcast?.settlement) {
        await commitTeaching({ type: "home", broadcastId: teaching.broadcast.id });
    }
    if (ready && shell.dataset.screen === "home" && !primary.disabled)
        primary.click();
};
startConfirm.onclose = () => {
    if (startConfirm.returnValue !== "start")
        return;
    const id = crypto.randomUUID();
    const profile = teaching.business;
    if (profile)
        sendBusiness({ type: "start-live", id, seed: newSeed(), revision: profile.revision });
    else
        void commitTeaching({ type: "start", id });
};
element("continue-live").onclick = () => {
    if (teaching.broadcast)
        sendBusiness({ type: "continue", broadcastId: teaching.broadcast.id, seed: newSeed() });
};
async function commitTeaching(action) {
    if (!ready || busy || (requireCloud && !cloud?.available))
        return;
    if (action)
        unlockSound();
    busy = true;
    primary.disabled = true;
    canTear = false;
    gesture.dataset.enabled = "false";
    errorPanel.hidden = true;
    const previous = currentGamePack();
    clearTimeout(autoTimer);
    const previousGiftCount = teaching.business?.live?.giftCount ?? teachingView(teaching).giftCount;
    try {
        const now = gameNow();
        teaching = cloud ? await cloud.transact(action, now) : await transactTeaching(db, action, now, showSaveRecovery);
        if (cloud)
            element("platform-note").textContent = cloud.status;
    }
    catch (error) {
        busy = false;
        presentation.failOpen();
        if (requireCloud && error instanceof PlatformFailure)
            blockCloud(error);
        else {
            auto = false;
            renderTeaching();
            showError(error);
        }
        return;
    }
    const current = currentGamePack();
    busy = false;
    if (!ready)
        return;
    renderTeaching();
    if (!action) {
        scheduleAuto();
        return;
    }
    scene.stopUr();
    const event = action.type === "business" ? action.command : action;
    const revealed = event.type === "reveal" || event.type === "reveal-order-card" || event.type === "reveal-free";
    const opened = event.type === "open" || event.type === "open-order-pack" || event.type === "open-free";
    const rarity = revealed && current?.id === previous?.id && current?.revealed !== previous?.revealed
        ? current?.cards[event.slot]?.rarity : undefined;
    await presentPack(previous, current, opened, rarity);
    if (auto && rarity && reachesPause(rarity, settings.pauseAt) && !teaching.business?.free?.exiting) {
        auto = false;
        instruction.textContent = `本包将自动翻完；揭到 ${rarity}，已关闭自动拆下一包。`;
    }
    const gained = (teaching.business?.live?.giftCount ?? teachingView(teaching).giftCount) - previousGiftCount;
    if (gained > 0) {
        const banner = element("gift-banner");
        banner.hidden = !settings.giftBanner || shell.dataset.screen !== "live";
        const fromTeachingOrder = event.type === "ship";
        element("gift-banner-art").dataset.kind = fromTeachingOrder || event.type === "ship-order" ? "glasses" : "gift";
        element("gift-banner-source").textContent = fromTeachingOrder ? "订单客户"
            : event.type === "ship-order" ? "挑战奖励" : "直播观众";
        element("gift-banner-name").textContent = fromTeachingOrder ? "送出墨镜"
            : event.type === "ship-order" ? "获得墨镜" : "送出礼物";
        element("gift-banner-count").textContent = `×${gained}`;
        playSound("gift");
    }
    else
        element("gift-banner").hidden = true;
    scheduleAuto();
}
async function presentPack(previous, current, opened, rarity) {
    if (!current || (!rarity && !(opened && current.id !== previous?.id)))
        return;
    if (opened)
        for (const card of current.cards) {
            const path = rules.art.cards[card.id];
            if (path)
                void warmCardVisual(cardVisual(path, card.rarity, card.id, card.name));
        }
    const cards = visibleCards(current);
    const card = cards[cards.length - 1];
    const theme = isDemo ? rules.starter.id : teaching.business?.free?.themeId ?? teaching.business?.live?.task?.order.themeId ?? rules.starter.id;
    const url = rarity && card ? rules.art.cards[card.id]
        : rules.art.packs[theme];
    busy = true;
    primary.disabled = true;
    canTear = false;
    gesture.dataset.enabled = "false";
    skip.hidden = false;
    try {
        await presentation.play(current.id, rarity ? "reveal" : "rip", !rarity && url ? pouchArt(url) : url ?? cardBackArt, rarity, rarity ? slots[current.revealed - 1] : undefined, settings.reduceFlash);
    }
    finally {
        busy = false;
        revealDue = performance.now() + (rarity ? 100 : 180);
        if (ready) {
            if (isDemo)
                render();
            else
                renderTeaching();
        }
        skip.hidden = nextRevealSlot(current) === null;
    }
}
function newSeed() {
    return crypto.getRandomValues(new Uint32Array(1))[0];
}
function currentGamePack() {
    return teaching.business ? teaching.business.free?.pack ?? teaching.business.live?.task?.pack ?? null : teachingView(teaching).pack;
}
function sendBusiness(command) {
    void commitTeaching({ type: "business", command });
}
slots.forEach((slot, index) => {
    slot.tabIndex = 0;
    const inspect = () => {
        if (busy)
            return;
        const current = isDemo ? pack : currentGamePack();
        const card = visibleCards(current)[index];
        if (!card)
            return;
        const profile = !isDemo ? teaching.business : undefined;
        const theme = rules.themes.find(theme => theme.cards.some(item => item.id === card.id));
        showCardDetails(card, theme?.name ?? "卡牌", profile);
    };
    slot.onclick = inspect;
    slot.onkeydown = event => { if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        inspect();
    } };
});
const collectionTime = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short",
});
function showCardDetails(card, themeName, profile) {
    element("card-detail-title").textContent = card.name;
    const art = element("card-detail-art");
    const path = rules.art.cards[card.id];
    art.hidden = !path;
    art.alt = path ? card.name : "";
    art.dataset.rarity = card.rarity;
    if (path)
        art.src = path;
    else
        art.removeAttribute("src");
    clearDetailTilt?.();
    cardDetails.querySelector(".prism-detail")?.remove();
    if (path) {
        const wrapper = document.createElement("div");
        wrapper.className = "prism-detail";
        const visual = cardVisual(path, card.rarity, card.id, card.name);
        wrapper.append(createCardView({ ...visual, background: undefined, subject: undefined }));
        if (visual.subject)
            void prepareCardVisual(visual).then(ready => {
                if (wrapper.isConnected && ready.subject)
                    wrapper.replaceChildren(createCardView(ready));
            });
        art.after(wrapper);
        art.hidden = true;
        clearDetailTilt = attachCardTilt(wrapper);
    }
    const count = profile?.owned?.[card.id] ?? 0;
    const copies = profile?.collectionCopies?.[card.id] ?? [];
    element("card-detail-status").textContent = profile
        ? `${themeName} · 原生品级 ${card.rarity} · 私人持有 ${count} 张`
        : `${themeName} · 品级 ${card.rarity} · 图鉴已见`;
    const legacy = element("card-detail-legacy");
    const legacyCount = count - copies.length;
    legacy.hidden = legacyCount <= 0;
    legacy.textContent = legacyCount > 0 ? `旧存档的 ${legacyCount} 张藏品没有单独的获取来源和时间记录。` : "";
    const list = element("card-detail-copies");
    const more = element("card-detail-more");
    list.replaceChildren();
    list.start = copies.length;
    let end = copies.length;
    const appendPage = () => {
        const start = Math.max(0, end - 20);
        list.append(...copies.slice(start, end).reverse().map(([rarity, time, source]) => {
            const row = document.createElement("li");
            row.textContent = `${rarity} · ${source === "free" ? "自由拆卡" : "直播自拆挑战"} · ${collectionTime.format(time)}（北京时间）`;
            return row;
        }));
        end = start;
        more.hidden = end === 0;
    };
    more.onclick = appendPage;
    appendPage();
    showCardPanel(cardDetails);
}
function showCardPanel(dialog) {
    presentation.setPaused(true);
    clearTimeout(autoTimer);
    if (!history.state?.ssrLive)
        history.pushState({ ssrLive: true }, "");
    dialog.showModal();
}
function cardTile(card, label, openDetails) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quiet";
    const path = rules.art.cards[card.id];
    if (path) {
        const art = new Image();
        art.src = path;
        art.alt = "";
        art.loading = "lazy";
        button.append(art);
    }
    button.append(label);
    button.onclick = openDetails;
    return button;
}
function renderArchive(cards, title) {
    element("archive").hidden = false;
    const openArchive = element("open-archive");
    openArchive.setAttribute("aria-label", `图鉴 · ${cards.length} 张已见`);
    openArchive.onclick = () => {
        if (busy || !ready)
            return;
        element("archive-heading").textContent = "图鉴";
        archiveMenu.querySelector(".archive-note").textContent = `${title} · ${cards.length} 张已见`;
        element("archive-empty").hidden = cards.length > 0;
        const seen = new Map(cards.map(card => [card.id, card]));
        let themeId;
        let rarity;
        let selected = cards[cards.length - 1];
        const render = () => {
            const themes = roomTabs("图鉴主题");
            themes.append(roomTab("全部系列", !themeId, () => { themeId = undefined; render(); }));
            for (const theme of rules.themes) {
                themes.append(roomTab(theme.name, theme.id === themeId, () => { themeId = theme.id; render(); }));
            }
            const rarities = roomTabs("稀有度");
            rarities.append(roomTab("全部", !rarity, () => { rarity = undefined; render(); }));
            for (const grade of RARITIES) {
                const button = roomTab(grade, grade === rarity, () => { rarity = grade; render(); });
                button.dataset.rarity = grade;
                rarities.append(button);
            }
            element("archive-filters").replaceChildren(themes, rarities);
            const allCards = rules.themes.filter(theme => !themeId || theme.id === themeId).flatMap(theme => [...theme.cards]);
            const entries = allCards.filter(card => !rarity || card.rarity === rarity);
            if (!entries.some(card => card.id === selected?.id))
                selected = entries.map(card => seen.get(card.id)).find(Boolean);
            const archiveList = element("archive-cards");
            const scroll = archiveList.scrollTop;
            archiveList.replaceChildren(...entries.map(card => {
                const item = document.createElement("li");
                const known = seen.get(card.id);
                item.className = known ? "known-card" : "locked-card";
                if (!known) {
                    const symbol = document.createElement("span");
                    symbol.textContent = "?";
                    symbol.setAttribute("aria-hidden", "true");
                    item.append(symbol, "未解锁");
                    return item;
                }
                const tile = cardTile(known, known.name, () => { selected = known; render(); });
                tile.dataset.rarity = known.rarity;
                tile.setAttribute("aria-pressed", String(known.id === selected?.id));
                item.append(tile);
                return item;
            }));
            archiveList.scrollTop = scroll;
            const preview = element("archive-preview");
            preview.replaceChildren();
            preview.hidden = !selected;
            if (selected) {
                const card = selected;
                const art = cardImage(card, "card-grade-frame");
                const theme = rules.themes.find(item => item.cards.some(entry => entry.id === card.id));
                const copy = document.createElement("div");
                const name = document.createElement("h3");
                name.textContent = card.name + " · " + card.rarity;
                const label = document.createElement("p");
                label.textContent = `${theme?.name ?? "图鉴"} · 已解锁`;
                copy.append(name, label, roomButton("查看大图", () => showCardDetails(card, theme?.name ?? "图鉴"), "primary"));
                if (art)
                    preview.append(art);
                preview.append(copy);
            }
        };
        render();
        installPageHud(archiveMenu, showSettings);
        showCardPanel(archiveMenu);
        archiveMenu.scrollTop = 0;
    };
}
const market = element("market");
element("open-shop").onclick = () => {
    if (!teaching.business || teaching.business.live || busy)
        return;
    renderMarket(teaching.business, busy, sendBusiness);
    installPageHud(market, showSettings);
    market.showModal();
    market.scrollTop = 0;
};
function renderBusinessTools(profile, canOpen) {
    const live = profile.live;
    const task = live?.task;
    const pack = task?.pack;
    const windowOpen = !!pack?.pending && pack.revealed === pack.cards.length;
    const coupons = live && task ? heldCoupons(live.rewards, live.spentCoupons) : [];
    const available = coupons.filter(item => windowOpen ? item.key === "upgrade" : canOpen && item.key !== "upgrade");
    const groups = new Map(available.map(item => [`${item.key}/${item.rarity}`, item]));
    tools.hidden = !windowOpen && groups.size === 0;
    options.replaceChildren();
    options.classList.add("business-tools");
    if (tools.hidden || !task)
        return;
    element("tool-title").textContent = windowOpen ? "本包升品" : "撕包前指定第 5 张";
    element("coupon-count").textContent = `${available.length} 张券`;
    const theme = themeFor(task.order.themeId);
    for (const coupon of groups.values()) {
        const row = document.createElement("div");
        row.className = "shop-controls";
        const label = describeTeachingReward(coupon).replace(" ×1", "");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "quiet";
        button.textContent = label;
        button.disabled = busy;
        if (coupon.key === "grade") {
            button.onclick = () => open({ id: coupon.id });
            row.append(button);
        }
        else {
            const select = document.createElement("select");
            select.setAttribute("aria-label", `${label}目标`);
            if (coupon.key === "card") {
                for (const card of theme.cards.filter(item => guaranteeFor(theme, coupon, item.id))) {
                    select.add(new Option(`${card.rarity} · ${card.name}`, card.id));
                }
                button.onclick = () => open({ id: coupon.id, cardId: select.value });
            }
            else if (pack) {
                pack.cards.forEach((card, slot) => {
                    if (!pack.upgraded?.includes(slot) && canUpgrade(card, coupon)) {
                        select.add(new Option(`${slot + 1} · ${card.name} · ${card.rarity} → ${effectiveRarity(card, true)}`, String(slot)));
                    }
                });
                button.onclick = () => sendBusiness({ type: "upgrade-order-card", revision: profile.revision,
                    packId: pack.id, slot: Number(select.value), couponId: coupon.id });
            }
            if (!select.options.length)
                continue;
            row.append(select, button);
        }
        options.append(row);
    }
}
const growth = element("growth");
let growthPage = "free";
let collectionTheme = rules.starter.id;
let collectionPage = 0;
let freeTheme = rules.starter.id;
let freeQuantity = 1;
function renderFreePicker(list, profile) {
    const form = document.createElement("section");
    form.className = "free-picker lesson";
    const heading = document.createElement("h3");
    heading.textContent = "选择拆卡数量";
    const theme = document.createElement("select");
    theme.setAttribute("aria-label", "卡包主题");
    const available = rules.themes.filter(item => profile.stock[item.id] > 0);
    for (const item of available)
        theme.add(new Option(`${item.name} · ${profile.stock[item.id]} 包`, item.id));
    const selected = available.find(item => item.id === freeTheme) ?? available[0];
    if (selected)
        theme.value = selected.id;
    theme.disabled = !selected;
    theme.onchange = () => { freeTheme = theme.value; renderGrowth(profile); };
    const tiers = roomTabs("拆卡包数");
    tiers.classList.add("free-tiers");
    const stock = selected ? profile.stock[selected.id] : 0;
    freeQuantity = Math.max(1, Math.min(freeQuantity, stock));
    for (const count of [1, 2, 3]) {
        const button = roomTab(`${count} 包`, count === freeQuantity, () => {
            freeQuantity = count;
            renderGrowth(profile);
        });
        const art = selected && packImage(selected.id);
        if (art) {
            art.src = pouchArt(art.src);
            button.prepend(art);
        }
        const label = document.createElement("small");
        label.textContent = `拥有 ${stock} 包`;
        button.append(label);
        button.disabled = stock < count || busy;
        tiers.append(button);
    }
    form.append(heading, theme, tiers);
    const start = roomButton("开始拆卡", () => {
        if (!selected || freeQuantity > profile.stock[selected.id])
            return;
        growth.close();
        sendBusiness({ type: "start-free", revision: profile.revision, id: crypto.randomUUID(),
            themeId: selected.id, quantity: freeQuantity });
    }, "primary free-start");
    start.disabled = busy || !selected;
    const result = document.createElement("section");
    result.className = "free-results lesson";
    const resultTitle = document.createElement("h3");
    resultTitle.textContent = "最近一包获得";
    const lastPack = profile.free?.pack;
    result.append(resultTitle);
    if (lastPack && lastPack.revealed === lastPack.cards.length) {
        for (const card of lastPack.cards) {
            const art = cardImage(card);
            if (art)
                result.append(art);
        }
    }
    else {
        const note = document.createElement("p");
        note.textContent = "拆完一包后，卡牌自动入藏。";
        result.append(note);
    }
    list.append(form, start, result);
}
function renderCollection(list, profile) {
    const theme = themeFor(collectionTheme);
    const count = theme.cards.filter(card => profile.owned?.[card.id]).length;
    const tabs = roomTabs("收藏系列");
    const shelf = document.createElement("section");
    shelf.className = "collection-shelf";
    const panel = document.createElement("div");
    panel.className = "shelf-board";
    const switchTheme = (id) => {
        collectionTheme = id;
        collectionPage = 0;
        renderGrowth(profile);
    };
    for (const item of rules.themes) {
        tabs.append(roomTab(item.name, item.id === theme.id, () => switchTheme(item.id)));
    }
    const pageLabel = document.createElement("h3");
    pageLabel.textContent = `${theme.name} · ${count}/20`;
    const pageControls = roomTabs("卡架卡位翻页");
    const previous = roomButton("‹", () => { collectionPage--; renderGrowth(profile); });
    previous.setAttribute("aria-label", "上一组卡位");
    previous.disabled = collectionPage === 0;
    const next = roomButton("›", () => { collectionPage++; renderGrowth(profile); });
    next.setAttribute("aria-label", "下一组卡位");
    next.disabled = collectionPage >= Math.ceil(theme.cards.length / 6) - 1;
    pageControls.append(previous, pageLabel, next);
    const grid = document.createElement("ul");
    grid.className = "collection-grid";
    for (const card of theme.cards.slice(collectionPage * 6, collectionPage * 6 + 6)) {
        const row = document.createElement("li");
        const total = profile.owned?.[card.id] ?? 0;
        row.className = total ? "known-card" : "locked-card";
        if (total) {
            const byGrade = RARITIES.flatMap(grade => {
                const quantity = profile.ownedGrades?.[`${card.id}/${grade}`];
                return quantity ? [`${grade} ×${quantity}`] : [];
            });
            const tile = cardTile(card, `${card.name} · ${total} 张 ${byGrade.join("、")}`, () => showCardDetails(card, theme.name, profile));
            tile.dataset.rarity = card.rarity;
            row.append(tile);
        }
        else {
            const symbol = document.createElement("span");
            symbol.textContent = "?";
            symbol.setAttribute("aria-hidden", "true");
            row.append(symbol, `${card.name} · 未收藏`);
        }
        grid.append(row);
    }
    panel.append(tabs, pageControls, grid);
    shelf.append(panel);
    const bonus = document.createElement("section");
    bonus.className = "lesson collection-progress";
    const bonusTitle = document.createElement("h3");
    const complete = hasSet(theme, profile.owned);
    bonusTitle.textContent = complete ? "套组加成已激活" : "套组收集加成";
    const progress = document.createElement("progress");
    progress.max = 20;
    progress.value = count;
    progress.setAttribute("aria-label", `${theme.name}已收藏 ${count}/20`);
    const odds = document.createElement("p");
    const stages = drawOddsStages(theme, [], { ranks: profile.ranks, owned: profile.owned });
    odds.textContent = complete ? RARITIES.slice(2).map((grade, index) => {
        const at = index + 2;
        return `${grade} ${(stages.collection[at] / 100).toFixed(2)}%`;
    }).join(" · ") : "集齐 20 个原生卡位后，提升本系列的 SR、SSR、UR 概率。";
    bonus.append(bonusTitle, progress, odds, ...milestoneButtons(profile, rules.collectionMilestones, count, profile.collectionClaims?.[theme.id] ?? [], theme.id));
    const others = document.createElement("div");
    others.className = "other-shelves";
    for (const item of rules.themes.filter(item => item.id !== theme.id)) {
        const owned = item.cards.filter(card => profile.owned?.[card.id]);
        const button = roomButton("", () => switchTheme(item.id));
        const label = document.createElement("strong");
        label.textContent = `${item.name} · ${owned.length}/20`;
        button.append(label);
        for (let index = 0; index < 4; index++) {
            const art = owned[index] && cardImage(owned[index]);
            if (art) {
                button.append(art);
            }
            else {
                const lock = document.createElement("span");
                lock.className = "shelf-lock";
                lock.textContent = "?";
                lock.setAttribute("aria-hidden", "true");
                button.append(lock);
            }
        }
        others.append(button);
    }
    list.append(shelf, bonus, others);
}
function renderGrowth(profile) {
    const list = element("growth-list");
    list.replaceChildren();
    growth.dataset.room = growthPage;
    element("growth-title").textContent = { free: "局外自由拆卡", collection: "我的收藏卡架", talents: "天赋" }[growthPage];
    growth.querySelector("form[method=dialog] button").textContent = growthPage === "talents" ? "返回主页" : "关闭";
    if (growthPage === "free")
        renderFreePicker(list, profile);
    else if (growthPage === "collection")
        renderCollection(list, profile);
    else
        renderTalentTree(list, profile, busy, sendBusiness);
}
function openGrowth(page) {
    if (!teaching.business || teaching.business.live || busy)
        return;
    growthPage = page;
    renderGrowth(teaching.business);
    if (!growth.open) {
        growth.scrollTop = 0;
        installPageHud(growth, showSettings);
        growth.showModal();
    }
}
element("open-free").onclick = () => openGrowth("free");
element("open-collection").onclick = () => openGrowth("collection");
element("open-talents").onclick = () => openGrowth("talents");
for (const [id, menu] of [["open-check-in", checkInMenu], ["open-daily", dailyMenu], ["open-benefits", homeBenefits]]) {
    element(id).onclick = () => {
        if (ready && teaching.business && shell.dataset.screen === "home" && !menu.open)
            menu.showModal();
    };
    menu.onclose = scheduleAuto;
}
element("sign-in").onclick = () => {
    const profile = teaching.business;
    if (profile)
        sendBusiness({ type: "sign-in", revision: profile.revision });
};
element("exit-free").onclick = () => {
    const profile = teaching.business;
    const pack = profile?.free?.pack;
    const prompt = pack && pack.revealed < 5 ? "已锁定的包将结算入藏，其余未拆包保留。确定退出？" : "退出后本次金包接力和 UR 余辉清空。确定退出？";
    if (profile?.free && !profile.free.exiting && window.confirm(prompt))
        sendBusiness({ type: "exit-free", revision: profile.revision });
};
let rewardPlaying = false;
let rewardResult;
function renderPlatformActions(profile) {
    const tap = currentTap();
    const ad = element("reward-ad");
    const share = element("platform-share");
    const shareReward = element("reward-share");
    share.hidden = !cloud?.available || !rules.platform.shareTemplate || typeof tap?.showShareboard !== "function";
    ad.hidden = !cloud?.available || !rules.platform.adUnit || typeof tap?.createRewardedVideoAd !== "function" ||
        !!profile.free || !!profile.live?.report || !!profile.live?.task;
    const liveId = profile.live?.id ?? null;
    const eligible = rewardAllowed(profile.external, teaching.daily.date, liveId, "ad");
    const pending = profile.external?.pending;
    const blocked = rewardPlaying || !!(pending && pending.session === cloud?.sessionId && rewardValid(pending, Date.now()));
    ad.disabled = blocked || !eligible;
    shareReward.hidden = share.hidden || !rules.platform.shareRewards || rules.platform.shareProbe || !supportsShareRewards(tap) ||
        !!profile.free || !!profile.live?.report || !!profile.live?.task;
    shareReward.disabled = blocked || !rewardAllowed(profile.external, teaching.daily.date, liveId, "share");
    shareReward.textContent = liveId ? "分享 · 领取 1 个 SR 增益" : "分享 · 领取 20 金币";
    share.disabled = blocked;
    const day = profile.external?.days[teaching.daily.date];
    const left = Math.max(0, Math.min(5 - (day?.ads ?? 0), liveId
        ? 2 - (profile.external?.live[liveId]?.ads ?? 0) : 3 - (day?.coins ?? 0)));
    element("benefits-empty").hidden = !(share.hidden && ad.hidden && shareReward.hidden);
    ad.textContent = liveId ? `激励视频 · 领 1 个 SR 增益（本场剩 ${left} 次）`
        : `激励视频 · 领 40 金币（今日剩 ${left} 次）`;
}
async function settleExternalReward() {
    const result = rewardResult;
    if (!result || busy || !ready || !cloud?.available)
        return;
    if (result.session !== cloud.sessionId || !teaching.business) {
        rewardResult = undefined;
        return;
    }
    const { id, session, succeeded } = result;
    await commitTeaching({ type: "business", command: { type: "finish-reward", id, session, succeeded, revision: teaching.business.revision } });
    if (teaching.business?.external?.pending?.id !== result.id) {
        rewardResult = undefined;
        element("reward-note").textContent = result.succeeded ? "奖励请求已结算。"
            : result.source === "ad" ? "视频未完整播放，奖励资格已释放。" : "未确认本次分享成功，奖励资格已释放。";
    }
}
async function startExternalReward(source) {
    const tap = currentTap();
    const profile = teaching.business;
    const session = cloud?.sessionId;
    if (rewardPlaying || busy || !tap || !profile || !session || !cloud?.available ||
        (source === "share" && (!rules.platform.shareRewards || rules.platform.shareProbe || !supportsShareRewards(tap))))
        return;
    rewardPlaying = true;
    const id = crypto.randomUUID();
    try {
        await commitTeaching({ type: "business", command: { type: "reserve-reward", id, session,
                revision: profile.revision, source, seed: newSeed() } });
        if (teaching.business?.external?.pending?.id !== id)
            return;
        const request = source === "ad" ? playRewardedAd(tap, rules.platform.adUnit)
            : playRewardedShare(tap, rules.platform.shareTemplate, id);
        const succeeded = await request.catch(() => false);
        rewardResult = { id, session, succeeded, source };
        await settleExternalReward();
    }
    finally {
        rewardPlaying = false;
        if (ready && teaching.business)
            renderPlatformActions(teaching.business);
    }
}
element("reward-ad").onclick = () => void startExternalReward("ad");
element("reward-share").onclick = () => void startExternalReward("share");
element("platform-share").onclick = () => {
    const tap = currentTap();
    if (!tap || !cloud?.available)
        return;
    const note = element("reward-note");
    if (rules.platform.shareProbe) {
        const button = element("platform-share");
        button.disabled = true;
        note.textContent = "分享联调：等待分享行为回调。";
        void probeShare(tap, rules.platform.shareTemplate).then(result => {
            note.textContent = {
                unsupported: "分享联调：容器未提供可注册和卸载的行为监听。",
                matched: "分享联调：行为回调成功且关联标识匹配。",
                uncorrelated: "分享联调：收到行为回调，无法关联本次请求。",
                unavailable: "分享联调：面板打开失败或未收到行为回调。",
            }[result];
        }).finally(() => { button.disabled = false; });
        return;
    }
    void openShare(tap, rules.platform.shareTemplate)
        .catch(() => { note.textContent = "当前无法打开分享面板。"; });
};
function renderBusiness(profile) {
    renderPlatformActions(profile);
    const { live } = profile;
    showScreen(profile.free ? "free" : live?.report ? "summary" : live ? "live" : "home");
    for (const id of ["open-shop", "open-talents", "open-collection", "open-free"])
        element(id).disabled = busy;
    element("restart-live").hidden = !live?.report;
    element("restart-live").disabled = teaching.stamina.current < rules.stamina.spend;
    const task = live?.task;
    const current = task?.pack ?? null;
    const opened = current && current.revealed < current.cards.length;
    const choosing = !!current?.pending && !opened;
    const canOpen = !!task && !opened && !choosing && task.completed < task.order.quantity;
    element("profile").hidden = false;
    element("coins").textContent = String(profile.wallet);
    element("inventory").textContent = `${totalStock(profile.stock)} 包`;
    element("fans").textContent = String(profile.fans);
    renderStamina(gameNow());
    element("mode-label").textContent = live ? (live.report ? "本场回顾" : "正式直播") : "直播准备";
    element("edition").textContent = "";
    for (const id of ["open-check-in", "open-daily", "open-benefits"]) {
        element(id).disabled = busy;
    }
    element("lesson").hidden = true;
    element("continue-live").hidden = true;
    element("free-session").hidden = !profile.free;
    const signed = profile.signIn?.day === teaching.daily.date;
    const signIn = element("sign-in");
    const next = (profile.signIn?.count ?? 0) % signInAmounts.length;
    signIn.disabled = signed || busy;
    signIn.textContent = signed ? "今日已签到" : `签到领 ${signInAmounts[next]} 金币`;
    element("open-check-in").toggleAttribute("data-notice", !signed);
    element("daily-progress").textContent = `今日已结算 ${teaching.daily.packIds.length} 包`;
    const claimed = profile.dailyClaims?.day === teaching.daily.date ? profile.dailyClaims.tiers : [];
    element("open-daily").toggleAttribute("data-notice", rules.dailyMilestones.some(([threshold]) => teaching.daily.packIds.length >= threshold && !claimed.includes(threshold)));
    element("daily-claims").replaceChildren(...milestoneButtons(profile, rules.dailyMilestones, teaching.daily.packIds.length, claimed));
    if (growth.open && !live)
        renderGrowth(profile);
    if (live && market.open)
        market.close();
    if (market.open)
        renderMarket(profile, busy, sendBusiness);
    element("business-live").hidden = !live || !!live.report;
    element("live-shipment-display").hidden = !live || !!task || !!live.report || !live.shipped;
    if (live && !task && live.shipped && !live.report) {
        element("shipment-pack-art").src = "./assets/ui/summary-reward-coins-v2.webp";
        element("shipment-pack-art").alt = "货款到账";
        element("shipment-copy").textContent = `本场已发货 ${live.shipped} 单 · 货款到账 ${live.saleGold} 金币`;
        element("live-receipt-art").src = "./assets/ui/summary-reward-coins-v2.webp";
        element("live-receipt-summary").textContent = `${live.shipped} 单 · 货款 ${live.saleGold} 金币`;
    }
    if (live) {
        element("business-title").textContent = task ? themeFor(task.order.themeId).name : "等待接单";
        const orderArt = element("business-pack-art");
        const orderUrl = task && rules.art.packs[task.order.themeId];
        orderArt.hidden = !orderUrl;
        if (orderUrl && orderArt.getAttribute("src") !== orderUrl)
            orderArt.src = orderUrl;
        const orderProgress = element("business-pack-progress");
        orderProgress.max = task?.order.quantity ?? 1;
        orderProgress.value = task?.completed ?? 0;
        element("business-progress-number").textContent = task ? `${task.completed} / ${task.order.quantity}` : "—";
        const orderReward = element("business-order-reward");
        if (!task)
            orderReward.textContent = "选择订单后开始拆包";
        else if (task.order.challenge) {
            const goal = task.order.challenge.goal;
            const target = goal.kind === "heat" ? goal.exactTarget ?? goal.target : goal.target;
            orderReward.textContent = `${goalLabel(task.order)} · ${challengeProgress(live, task)}/${target}`;
        }
        else
            orderReward.textContent = `${task.completed} / ${task.order.quantity} 包 · ${task.order.selfOpen ? "拆后入藏" : `货款 ${task.order.payment} 金币`}`;
        element("business-stock").textContent = `本场带入 ${totalStock(live.startingStock)} 包 · 未拆 ${totalStock(profile.stock)} 包`;
        const progress = element("challenge-progress");
        const contract = task?.order.challenge;
        progress.hidden = !contract;
        if (contract && task) {
            const target = contract.goal.kind === "heat" ? contract.goal.exactTarget ?? contract.goal.target : contract.goal.target;
            progress.textContent = `${goalLabel(task.order)} · ${challengeProgress(live, task)}/${target}`;
            const art = challengeCardArt(task.order);
            if (art)
                progress.prepend(art);
            progress.classList.toggle("challenge-condition", !!art);
        }
        const result = element("challenge-result");
        result.hidden = !live.challengeResult || !!task;
        if (live.challengeResult) {
            const outcome = live.challengeResult;
            result.textContent = outcome.success ? `挑战成功 · ${outcome.glasses} 个墨镜 · 系统奖励 ${outcome.gold} 金币`
                : live.report && !outcome.fine ? "挑战失败 · 红包不足，已强制下播"
                    : `挑战失败 · 已支付 ${outcome.fine} 金币红包`;
        }
        const audience = live.audience;
        const online = audience ? audience.oldFans + audience.visitors : openingAudience(live);
        element("live-heat").textContent = `热度 ${live.heatExact ?? live.heat}`;
        element("live-audience").textContent = `在线 ${online}`;
        if (!live.report && !profile.free) {
            const fresh = current && (opened || choosing)
                ? visibleCards({ ...current, cards: finalCards(current.cards, current.upgraded), upgraded: undefined }) : [];
            renderLiveInteraction(live.comments, live.visits, profile.fans - live.openingFans, live.giftCount, live.grossMilli, online, live.heatExact ?? String(live.heat), [...(live.featuredCards ?? []), ...fresh]);
            renderLivePackOverview(task?.order.themeId, task ? `${task.completed} / ${task.order.quantity} 包已结算`
                : `本场库存 ${totalStock(profile.stock)} 包`, task?.completed, task?.order.quantity);
        }
        const pending = task && !task.order.selfOpen ? task.order.payment : 0;
        const accepted = live.shipped + Number(!!task && !task.order.selfOpen);
        element("business-stats").textContent = `已接 ${accepted} 单 · 待发货 ${pending} 金币 · 已到账 ${live.saleGold} 金币`;
        const labels = { cards: "卡牌热度", interaction: "互动热度", gifts: "礼物热度", combo: "整包组合", recommendation: "热门推荐", removal: "红包评论", legacy: "历史累计" };
        const sources = live.heatSources ?? { legacy: live.heatExact ?? String(live.heat) };
        element("live-source-list").textContent = `本版本记录来访 ${live.visits ?? 0} 人次 · ` +
            Object.keys(labels).filter(key => key in sources).map(key => `${labels[key]} ${sources[key]}`).join(" · ");
    }
    renderCandidates(profile, busy, sendBusiness);
    element("pack-table").hidden = !task;
    element("slots").hidden = !task;
    renderPack(current ? { ...current, cards: finalCards(current.cards, current.upgraded), upgraded: undefined } : null, !!current && !opened && !choosing, canOpen, undefined, task?.order.themeId);
    if (task)
        element("pack-title").textContent = themeFor(task.order.themeId).name;
    renderBusinessTools(profile, canOpen);
    settlement.hidden = !current || !!opened || choosing || current.rewards.length === 0;
    rewards.replaceChildren();
    if (!settlement.hidden && current) {
        element("reward-count").textContent = `${current.rewards.length} 份`;
        for (const reward of current.rewards) {
            const item = document.createElement("li");
            item.className = "rarity";
            item.dataset.rarity = reward.rarity;
            item.textContent = describeTeachingReward(reward);
            rewards.append(item);
        }
    }
    element("receipt").hidden = !live?.report;
    if (live?.report) {
        renderSummaryChat(live.comments, live.giftCount);
        const outcome = live.challengeResult;
        const forced = !!outcome && !outcome.success && !outcome.fine;
        shell.dataset.settlement = forced ? "forced" : "normal";
        element("receipt-kicker").textContent = forced ? "本场收益已结算" : "感谢大家陪伴，今天的直播到这里啦！";
        if (forced)
            element("scene-title").textContent = "本场直播\n已结束";
        element("receipt-title").textContent = forced ? "红包不足 · 强制下播" : "直播结算";
        const fanChange = profile.fans - live.openingFans;
        const fanChangeText = `${fanChange > 0 ? "+" : ""}${fanChange}`;
        const rare = recentRareCards(live.featuredCards ?? []);
        renderReceiptRows([
            ["本场热度", live.heatExact ?? String(live.heat), "heat"],
            ["订单总额", `${live.saleGold} 金币`, "coins"],
            ["礼物毛额", gold(forced && outcome ? outcome.refundedMilli : live.grossMilli), "gift"],
            ["礼物到账", `+${live.report.giftNet} 金币`, "split"],
            ["最终余额", `${profile.wallet} 金币`, "wallet"], ["粉丝变化", fanChangeText, "fans"],
            ["稀有卡回顾", `${rare.length} 张`, "cards"], ["新集齐套组", `${live.completedSets?.length ?? 0} 套`, "sets"],
        ], [
            ["已发货", `${live.shipped} 单`], ["候选移除红包", `${live.removedGold} 金币`],
            ...(outcome?.success ? [["挑战奖励", `${outcome.glasses} 个墨镜 · ${outcome.gold} 金币`]] : []),
            ...(outcome?.fine ? [["挑战失败红包", `${outcome.fine} 金币`]] : []),
            ...(forced && outcome ? [["退回礼物", gold(outcome.refundedMilli)], ["流失粉丝", String(outcome.lostFans)]] : []),
        ]);
        renderReceiptHighlights([
            ["coins", "顾客货款", `${live.saleGold} 金币`],
            ["fans", "粉丝变化", fanChangeText],
            ...receiptCardHighlights(rare, live.completedSets),
            ["gift", "礼物到账", `${live.report.giftNet} 金币`],
        ]);
        renderReceiptCards(rare, live.completedSets);
        element("receipt-note").textContent = `未拆库存保留 · 今日已结算 ${teaching.daily.packIds.length} 包`;
    }
    renderArchive(profile.seen, "直播图鉴");
    primary.hidden = false;
    element("action-bar").hidden = false;
    const tired = teaching.stamina.current < rules.stamina.spend;
    primary.disabled = busy || (!live && tired);
    if (profile.free) {
        const free = profile.free;
        const pack = free.pack;
        const revealing = !!pack && pack.revealed < 5;
        const complete = free.completed === free.quantity;
        element("pack-table").hidden = false;
        element("slots").hidden = false;
        renderPack(pack, !!pack && !revealing, !complete && !revealing, undefined, free.themeId);
        element("pack-title").textContent = themeFor(free.themeId).name;
        element("free-progress").textContent = `已入藏 ${free.completed}/${free.quantity} 包 · 今日已结算 ${teaching.daily.packIds.length} 包`;
        primary.disabled = busy || (!!free.exiting && !revealing);
        primary.textContent = free.exiting && !revealing ? "已入藏，即将返回" : complete ? "继续拆卡" : revealing ? `自动翻卡 ${pack.revealed} / 5` : `滑动卡包封口 · 第 ${free.completed + 1} 包`;
        element("exit-free").disabled = !!free.exiting;
        instruction.textContent = free.exiting ? (revealing ? "正在揭完已锁包，入藏后自动退出，其余未拆包保留。" : "本包已入藏，其余库存已保留。")
            : complete ? "继续拆卡会继承当前会话的金包接力和 UR 余辉。" : "揭完五张后自动入藏。";
    }
    else if (!live) {
        primary.textContent = tired ? "体力不足" : "开始直播";
        instruction.textContent = "";
    }
    else if (live.report) {
        primary.textContent = "返回首页";
        instruction.textContent = "货款和礼物分开入账，未拆卡包保留。";
    }
    else if (!task) {
        primary.textContent = "下播结算";
        instruction.textContent = "选择订单或挑战，也可以直接下播。";
    }
    else if (choosing && current) {
        primary.textContent = current.upgraded?.length ? "完成使用" : "不使用道具";
        instruction.textContent = "升品只作用于本包，关闭窗口后结算卡牌、热度和奖励。";
    }
    else if (canOpen) {
        primary.textContent = "滑动撕开";
        instruction.textContent = "正式订单使用自然抽卡概率，锁包后可以刷新续拆。";
    }
    else if (opened) {
        primary.textContent = `自动翻卡 ${current.revealed} / 5`;
        instruction.textContent = "揭完 5 张后结算本包。";
    }
    else {
        primary.textContent = task.order.selfOpen ? "结算自拆挑战" : "打包发货";
        instruction.textContent = task.order.selfOpen ? "卡牌已入藏，确认后结算挑战。" : `订单已拆完，发货收 ${task.order.payment} 金币。`;
    }
}
function businessPrimary(profile) {
    const { live, revision, free } = profile;
    if (free) {
        const pack = free.pack;
        if (free.completed === free.quantity)
            return openGrowth("free");
        if (pack && pack.revealed < 5)
            return sendBusiness({ type: "reveal-free", revision, packId: pack.id, slot: pack.revealed });
        instruction.textContent = "请在卡包顶部横向滑动撕开封口。";
        return;
    }
    if (!live) {
        showStartConfirm(profile.stock, "带入全部未拆库存。");
        return;
    }
    if (live.report)
        return sendBusiness({ type: "leave-report", revision });
    if (!live.task)
        return sendBusiness({ type: "stop-live", revision });
    const { pack: current, completed, order } = live.task;
    if (current?.pending && current.revealed === current.cards.length) {
        return sendBusiness({ type: "finish-order-pack", revision, packId: current.id });
    }
    if (completed === order.quantity)
        return sendBusiness({ type: "ship-order", revision, seed: newSeed() });
    if (current && current.revealed < current.cards.length) {
        return sendBusiness({ type: "reveal-order-card", revision, packId: current.id, slot: current.revealed });
    }
    instruction.textContent = "请在卡包顶部横向滑动撕开封口。";
}
function milestoneButtons(profile, tiers, count, claimed, themeId) {
    return tiers.map(([threshold, amount]) => {
        const button = document.createElement("button");
        button.className = "quiet";
        button.type = "button";
        button.textContent = claimed.includes(threshold) ? `${threshold} 档已领`
            : count >= threshold ? `领取 ${amount} 金币` : `${threshold} 档 · ${amount} 金币`;
        button.disabled = busy || claimed.includes(threshold) || count < threshold;
        button.onclick = () => sendBusiness({ type: "claim-milestone", revision: profile.revision, threshold, themeId });
        return button;
    });
}
function liveRunning() {
    const profile = teaching.business;
    return profile ? !!profile.live && !profile.live.report : teachingView(teaching).phase === "live";
}
function autoStep() {
    if (!ready || busy || isDemo)
        return null;
    const profile = teaching.business;
    const pack = currentGamePack();
    if (profile?.free) {
        if (pack && pack.revealed < 5)
            return () => businessPrimary(profile);
        if (profile.free.exiting)
            return () => sendBusiness({ type: "exit-free", revision: profile.revision });
        return profile.free.completed < profile.free.quantity ? () => open() : null;
    }
    if (profile) {
        const task = profile.live?.task;
        if (!task || task.completed >= task.order.quantity)
            return null;
        if (task.pack?.pending && task.pack.revealed === 5 && !settings.skipTools)
            return "tools";
        return () => task.pack?.pending || (pack && nextRevealSlot(pack) !== null) ? businessPrimary(profile) : open();
    }
    const view = teachingView(teaching);
    return view.phase === "live" && !view.shipment && view.completed < teachingRarities.length ? () => view.completed === view.opened ? open() : teachingPrimary() : null;
}
function refreshPlayControls() {
    primary.dataset.longLabel = String((primary.textContent ?? "").replace(/\s/g, "").length > 5);
    const active = liveRunning() || !!teaching.business?.free;
    const button = element("auto-pack");
    element("play-controls").hidden = !active;
    button.disabled = !ready || !!teaching.business?.free?.exiting || !autoStep();
    button.textContent = auto ? "停止自动" : "自动拆卡";
    button.setAttribute("aria-label", auto ? "停止自动拆卡" : "自动拆卡");
    button.setAttribute("aria-pressed", String(auto));
    const odds = element("show-odds");
    odds.disabled = !(currentGamePack() || teaching.business?.live?.task || teaching.business?.live?.rewards.length || teaching.business?.free);
    element("live-odds").disabled = odds.disabled;
    element("live-items").disabled = tools.hidden;
    element("live-effects").disabled = settlement.hidden && !teaching.business?.live?.rewards.length;
    if (active && !history.state?.ssrLive)
        history.pushState({ ssrLive: true }, "");
}
function scheduleAuto() {
    presentation.setPaused(!!document.querySelector("dialog[open]"));
    clearTimeout(autoTimer);
    if (!ready)
        return;
    const current = isDemo ? pack : currentGamePack();
    const revealing = nextRevealSlot(current) !== null;
    if (revealing || busy)
        primary.disabled = true;
    skip.hidden = !revealing && !busy;
    if (revealing) {
        skip.hidden = false;
        primary.textContent = `自动翻卡 ${current.revealed} / ${current.cards.length}`;
    }
    if (!revealing && (isDemo || (!auto && !teaching.business?.free?.exiting))) {
        skip.hidden = true;
        if (!isDemo)
            refreshPlayControls();
        return;
    }
    if (busy || document.hidden || liveDrawer.dialog.open || pauseMenu.open || settingsMenu.open || oddsMenu.open ||
        archiveMenu.open || cardDetails.open || growth.open || market.open)
        return;
    const next = revealing ? () => {
        const latest = isDemo ? pack : currentGamePack();
        if (!latest || latest.id !== current?.id || nextRevealSlot(latest) === null)
            return;
        if (isDemo)
            void commit({ type: "reveal", id: latest.id, slot: latest.revealed });
        else if (teaching.business)
            businessPrimary(teaching.business);
        else
            teachingPrimary();
    } : autoStep();
    if (next === "tools") {
        auto = false;
        instruction.textContent = "自动拆卡暂停：请使用道具或选择不使用。";
        refreshPlayControls();
        return;
    }
    if (!next) {
        auto = false;
        refreshPlayControls();
        return;
    }
    if (!isDemo)
        refreshPlayControls();
    autoTimer = window.setTimeout(() => {
        if (ready && !busy && !document.hidden && !liveDrawer.dialog.open && !pauseMenu.open && !settingsMenu.open && !oddsMenu.open &&
            !archiveMenu.open && !cardDetails.open && !growth.open && !market.open)
            next();
    }, revealing ? (presentation.skipped(current.id) ? 0 : Math.max(80, revealDue - performance.now())) : 580);
}
element("auto-pack").onclick = () => { auto = !auto; scheduleAuto(); };
function showPause() {
    presentation.setPaused(true);
    if (!ready || isDemo || !teaching || !(liveRunning() || teaching.business?.free) || pauseMenu.open)
        return;
    clearTimeout(autoTimer);
    const profile = teaching.business;
    const canStop = profile ? !!profile.live && !profile.live.task && !profile.live.report : !!teachingView(teaching).shipment;
    element("pause-stop").disabled = !canStop;
    element("pause-message").textContent = canStop ? "继续游玩，或结束直播并结算。"
        : profile?.free ? "继续当前自由拆卡进度。" : "本单尚未完成，请继续履约后再下播。";
    pauseMenu.showModal();
}
element("pause-play").onclick = showPause;
pauseMenu.onclose = scheduleAuto;
element("pause-stop").onclick = () => {
    auto = false;
    pauseMenu.close();
    if (teaching.business)
        businessPrimary(teaching.business);
    else
        teachingPrimary();
};
function showSettings() {
    presentation.setPaused(true);
    if (settingsMenu.open)
        return;
    clearTimeout(autoTimer);
    const list = element("settings-list");
    list.replaceChildren();
    if (ready && shell.dataset.screen === "home") {
        const resources = document.createElement("p");
        resources.textContent = `体力 ${teaching.stamina.current}/${rules.stamina.max}，未拆库存 ${element("inventory").textContent}`;
        list.append(resources);
    }
    const toggles = [
        ["music", "背景音乐"], ["packSound", "拆包与翻卡音效"], ["rewardSound", "稀有卡与礼物音效"],
        ["vibration", "震动"], ["reduceFlash", "减少闪光"], ["giftBanner", "礼物短提示"], ["skipTools", "自动拆卡跳过道具"],
    ];
    for (const [key, label] of toggles) {
        const row = document.createElement("label");
        row.textContent = label;
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = settings[key];
        input.onchange = () => {
            settings[key] = input.checked;
            if (key === "reduceFlash" && input.checked)
                scene?.stopUr();
            if (key === "giftBanner" && !input.checked)
                element("gift-banner").hidden = true;
            saveSettings();
        };
        row.append(input);
        list.append(row);
    }
    const row = document.createElement("label");
    row.textContent = "自动暂停品级";
    const select = document.createElement("select");
    select.add(new Option("关闭", "off"));
    for (const grade of RARITIES.slice(2))
        select.add(new Option(grade + " 或以上", grade));
    select.value = settings.pauseAt;
    select.onchange = () => { settings.pauseAt = select.value; saveSettings(); };
    row.append(select);
    list.append(row);
    settingsMenu.showModal();
}
element("open-settings").onclick = showSettings;
element("pause-settings").onclick = showSettings;
element("live-settings").onclick = showSettings;
element("live-odds").onclick = () => element("show-odds").click();
settingsMenu.onclose = scheduleAuto;
oddsMenu.onclose = scheduleAuto;
growth.onclose = scheduleAuto;
market.onclose = scheduleAuto;
archiveMenu.onclose = scheduleAuto;
cardDetails.onclose = () => { clearDetailTilt?.(); clearDetailTilt = undefined; scheduleAuto(); };
document.addEventListener("visibilitychange", () => {
    scheduleAuto();
    syncMusic();
});
window.addEventListener("popstate", () => {
    if (!ready || isDemo)
        return;
    const dialog = [cardDetails, archiveMenu, settingsMenu, oddsMenu, growth, market, startConfirm, checkInMenu, dailyMenu, homeBenefits, liveDrawer.dialog].find(item => item.open);
    if (!dialog && !(liveRunning() || teaching.business?.free))
        return;
    if (!history.state?.ssrLive)
        history.pushState({ ssrLive: true }, "");
    if (dialog)
        dialog.close();
    else if (pauseMenu.open)
        pauseMenu.close();
    else
        showPause();
});
function showOdds() {
    clearTimeout(autoTimer);
    const list = element("odds-list");
    list.replaceChildren();
    const profile = teaching.business;
    const task = profile?.live?.task;
    const pack = task?.pack ?? profile?.free?.pack;
    const theme = themeFor(task?.order.themeId ?? profile?.free?.themeId ?? rules.starter.id);
    const add = (label, values, scale) => {
        const stage = document.createElement("section");
        stage.className = "odds-stage";
        const heading = document.createElement("h3");
        heading.textContent = label;
        const rates = document.createElement("div");
        rates.className = "odds-stage-rates";
        values.forEach((value, index) => {
            const cell = document.createElement("div");
            cell.dataset.rarity = RARITIES[index];
            const grade = document.createElement("span");
            grade.textContent = RARITIES[index];
            const amount = document.createElement("b");
            amount.textContent = `${(value / scale).toFixed(2)}%`;
            cell.append(grade, amount);
            rates.append(cell);
        });
        stage.append(heading, rates);
        list.append(stage);
    };
    const note = document.createElement("p");
    if (!profile) {
        const index = teachingView(teaching).opened;
        note.textContent = `教学前三包的第 5 张按 SR、SSR、UR 保底；前 4 张仅在 N/R 中按比例抽取。当前教学进度 ${index}/3。`;
        list.append(note);
    }
    else {
        const stages = pack?.odds ?? drawOddsStages(theme, profile.live?.rewards ?? [], { ranks: profile.ranks, owned: profile.owned });
        add("基础概率", stages.base, 100);
        add("应用永久加点后", stages.permanent, 100);
        add("再应用成套加成后", stages.collection, 100);
        add("再应用局内增益后", stages.live, 100);
        if (pack?.odds) {
            if (pack.odds.guarantee)
                note.textContent = pack.odds.guarantee + "。";
            note.textContent += "逐张实际概率只在对应卡揭晓后显示，升品不改原抽取概率。";
            list.append(note);
            pack.odds.slots.slice(0, pack.revealed).forEach((values, index) => add(`第 ${index + 1} 张实际概率`, values, 1));
        }
        else {
            note.textContent = pack ? "此包没有保存逐卡快照，以上显示当前能力下的概率。"
                : "逐卡概率在锁包后受金包、余辉和指定券影响；指定券仅作用第 5 张。";
            list.append(note);
        }
        if (profile.live?.rewards.length) {
            const effects = document.createElement("details");
            const heading = document.createElement("summary");
            heading.textContent = "本场增益记录";
            effects.append(heading);
            for (const reward of profile.live.rewards) {
                const row = document.createElement("p");
                row.textContent = describeTeachingReward(reward) + (profile.live.spentCoupons?.includes(reward.id) ? "（已使用）" : "");
                effects.append(row);
            }
            list.append(effects);
        }
    }
    oddsMenu.showModal();
}
element("show-odds").onclick = showOdds;
element("live-pack-details").onclick = showOdds;
function updateTeachingClock() {
    if (busy)
        return;
    const now = gameNow();
    const recovery = teaching.stamina.nextRecoveryAt;
    const day = beijingDay(now);
    if ((recovery !== null && now >= recovery) || day > teaching.daily.date)
        void commitTeaching();
    else
        renderStamina(now);
}
gesture.onpointerdown = event => {
    if (!ready || !canTear || busy)
        return;
    unlockSound();
    if (presentation.pointerDown(event))
        gesture.setPointerCapture(event.pointerId);
};
gesture.onpointermove = event => {
    if (!ready || !canTear || busy)
        return;
    presentation.pointerMove(event);
};
gesture.onpointerup = event => presentation.pointerEnd(event);
gesture.onpointercancel = event => presentation.pointerEnd(event, true);
gesture.onlostpointercapture = event => presentation.pointerEnd(event, true);
sound.onclick = () => {
    settings.packSound = settings.rewardSound = !(settings.packSound || settings.rewardSound);
    saveSettings();
};
updateSoundButton();
skip.onclick = () => {
    const current = isDemo ? pack : currentGamePack();
    if (!current)
        return;
    presentation.skip(current.id);
    revealDue = 0;
    scene.stopUr();
    scheduleAuto();
};
element("retry").onclick = () => location.reload();
function showSaveRecovery() {
    element("save-warning").hidden = false;
}
function blockCloud(error) {
    ready = false;
    auto = false;
    clearTimeout(autoTimer);
    presentation.clear();
    syncMusic();
    cloud?.suspend();
    primary.disabled = true;
    canTear = false;
    gesture.dataset.enabled = "false";
    const platform = element("platform-status");
    shell.append(platform);
    platform.hidden = false;
    element("platform-note").textContent = error instanceof Error ? error.message : "云档暂不可用。";
    element("reward-ad").hidden = true;
    element("platform-share").hidden = true;
    element("reward-share").hidden = true;
    element("platform-retry").hidden = false;
    element("platform-takeover").hidden = !(error instanceof PlatformFailure && error.conflict);
    const content = document.querySelector("main");
    content?.querySelectorAll("button, input, select").forEach(item => {
        if (!item.closest("#platform-status"))
            item.setAttribute("disabled", "");
    });
    if (growth.open)
        growth.close();
    if (market.open)
        market.close();
    if (startConfirm.open)
        startConfirm.close();
    for (const dialog of [cardDetails, archiveMenu, pauseMenu, settingsMenu, oddsMenu, checkInMenu, dailyMenu, homeBenefits, liveDrawer.dialog])
        if (dialog.open)
            dialog.close();
}
async function cloudStart(takeover = false) {
    if (busy)
        return;
    busy = true;
    try {
        const tap = currentTap();
        if (!tap)
            throw new PlatformFailure("请在 TapTap H5 容器中打开此版本，联网后才能进入游戏。");
        cloud ?? (cloud = new TapCloud(db, tap));
        teaching = await cloud.sync(takeover);
        ready = true;
        element("platform-status").hidden = false;
        element("platform-note").textContent = cloud.status;
        element("platform-retry").hidden = true;
        element("platform-takeover").hidden = true;
        document.querySelector("main")?.querySelectorAll("button, input, select").forEach(item => item.removeAttribute("disabled"));
        document.querySelector(".home-mail").disabled = true;
    }
    catch (error) {
        blockCloud(error);
    }
    finally {
        busy = false;
        if (ready) {
            renderTeaching();
            scheduleAuto();
            syncMusic();
        }
    }
}
element("platform-retry").onclick = () => void cloudStart();
element("platform-takeover").onclick = () => {
    if (window.confirm("从最新云档继续？此设备尚未同步的进度会被保留用于核对。"))
        void cloudStart(true);
};
window.addEventListener("offline", () => {
    if (requireCloud)
        blockCloud(new PlatformFailure("网络已断开，重新联网后核对云档。"));
});
window.addEventListener("online", () => { if (requireCloud)
    void cloudStart(); });
async function start() {
    scene = await createScene(element("table-art"), () => { });
    db = await openPackStore();
    if (isDemo) {
        showScreen("demo");
        pack = await transactPack(db);
        element("mode-label").textContent = "拆卡试玩";
        element("edition").textContent = "01 / 01";
        element("pack-title").textContent = "猫猫来信 · 样包 01";
        element("footer-note").hidden = false;
        element("footer-note").textContent = "试玩进度自动保存";
        ready = true;
        render();
        scheduleAuto();
        syncMusic();
    }
    else {
        if (requireCloud) {
            await cloudStart();
            setInterval(() => {
                if (!cloud?.available || !ready || busy)
                    return;
                void cloud.tick().then(state => {
                    if (state && ready && !busy) {
                        teaching = state;
                        element("platform-note").textContent = cloud.status;
                        renderTeaching();
                    }
                }).catch(blockCloud);
            }, 1000);
        }
        else {
            teaching = await transactTeaching(db, undefined, gameNow(), showSaveRecovery);
            ready = true;
            renderTeaching();
            scheduleAuto();
            syncMusic();
        }
        setInterval(() => { if (ready) {
            updateTeachingClock();
            void settleExternalReward();
        } }, 1000);
    }
}
void start().catch(showError);
