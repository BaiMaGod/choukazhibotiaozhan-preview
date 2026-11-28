import { rules } from "./generated-rules.js";
import { revealNext } from "./pack.js";
import { isTeachingReward, lockTeachingPack, teachingOrder, teachingRarities, teachingShipment } from "./teaching-rules.js";
import { validInteractionGroups } from "./audience-events.js";
export function beijingDay(now) {
    return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
export function recoverClock(state, now) {
    const date = beijingDay(now);
    const daily = date > state.daily.date ? { date, packIds: [] } : state.daily;
    const previous = state.stamina;
    let stamina = previous;
    if (previous.nextRecoveryAt !== null && now >= previous.nextRecoveryAt) {
        const periods = 1 + Math.floor((now - previous.nextRecoveryAt) / rules.stamina.periodMs);
        const current = Math.min(rules.stamina.max, previous.current + periods);
        const nextRecoveryAt = current < rules.stamina.max ? previous.nextRecoveryAt + periods * rules.stamina.periodMs : null;
        stamina = { current, nextRecoveryAt };
    }
    return stamina === previous && daily === state.daily ? state : { ...state, stamina, daily };
}
export function teachingView(state) {
    const b = state.broadcast;
    const packs = b?.packs ?? [];
    const completed = packs.filter(pack => pack.settledAt !== null);
    const pack = packs[packs.length - 1] ?? null;
    const shipment = b?.shipment ?? null;
    const settlement = b?.settlement ?? null;
    const interactions = completed.map(pack => pack.interaction);
    const currentAudience = pack?.interaction;
    const audienceGiftMilli = interactions.reduce((sum, item) => sum + item.giftMilli, 0);
    const giftGrossMilli = audienceGiftMilli + (shipment?.giftMilli ?? 0);
    const naturalFans = interactions.reduce((sum, item) => sum + item.newFans, 0);
    const opened = packs.length;
    const inventory = (b?.startingPacks ?? state.opening.packs) - opened;
    const phase = !b || b.acknowledged ? "home" : settlement ? "summary" : "live";
    return {
        phase, pack, opened, inventory, shipment, settlement, completed: completed.length,
        reserved: b && !shipment ? teachingRarities.length - opened : 0,
        wallet: state.opening.grant - state.opening.spent + (shipment?.saleGold ?? 0) +
            (shipment?.systemGold ?? 0) + (settlement?.giftNetGold ?? 0),
        heat: interactions.reduce((sum, item) => sum + item.heat, 0),
        comments: interactions.reduce((sum, item) => sum + item.comments, 0),
        naturalFans, fans: naturalFans + (shipment?.fans ?? 0),
        online: currentAudience ? currentAudience.oldFans + currentAudience.visitors : rules.audience.opening_new_visitors,
        giftCount: interactions.reduce((sum, item) => sum + item.gifts, 0) + (shipment?.sunglasses ?? 0),
        giftGrossMilli,
        dailyPendingGold: rules.dailyMilestones.reduce((sum, [threshold, amount]) => sum + (state.daily.packIds.length >= threshold ? amount : 0), 0),
        mainReached: packs.some(item => item.cards.slice(0, item.revealed).some(card => card.rarity === "SSR" || card.rarity === "UR")),
        bonusReached: packs.some(item => item.cards.slice(0, item.revealed).some(card => card.rarity === "UR")),
        seenCards: Array.from(new Map(completed.flatMap(item => item.cards).map(card => [card.id, card])).values()),
    };
}
export function spendStamina(stamina, now) {
    return { current: stamina.current - rules.stamina.spend, nextRecoveryAt: stamina.nextRecoveryAt ?? now + rules.stamina.periodMs };
}
export function applyTeachingAction(state, action, now) {
    state = recoverClock(state, now);
    if (!action)
        return state;
    const b = state.broadcast;
    if (action.type === "start") {
        if (b || state.stamina.current < rules.stamina.spend || !action.id || state.opening.packs < teachingRarities.length)
            return state;
        return {
            ...state,
            stamina: spendStamina(state.stamina, now),
            broadcast: { id: action.id, startingPacks: state.opening.packs, packs: [], shipment: null, settlement: null, acknowledged: false },
        };
    }
    if (!b || b.id !== action.broadcastId)
        return state;
    if (action.type === "home") {
        return b.settlement && !b.acknowledged ? { ...state, broadcast: { ...b, acknowledged: true } } : state;
    }
    if (b.settlement)
        return state;
    const view = teachingView(state);
    switch (action.type) {
        case "open": {
            if (b.shipment || action.index !== b.packs.length || action.index >= teachingRarities.length ||
                view.inventory < 1 || view.completed !== view.opened || !isUnsigned(action.seed, 0xffffffff))
                return state;
            const id = `${b.id}/teaching-pack/${action.index + 1}`;
            const pack = lockTeachingPack(id, action.index, action.seed, b.packs.map(item => item.reward), view.pack?.interaction, view.naturalFans, view.heat);
            return { ...state, broadcast: { ...b, packs: [...b.packs, pack] } };
        }
        case "reveal": {
            if (!view.pack || action.packId !== view.pack.id || view.pack.settledAt !== null)
                return state;
            const next = revealNext(view.pack, action.slot);
            if (next === view.pack)
                return state;
            const settled = next.revealed === next.cards.length;
            if (settled)
                next.settledAt = now;
            const packs = [...b.packs.slice(0, -1), next];
            const daily = settled ? { ...state.daily, packIds: [...state.daily.packIds, next.id] } : state.daily;
            return { ...state, daily, broadcast: { ...b, packs } };
        }
        case "ship": {
            if (b.shipment || view.completed !== teachingRarities.length || !view.mainReached || !view.bonusReached)
                return state;
            const lockedBuffs = b.packs.slice(0, -1).map(item => item.reward);
            return { ...state, broadcast: { ...b, shipment: teachingShipment(lockedBuffs) } };
        }
        case "stop": {
            if (!b.shipment)
                return state;
            const giftNetGold = Math.floor(view.giftGrossMilli * rules.giftShareBps / 10000000);
            return { ...state, broadcast: { ...b, settlement: { giftNetGold } } };
        }
    }
}
export function isUnsigned(value, max = Number.MAX_SAFE_INTEGER) {
    return Number.isSafeInteger(value) && value >= 0 && value <= max;
}
function validPack(pack, id, index, last) {
    return !!pack && pack.id === `${id}/teaching-pack/${index + 1}` && isUnsigned(pack.seed, 0xffffffff) &&
        Array.isArray(pack.cards) && pack.cards.length === 5 &&
        pack.cards.every((card, slot) => !!card && typeof card.id === "string" && typeof card.name === "string" &&
            (slot === 4 ? card.rarity === teachingRarities[index] : card.rarity === "N" || card.rarity === "R")) &&
        isUnsigned(pack.revealed, pack.cards.length) &&
        (pack.revealed === pack.cards.length ? isUnsigned(pack.settledAt ?? -1) : last && pack.settledAt === null) &&
        isTeachingReward(pack.reward) && pack.reward.id === `${pack.id}/4/reward` && pack.reward.rarity === teachingRarities[index] &&
        !!pack.interaction && ["oldFans", "visitors", "newFans", "comments", "gifts", "giftMilli", "heat"]
        .every(key => isUnsigned(pack.interaction[key])) && validInteractionGroups(pack.interaction);
}
function validShipment(shipment) {
    return !!shipment && ["saleGold", "sunglasses", "giftMilli", "systemGold", "fans"]
        .every(key => isUnsigned(shipment[key]));
}
export function readTeaching(value, now, allowBusinessPacks = false) {
    if (value === undefined) {
        return {
            schema: 1,
            opening: { grant: teachingOrder.openingGold, spent: rules.starter.cost * teachingOrder.starterPacks, packs: teachingOrder.starterPacks },
            stamina: { current: rules.stamina.initial, nextRecoveryAt: null },
            daily: { date: beijingDay(now), packIds: [] },
            broadcast: null,
        };
    }
    const state = value;
    if (state?.schema === 1 && state.opening &&
        isUnsigned(state.opening.grant) && isUnsigned(state.opening.spent, state.opening.grant) && isUnsigned(state.opening.packs) &&
        state.stamina && isUnsigned(state.stamina.current, rules.stamina.max) &&
        (state.stamina.current === rules.stamina.max ? state.stamina.nextRecoveryAt === null : isUnsigned(state.stamina.nextRecoveryAt ?? -1)) &&
        state.daily && typeof state.daily.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(state.daily.date) && Array.isArray(state.daily.packIds)) {
        const b = state.broadcast;
        if (b === null && state.daily.packIds.length === 0)
            return state;
        if (b && typeof b.id === "string" && b.id && b.startingPacks === state.opening.packs &&
            Array.isArray(b.packs) && b.packs.length <= Math.min(teachingRarities.length, b.startingPacks) &&
            b.packs.every((pack, index) => validPack(pack, b.id, index, index === b.packs.length - 1)) &&
            new Set(state.daily.packIds).size === state.daily.packIds.length &&
            state.daily.packIds.every(id => typeof id === "string" && (b.packs.some(pack => pack.id === id && pack.settledAt !== null) ||
                (allowBusinessPacks && /(?:\/orders\/\d+|\/free)\/\d+\/pack\/[1-3]$/.test(id)))) &&
            (b.shipment === null || (b.packs.length === teachingRarities.length && b.packs.every(pack => pack.settledAt !== null) &&
                validShipment(b.shipment))) &&
            (b.settlement === null || (b.shipment && b.settlement && isUnsigned(b.settlement.giftNetGold))) &&
            typeof b.acknowledged === "boolean" && (!b.acknowledged || b.settlement)) {
            return state;
        }
    }
    throw new Error("教学存档无法读取，已保留原记录。");
}
