import { rewardAllowed, rewardValid } from "./rewards.js";
import { addHeatSources, heatInteger, heatNumber } from "./heat.js";
import { rules } from "./generated-rules.js";
import { revealNext, RARITIES } from "./pack.js";
import { generateOrders, lockDraw, starterStock, themeFor, totalStock } from "./order-rules.js";
import { isUnsigned, spendStamina, teachingView } from "./teaching.js";
import { giftValueMilli, isTeachingReward, randomReward, seededRandom, teachingBuff, weightedIndex } from "./teaching-rules.js";
import { canUpgrade, finalCards, goalProgress, guaranteeFor, heldCoupons, quoteChallenge, resolveOrderPack, updateChallengeEstimate } from "./challenges.js";
import { collectCopies, effectiveRank, hasSet, nativeCard, rank, recordSeen, refundedCoupon, signInAmounts, talentNode, talentOffer } from "./growth.js";
function createProfile(state) {
    const view = teachingView(state);
    return {
        revision: 0, wallet: view.wallet, fans: view.fans, peakFans: view.fans,
        stock: starterStock(view.inventory), seen: view.seenCards, live: null,
    };
}
export function prepareBusiness(state) {
    return !state.business && state.broadcast?.acknowledged
        ? { ...state, business: createProfile(state) }
        : state;
}
function refresh(live, profile, count, random, afterTeaching = false) {
    const round = live.round + 1;
    const slots = Math.min(count, rules.orders.limit - live.candidates.length);
    const drafts = generateOrders(live.id, round, slots, profile.stock, profile.peakFans, live.rewards, random, profile.ranks);
    const context = { ...live, audience: live.audience ?? undefined, fans: profile.fans,
        ranks: profile.ranks, owned: profile.owned, seen: Object.fromEntries(profile.seen.map(card => [card.id, 1])) };
    const spent = live.spentCoupons ?? [];
    const retained = live.candidates.map((order, index) => updateChallengeEstimate(order, themeFor(order.themeId), context, spent, Math.imul(round, 0x531a) ^ index));
    let hasEasy = retained.some(order => !order.challenge || order.challenge.band === 0);
    const next = drafts.map((order, index) => {
        const type = !hasEasy ? 0 : afterTeaching ? index : weightedIndex(rules.challenges.types, random);
        const candidate = type === 0 ? order : quoteChallenge(order, themeFor(order.themeId), type === 2, context, spent, random);
        hasEasy || (hasEasy = !candidate.challenge || candidate.challenge.band === 0);
        return candidate;
    });
    return { ...live, round, candidates: [...retained, ...next] };
}
export function recentRareCards(cards) {
    return cards.filter(card => card.rarity === "SSR" || card.rarity === "UR").slice(-5);
}
function newLive(id, startingStock, openingFans) {
    return {
        id, startingStock: { ...startingStock }, openingFans, candidates: [], round: 0, task: null, rewards: [], audience: null,
        grossMilli: 0, giftCount: 0, heat: 0, comments: 0, visits: rules.audience.opening_new_visitors +
            Math.floor(openingFans * rules.audience.opening_follower_ratio), shipped: 0, saleGold: 0, removedGold: 0, report: null,
    };
}
function continueTeaching(state, command) {
    const b = state.broadcast;
    if (state.business || !b?.shipment || b.settlement || b.id !== command.broadcastId || !isUnsigned(command.seed, 0xffffffff))
        return state;
    const view = teachingView(state);
    const profile = createProfile(state);
    const live = {
        ...newLive(b.id, starterStock(b.startingPacks), 0),
        rewards: b.packs.map(pack => pack.reward), audience: view.pack?.interaction ?? null,
        featuredCards: recentRareCards(b.packs.flatMap(pack => pack.cards)),
        grossMilli: view.giftGrossMilli, giftCount: view.giftCount, heat: view.heat, comments: view.comments,
        shipped: 1, saleGold: b.shipment.saleGold,
        visits: rules.audience.opening_new_visitors + b.packs.reduce((sum, pack) => sum + (pack.interaction.arrivals ?? 0), 0),
        heatSources: b.packs.reduce((sources, pack) => addHeatSources(sources, pack.interaction.heatSources, 0n, heatInteger(pack.interaction.heat, pack.interaction.heatExact)), undefined),
    };
    return { ...state, business: { ...profile, live: refresh(live, profile, 3, seededRandom(command.seed), true) } };
}
export function availableStock(profile, themeId) {
    const task = profile.live?.task;
    if (!task || task.order.themeId !== themeId)
        return profile.stock[themeId];
    const locked = task.pack && (task.pack.pending || task.pack.revealed < task.pack.cards.length) ? 1 : 0;
    return profile.stock[themeId] - (task.order.quantity - task.completed - locked);
}
function finishLive(profile, live) {
    const giftNet = Math.floor(live.grossMilli * rules.giftShareBps / 10000000);
    return { ...profile, wallet: profile.wallet + giftNet, live: { ...live, candidates: [], report: { giftNet } } };
}
export function removalFee(order) {
    return order.selfOpen ? themeFor(order.themeId).cost * order.quantity : order.payment;
}
export function candidateRemovalSealed(live) {
    return !!live.task && live.task.completed === live.task.order.quantity;
}
export function challengeProgress(live, task) {
    return task.order.challenge?.goal.kind === "heat"
        ? heatInteger(live.heat, live.heatExact) - heatInteger(task.baselineHeat ?? live.heat, task.baselineHeatExact)
        : BigInt(task.progress ?? 0);
}
function settleChallenge(profile, live, task, seed) {
    const { order } = task;
    const contract = order.challenge;
    if (!contract)
        return [profile, live];
    const theme = themeFor(order.themeId);
    const goal = contract.goal;
    const target = goal.kind === "heat" ? heatInteger(goal.target, goal.exactTarget) : BigInt(goal.target);
    const success = challengeProgress(live, task) >= target;
    const result = { success, gold: 0, fine: 0, glasses: 0, lostFans: 0, refundedMilli: 0 };
    if (success) {
        const rewards = task.pack?.openingRewards === undefined
            ? live.rewards.filter(reward => !task.pack?.rewards.some(item => item.id === reward.id))
            : live.rewards.slice(0, task.pack.openingRewards);
        const effective = (slot) => effectiveRank(profile.ranks, "challenge", slot);
        const extra = seededRandom(seed ^ 0x22b1)() < .02 * effective("chance") ? 2 : 0;
        const permanent = 1 + .05 * effective("synergy");
        const multiplier = permanent + teachingBuff(rewards, "success_mult");
        const baseGold = effective("value") + extra;
        result.gold = Math.min(order.quantity * rules.caps.challenge_gold_per_pack, Math.floor(order.quantity * (baseGold + teachingBuff(rewards, "success_flat")) * multiplier), Math.floor(order.quantity * baseGold * permanent) + Math.floor(order.quantity * theme.cost * rules.caps.local_system_gold_cost_ratio));
        result.glasses = contract.glasses;
        const gained = Math.min(order.quantity * rules.caps.challenge_fans_per_pack, Math.floor(order.quantity * (2 + effective("base") + extra + teachingBuff(rewards, "fans_flat")) * multiplier));
        const fans = profile.fans + gained;
        return [{ ...profile, wallet: profile.wallet + result.gold, fans, peakFans: Math.max(fans, profile.peakFans) },
            { ...live, giftCount: live.giftCount + result.glasses,
                grossMilli: live.grossMilli + result.glasses * giftValueMilli(1, rewards, profile.ranks), challengeResult: result }];
    }
    if (profile.wallet >= contract.fine) {
        result.fine = contract.fine;
        return [{ ...profile, wallet: profile.wallet - result.fine }, { ...live, challengeResult: result }];
    }
    result.lostFans = Math.min(profile.fans, Math.max(5, Math.ceil(profile.fans * .05)) + 2 * order.quantity);
    result.refundedMilli = live.grossMilli;
    return [{ ...profile, fans: profile.fans - result.lostFans },
        { ...live, grossMilli: 0, challengeResult: result, candidates: [], report: { giftNet: 0 } }];
}
export function applyBusiness(state, action, now) {
    if (action.type === "continue")
        return continueTeaching(state, action);
    const profile = state.business;
    if (!profile || action.revision !== profile.revision)
        return state;
    const live = profile.live;
    const save = (business, daily = state.daily) => ({ ...state, daily, business: { ...business, revision: profile.revision + 1 } });
    if (action.type === "reserve-reward" || action.type === "finish-reward") {
        const external = profile.external ?? { days: {}, live: {}, deferred: [] };
        const pending = external.pending;
        if (action.type === "reserve-reward") {
            if (!action.id || !action.session || !["ad", "share"].includes(action.source) ||
                !isUnsigned(action.seed, 0xffffffff) || profile.free || live?.report || live?.task ||
                (pending && pending.session === action.session && rewardValid(pending, now)))
                return state;
            const liveId = live?.id ?? null;
            if (!rewardAllowed(external, state.daily.date, liveId, action.source))
                return state;
            return save({ ...profile, external: { ...external, pending: { id: action.id, session: action.session,
                        createdAt: now, day: state.daily.date, liveId, seed: action.seed, source: action.source } } });
        }
        if (!pending || pending.id !== action.id || pending.session !== action.session)
            return state;
        const cleared = { ...external, pending: undefined };
        if (!action.succeeded || !rewardValid(pending, now) || !rewardAllowed(external, pending.day, pending.liveId, pending.source)) {
            return save({ ...profile, external: cleared });
        }
        const daily = external.days[pending.day] ?? { coins: 0, ads: 0 };
        const liveDay = pending.liveId ? (external.live[pending.liveId] ?? { ads: 0, shares: 0 }) : undefined;
        const ad = pending.source === "ad";
        const days = Object.fromEntries(Object.entries(external.days).filter(([day]) => day >= state.daily.date || day === pending.day));
        days[pending.day] = { ads: daily.ads + Number(ad), coins: daily.coins + Number(ad && !pending.liveId),
            shares: (daily.shares ?? 0) + Number(!ad) };
        const liveCounts = pending.liveId && liveDay ? { [pending.liveId]: {
                ads: liveDay.ads + Number(ad), shares: liveDay.shares + Number(!ad),
            } } : external.live;
        const next = { ...cleared, days, live: { ...external.live, ...liveCounts } };
        if (!pending.liveId)
            return save({ ...profile, external: next, wallet: profile.wallet + (ad ? 40 : 20) });
        const reward = randomReward(pending.id, "SR", pending.seed, []);
        if (!live || live.report || live.id !== pending.liveId) {
            return save({ ...profile, external: { ...next, deferred: [...next.deferred, reward] } });
        }
        return save({ ...profile, external: next, live: { ...live, rewards: [...live.rewards, reward] } });
    }
    if (action.type === "claim-milestone") {
        if (live || profile.free)
            return state;
        const theme = action.themeId === undefined ? undefined : themeFor(action.themeId);
        if (action.themeId !== undefined && !theme)
            return state;
        const tiers = theme ? rules.collectionMilestones : rules.dailyMilestones;
        const tier = tiers.find(item => item[0] === action.threshold);
        if (!tier)
            return state;
        if (theme) {
            const claimed = profile.collectionClaims?.[theme.id] ?? [];
            const count = theme.cards.filter(card => !!profile.owned?.[card.id]).length;
            if (claimed.includes(tier[0]) || count < tier[0])
                return state;
            return save({ ...profile, wallet: profile.wallet + tier[1],
                collectionClaims: { ...profile.collectionClaims, [theme.id]: [...claimed, tier[0]] } });
        }
        const claimed = profile.dailyClaims?.day === state.daily.date ? profile.dailyClaims.tiers : [];
        if (claimed.includes(tier[0]) || state.daily.packIds.length < tier[0])
            return state;
        return save({ ...profile, wallet: profile.wallet + tier[1],
            dailyClaims: { day: state.daily.date, tiers: [...claimed, tier[0]] } });
    }
    if (action.type === "sign-in") {
        if (live || profile.free || profile.signIn?.day === state.daily.date)
            return state;
        const count = profile.signIn?.count ?? 0;
        return save({ ...profile, signIn: { day: state.daily.date, count: count + 1 },
            wallet: profile.wallet + signInAmounts[count % signInAmounts.length] });
    }
    if (action.type === "buy-talent") {
        const node = talentNode(action.id);
        if (live || profile.free || !node)
            return state;
        const offer = talentOffer(node, profile.ranks, profile.fans, profile.wallet);
        if (!offer.allowed)
            return state;
        return save({ ...profile, wallet: profile.wallet - offer.price, ranks: { ...profile.ranks, [node.id]: offer.level + 1 } });
    }
    if (action.type === "start-free") {
        const previous = profile.free;
        const theme = themeFor(action.themeId);
        if (live || !theme || !action.id || !isUnsigned(action.quantity, 3) || !action.quantity ||
            profile.stock[theme.id] < action.quantity || (previous && (previous.exiting || previous.completed < previous.quantity)))
            return state;
        const free = { id: previous?.id ?? action.id, themeId: theme.id, batch: (previous?.batch ?? 0) + 1,
            quantity: action.quantity, completed: 0, pack: null, draw: previous?.draw ?? { golden: false, aura: 0 } };
        return save({ ...profile, free });
    }
    if (profile.free) {
        const free = profile.free;
        const theme = themeFor(free.themeId);
        const current = free.pack;
        const locked = !!current && current.revealed < 5;
        const settleFree = (cards, id, next) => save({ ...profile, ...collectCopies(profile, cards, now, "free"), seen: recordSeen(profile.seen, cards), free: next }, { ...state.daily, packIds: [...state.daily.packIds, id] });
        if (action.type === "exit-free") {
            if (!locked)
                return save({ ...profile, free: undefined });
            return free.exiting ? state : save({ ...profile, free: { ...free, exiting: true } });
        }
        if (action.type === "open-free") {
            if (free.exiting || locked || free.completed >= free.quantity || !profile.stock[theme.id] || !isUnsigned(action.seed, 0xffffffff))
                return state;
            const id = `${free.id}/free/${free.batch}/pack/${free.completed + 1}`;
            const { cards, draw, odds } = lockDraw(theme, [], action.seed, undefined, { ranks: profile.ranks, owned: profile.owned, known: profile.owned, state: free.draw }, true);
            return save({ ...profile, stock: { ...profile.stock, [theme.id]: profile.stock[theme.id] - 1 },
                free: { ...free, pack: { id, cards, revealed: 0, odds }, draw } });
        }
        if (action.type === "reveal-free" && locked && current.id === action.packId) {
            const pack = revealNext(current, action.slot);
            if (pack === current)
                return state;
            if (pack.revealed < 5)
                return save({ ...profile, free: { ...free, pack } });
            return settleFree(pack.cards, pack.id, { ...free, pack, completed: free.completed + 1 });
        }
        return state;
    }
    if (action.type === "buy") {
        const theme = themeFor(action.themeId);
        if (live || !theme || profile.peakFans < theme.unlock_fans || !isUnsigned(action.quantity) || action.quantity === 0)
            return state;
        const cost = action.quantity * theme.cost;
        if (cost > profile.wallet || !isUnsigned(cost) || !isUnsigned(totalStock(profile.stock) + action.quantity))
            return state;
        return save({ ...profile, wallet: profile.wallet - cost, stock: { ...profile.stock, [theme.id]: profile.stock[theme.id] + action.quantity } });
    }
    if (action.type === "start-live") {
        if (live || !action.id || state.stamina.current < rules.stamina.spend ||
            !isUnsigned(action.seed, 0xffffffff))
            return state;
        const created = newLive(action.id, profile.stock, profile.fans);
        const external = profile.external;
        if (external)
            created.rewards = external.deferred;
        const next = refresh(created, profile, 3, seededRandom(action.seed));
        return { ...save({ ...profile, live: next, external: external ? {
                    ...external, deferred: [], live: external.pending?.liveId ? Object.fromEntries(Object.entries(external.live).filter(([id]) => id === external.pending?.liveId)) : {},
                } : undefined }), stamina: spendStamina(state.stamina, now) };
    }
    if (!live)
        return state;
    if (action.type === "leave-report")
        return live.report ? save({ ...profile, live: null }) : state;
    if (live.report)
        return state;
    if (action.type === "stop-live")
        return live.task ? state : save(finishLive(profile, live));
    if (action.type === "remove") {
        const order = live.candidates.find(item => item.id === action.id);
        if (!order || live.candidates.length <= 1 || candidateRemovalSealed(live) || !isUnsigned(action.seed, 0xffffffff))
            return state;
        const fee = removalFee(order);
        if (fee > profile.wallet)
            return state;
        const random = seededRandom(action.seed);
        const audience = live.audience;
        const online = audience ? audience.oldFans + audience.visitors : openingAudience(live);
        const comments = random() < rules.orders.removalChance ? Math.min(online, Math.floor(random() * rules.orders.removalMax) + 1) : 0;
        const heat = heatInteger(live.heat, live.heatExact) + BigInt(Math.floor(rules.audience.comment_heat_sqrt * Math.sqrt(comments)) + comments * rank(profile.ranks, "heat", 1, "value"));
        return save({ ...profile, wallet: profile.wallet - fee, live: {
                ...live, candidates: live.candidates.filter(item => item.id !== order.id), removedGold: live.removedGold + fee,
                comments: live.comments + comments, heat: heatNumber(heat), heatExact: String(heat),
                heatSources: addHeatSources(live.heatSources, { removal: String(heat - heatInteger(live.heat, live.heatExact)) }, heatInteger(live.heat, live.heatExact), 0n),
            } });
    }
    const task = live.task;
    if (action.type === "accept") {
        const order = live.candidates.find(item => item.id === action.id);
        if (task || !order || profile.stock[order.themeId] < order.quantity)
            return state;
        return save({ ...profile, live: {
                ...live, candidates: live.candidates.filter(item => item.id !== order.id),
                task: { order, completed: 0, pack: null, baselineHeat: live.heat, baselineHeatExact: live.heatExact },
            } });
    }
    if (!task)
        return state;
    const order = task.order;
    const active = task.pack;
    const theme = themeFor(order.themeId);
    const coupons = heldCoupons(live.rewards, live.spentCoupons);
    const canUseUpgrade = (pack) => pack.cards.some((card, slot) => !pack.upgraded?.includes(slot) && coupons.some(coupon => canUpgrade(card, coupon)));
    if (action.type === "open-order-pack") {
        if (task.completed >= order.quantity || profile.stock[theme.id] <= 0 ||
            (active && (active.pending || active.revealed < active.cards.length)) || !isUnsigned(action.seed, 0xffffffff))
            return state;
        const coupon = action.tool && coupons.find(item => item.id === action.tool?.id);
        const guarantee = coupon && guaranteeFor(theme, coupon, action.tool?.cardId);
        if (action.tool && !guarantee)
            return state;
        const id = `${order.id}/pack/${task.completed + 1}`;
        const { cards, draw, odds } = lockDraw(theme, live.rewards, action.seed, guarantee, {
            ranks: profile.ranks, state: live.draw, owned: profile.owned, known: order.selfOpen ? profile.owned :
                Object.fromEntries(profile.seen.map(card => [card.id, 1])),
        }, true);
        const returned = coupon && refundedCoupon(coupon, profile.ranks, id, seededRandom(action.seed ^ 0x43a0));
        const pending = { seed: action.seed, heat: live.heat };
        const pack = { id, cards, revealed: 0, odds, pending, openingRewards: live.rewards.length, rewards: [], interaction: {
                oldFans: 0, visitors: 0, newFans: 0, comments: 0, gifts: 0, giftMilli: 0, heat: 0,
            } };
        return save({ ...profile, stock: { ...profile.stock, [theme.id]: profile.stock[theme.id] - 1 }, live: {
                ...live, task: { ...task, pack }, draw, rewards: returned ? [...live.rewards, returned] : live.rewards,
                spentCoupons: coupon ? [...(live.spentCoupons ?? []), coupon.id] : live.spentCoupons,
            } });
    }
    const settlePack = (pack) => {
        const cards = finalCards(pack.cards, pack.upgraded);
        const resolved = pack.pending ? resolveOrderPack(pack.id, theme, cards, pack.pending.seed, { ...live, rewards: live.rewards.slice(0, pack.openingRewards ?? live.rewards.length),
            audience: live.audience ?? undefined, fans: profile.fans, ranks: profile.ranks }) : pack;
        const { interaction, rewards } = resolved;
        const fans = profile.fans + interaction.newFans;
        const seen = recordSeen(profile.seen, cards);
        const ownership = order.selfOpen ? collectCopies(profile, cards, now, "live") : undefined;
        const completedSet = ownership && !hasSet(theme, profile.owned) && hasSet(theme, ownership.owned);
        const featured = recentRareCards([...(live.featuredCards ?? []), ...cards]);
        const goal = order.challenge?.goal;
        const progress = goal && goal.kind !== "heat" ? (task.progress ?? 0) + goalProgress(goal, cards, interaction.heat) : undefined;
        const heat = heatInteger(live.heat, live.heatExact) + heatInteger(interaction.heat, interaction.heatExact);
        return save({ ...profile, fans, peakFans: Math.max(profile.peakFans, fans), seen, ...ownership, live: {
                ...live, task: { ...task, progress, pack: { ...pack, rewards, interaction, pending: undefined }, completed: task.completed + 1 },
                audience: interaction, rewards: [...live.rewards, ...rewards], heat: heatNumber(heat), heatExact: String(heat),
                comments: live.comments + interaction.comments, grossMilli: live.grossMilli + interaction.giftMilli,
                giftCount: live.giftCount + interaction.gifts,
                featuredCards: featured.length ? featured : undefined,
                completedSets: completedSet ? [...(live.completedSets ?? []), theme.id] : live.completedSets,
                heatSources: addHeatSources(live.heatSources, interaction.heatSources, heatInteger(live.heat, live.heatExact), heatInteger(interaction.heat, interaction.heatExact)),
                visits: (live.visits ?? 0) + (interaction.arrivals ?? 0),
            } }, { ...state.daily, packIds: [...state.daily.packIds, pack.id] });
    };
    if (action.type === "reveal-order-card") {
        if (!active || action.packId !== active.id)
            return state;
        const pack = revealNext(active, action.slot);
        if (pack === active)
            return state;
        if (pack.revealed === pack.cards.length && (!pack.pending || !canUseUpgrade(pack)))
            return settlePack(pack);
        return save({ ...profile, live: { ...live, task: { ...task, pack } } });
    }
    if (action.type === "upgrade-order-card" || action.type === "finish-order-pack") {
        if (!active?.pending || action.packId !== active.id || active.revealed !== active.cards.length)
            return state;
        if (action.type === "finish-order-pack")
            return settlePack(active);
        const coupon = coupons.find(item => item.id === action.couponId);
        const card = active.cards[action.slot];
        if (!isUnsigned(action.slot, active.cards.length - 1) || !card || !coupon ||
            active.upgraded?.includes(action.slot) || !canUpgrade(card, coupon))
            return state;
        const pack = { ...active, upgraded: [...(active.upgraded ?? []), action.slot] };
        const returned = refundedCoupon(coupon, profile.ranks, `${pack.id}/${action.slot}`, seededRandom(active.pending.seed ^ Math.imul(action.slot + 1, 0x743d)));
        return save({ ...profile, live: { ...live, task: { ...task, pack },
                rewards: returned ? [...live.rewards, returned] : live.rewards,
                spentCoupons: [...(live.spentCoupons ?? []), coupon.id] } });
    }
    if (action.type === "ship-order") {
        if (task.completed !== order.quantity || !isUnsigned(action.seed, 0xffffffff))
            return state;
        const paid = { ...profile, wallet: profile.wallet + order.payment };
        const shipped = live.shipped + Number(!order.selfOpen);
        const [settled, finished] = settleChallenge(paid, {
            ...live, task: null, shipped, saleGold: live.saleGold + order.payment, challengeResult: undefined,
        }, task, action.seed);
        if (finished.report)
            return save({ ...settled, live: finished });
        if (!totalStock(profile.stock))
            return save(finishLive(settled, finished));
        const random = seededRandom(action.seed);
        return save({ ...settled, live: refresh(finished, settled, weightedIndex(rules.orders.refresh, random) + 1, random) });
    }
    return state;
}
export function openingAudience(live) {
    return Math.floor(live.openingFans * rules.audience.opening_follower_ratio) + rules.audience.opening_new_visitors;
}
function validStock(stock) {
    return !!stock && rules.themes.every(theme => isUnsigned(stock[theme.id])) && isUnsigned(totalStock(stock));
}
function validCard(card) {
    return !!card && typeof card.id === "string" && typeof card.name === "string" && RARITIES.includes(card.rarity);
}
function validCollectionCopies(profile) {
    const copies = profile.collectionCopies;
    if (copies === undefined)
        return true;
    return !!copies && typeof copies === "object" && !Array.isArray(copies) && Object.entries(copies).every(([id, entries]) => {
        if (!Array.isArray(entries) || !entries.length || entries.length > (profile.owned?.[id] ?? 0))
            return false;
        const grades = {};
        for (const entry of entries) {
            if (!Array.isArray(entry) || entry.length !== 3 || !RARITIES.includes(entry[0]) ||
                !isUnsigned(entry[1], 8640000000000000) || (entry[2] !== "free" && entry[2] !== "live"))
                return false;
            const count = (grades[entry[0]] ?? 0) + 1;
            if (count > (profile.ownedGrades?.[`${id}/${entry[0]}`] ?? 0))
                return false;
            grades[entry[0]] = count;
        }
        return true;
    });
}
function validOrder(order) {
    return !!order && typeof order.id === "string" && !!themeFor(order.themeId) &&
        isUnsigned(order.quantity, rules.orders.quantities.length) && order.quantity > 0 && isUnsigned(order.payment) &&
        (order.selfOpen ? order.payment === 0 && !!order.challenge : order.payment > 0) &&
        (order.challenge === undefined || validChallenge(order));
}
function validChallenge(order) {
    const challenge = order.challenge;
    if (!challenge || !isUnsigned(challenge.band, 2) || !isUnsigned(challenge.fine) ||
        !isUnsigned(challenge.glasses) || challenge.fine === 0 || !Array.isArray(challenge.tools) ||
        !challenge.tools.every(tool => !!tool && ["grade", "card", "upgrade"].includes(tool.key) &&
            ["SR", "SSR", "UR"].includes(tool.rarity) && Number.isFinite(tool.expected) && tool.expected > 0) ||
        ![challenge.without, challenge.withTools].every(value => Number.isFinite(value) && value >= 0 && value <= 1))
        return false;
    const goal = challenge.goal;
    return !!goal && isUnsigned(goal.target) && goal.target > 0 && ((goal.kind === "heat" && (goal.exactTarget === undefined ||
        /^[1-9]\d*$/.test(goal.exactTarget) && heatNumber(BigInt(goal.exactTarget)) === goal.target)) ||
        (goal.kind === "card" && goal.target === 1 && !!themeFor(order.themeId)?.cards.some(card => card.id === goal.cardId)) ||
        (goal.kind === "count" && RARITIES.includes(goal.rarity) && goal.target <= 5 * order.quantity));
}
function validSources(sources, total) {
    return sources === undefined || (!!sources && typeof sources === "object" && !Array.isArray(sources) &&
        Object.values(sources).every(value => typeof value === "string" && /^\d+$/.test(value)) &&
        Object.values(sources).reduce((sum, value) => sum + BigInt(value), 0n) === total);
}
function validOdds(odds) {
    if (odds === undefined)
        return true;
    const validRow = (row, total) => Array.isArray(row) && row.length === 5 &&
        row.every(value => Number.isFinite(value) && value >= 0) &&
        Math.abs(row.reduce((sum, value) => sum + value, 0) - total) < 1e-8;
    return !!odds && [odds.base, odds.permanent, odds.collection, odds.live].every(row => validRow(row, 10000)) &&
        Array.isArray(odds.slots) && odds.slots.length === 5 && odds.slots.every(row => validRow(row, 100)) &&
        (odds.guarantee === undefined || typeof odds.guarantee === "string");
}
function validInteraction(item) {
    return !!item && (item.heatExact === undefined || /^\d+$/.test(item.heatExact)) && ["oldFans", "visitors", "newFans", "comments", "gifts", "giftMilli", "heat"]
        .every(key => isUnsigned(item[key])) && (item.arrivals === undefined || isUnsigned(item.arrivals)) &&
        validSources(item.heatSources, heatInteger(item.heat, item.heatExact));
}
function validPack(pack, order, completed) {
    const theme = themeFor(order.themeId);
    return !!pack && Array.isArray(pack.cards) && pack.cards.length === 5 && isUnsigned(pack.revealed, pack.cards.length) &&
        pack.id === `${order.id}/pack/${completed + (pack.pending || pack.revealed < pack.cards.length ? 1 : 0)}` &&
        pack.cards.every(card => validCard(card) && theme?.cards.some(item => item.id === card.id && item.rarity === nativeCard(card).rarity)) &&
        (pack.openingRewards === undefined || isUnsigned(pack.openingRewards)) &&
        (pack.pending === undefined || (!!pack.pending && isUnsigned(pack.pending.seed, 0xffffffff) &&
            isUnsigned(pack.pending.heat) && pack.rewards?.length === 0)) &&
        (pack.upgraded === undefined || (Array.isArray(pack.upgraded) && pack.revealed === pack.cards.length &&
            new Set(pack.upgraded).size === pack.upgraded.length && pack.upgraded.every(slot => isUnsigned(slot, pack.cards.length - 1) && pack.cards[slot].rarity !== "UR"))) &&
        validOdds(pack.odds) && validInteraction(pack.interaction) && Array.isArray(pack.rewards) && pack.rewards.every(isTeachingReward);
}
function validFree(free, stock) {
    const theme = free && themeFor(free.themeId);
    if (!theme || typeof free.id !== "string" || !free.id || !isUnsigned(free.batch) || !free.batch ||
        !isUnsigned(free.quantity, 3) || !free.quantity || !isUnsigned(free.completed, free.quantity) ||
        !free.draw || typeof free.draw.golden !== "boolean" || !isUnsigned(free.draw.aura, 3))
        return false;
    const pack = free.pack;
    if (free.exiting !== undefined && (typeof free.exiting !== "boolean" || (free.exiting && !pack)))
        return false;
    if (pack === null)
        return free.completed === 0 && stock[theme.id] >= free.quantity;
    const locked = !!pack && pack.revealed < 5;
    return !!pack && isUnsigned(pack.revealed, 5) &&
        pack.id === `${free.id}/free/${free.batch}/pack/${free.completed + Number(locked)}` &&
        validOdds(pack.odds) && Array.isArray(pack.cards) && pack.cards.length === 5 && pack.cards.every(card => validCard(card) && theme.cards.some(item => item.id === card.id && item.rarity === nativeCard(card).rarity)) &&
        stock[theme.id] >= free.quantity - free.completed - Number(locked);
}
export function validateBusiness(state) {
    const b = state.business;
    if (b === undefined)
        return;
    if (!b || !isUnsigned(b.revision) || !isUnsigned(b.wallet) || !isUnsigned(b.fans) ||
        !isUnsigned(b.peakFans) || b.peakFans < b.fans || !validStock(b.stock) ||
        !Array.isArray(b.seen) || !b.seen.every(validCard) || !state.broadcast?.shipment ||
        (b.owned !== undefined && (!b.owned || !Object.entries(b.owned).every(([id, count]) => isUnsigned(count) && count > 0 && rules.themes.some(theme => theme.cards.some(card => card.id === id)))))) {
        throw new Error("经营存档无法读取，已保留原记录。");
    }
    const validClaims = (claimed, tiers) => Array.isArray(claimed) && new Set(claimed).size === claimed.length && claimed.every(value => tiers.some(([tier]) => tier === value));
    if ((b.dailyClaims !== undefined && (!b.dailyClaims || !/^\d{4}-\d{2}-\d{2}$/.test(b.dailyClaims.day) ||
        b.dailyClaims.day > state.daily.date || !validClaims(b.dailyClaims.tiers, rules.dailyMilestones))) ||
        (b.collectionClaims !== undefined && (!b.collectionClaims || !Object.entries(b.collectionClaims)
            .every(([id, claimed]) => !!themeFor(id) && validClaims(claimed, rules.collectionMilestones))))) {
        throw new Error("里程碑存档无法读取，已保留原记录。");
    }
    if (!validCollectionCopies(b) || (b.free !== undefined && (b.live !== null || !validFree(b.free, b.stock))) ||
        (b.ranks !== undefined && (!b.ranks || !Object.entries(b.ranks).every(([id, level]) => !!talentNode(id) && isUnsigned(level, 10)))) ||
        (b.signIn !== undefined && (!b.signIn || !/^\d{4}-\d{2}-\d{2}$/.test(b.signIn.day) ||
            !isUnsigned(b.signIn.count) || b.signIn.day > state.daily.date))) {
        throw new Error("成长存档无法读取，已保留原记录。");
    }
    const live = b.live;
    if (live === null)
        return;
    if (!live || typeof live.id !== "string" || !validStock(live.startingStock) ||
        (live.heatExact !== undefined && !/^\d+$/.test(live.heatExact)) ||
        !rules.themes.every(theme => b.stock[theme.id] <= live.startingStock[theme.id]) ||
        !["openingFans", "round", "grossMilli", "giftCount", "heat", "comments", "shipped", "saleGold", "removedGold"]
            .every(key => isUnsigned(live[key])) ||
        !validSources(live.heatSources, heatInteger(live.heat, live.heatExact)) ||
        (live.visits !== undefined && !isUnsigned(live.visits)) ||
        !Array.isArray(live.candidates) || live.candidates.length > rules.orders.limit || !live.candidates.every(validOrder) ||
        new Set(live.candidates.map(item => item.id)).size !== live.candidates.length ||
        !Array.isArray(live.rewards) || !live.rewards.every(isTeachingReward) ||
        (live.featuredCards !== undefined && (!Array.isArray(live.featuredCards) || live.featuredCards.length > 5 ||
            !live.featuredCards.every(card => validCard(card) && (card.rarity === "SSR" || card.rarity === "UR")))) ||
        (live.completedSets !== undefined && (!Array.isArray(live.completedSets) ||
            new Set(live.completedSets).size !== live.completedSets.length ||
            !live.completedSets.every(id => { const theme = themeFor(id); return !!theme && hasSet(theme, b.owned); }))) ||
        (live.spentCoupons !== undefined && (!Array.isArray(live.spentCoupons) ||
            new Set(live.spentCoupons).size !== live.spentCoupons.length ||
            !live.spentCoupons.every(id => live.rewards.some(reward => reward.kind === "coupon" && reward.id === id)))) ||
        !(live.audience === null || validInteraction(live.audience)) ||
        !(live.report === null || (live.report && isUnsigned(live.report.giftNet) && !live.task && live.candidates.length === 0))) {
        throw new Error("直播存档无法读取，已保留原记录。");
    }
    const task = live.task;
    if (task === null)
        return;
    if (!task || !validOrder(task.order) || !isUnsigned(task.completed, task.order.quantity) ||
        (task.order.challenge !== undefined && !isUnsigned(task.baselineHeat ?? -1, live.heat)) ||
        (task.baselineHeatExact !== undefined && (!/^\d+$/.test(task.baselineHeatExact) ||
            BigInt(task.baselineHeatExact) > heatInteger(live.heat, live.heatExact))) ||
        (task.progress !== undefined && !isUnsigned(task.progress)) ||
        live.candidates.some(item => item.id === task.order.id) ||
        !(task.pack === null ? task.completed === 0 : validPack(task.pack, task.order, task.completed)) ||
        availableStock(b, task.order.themeId) < 0) {
        throw new Error("订单存档无法读取，已保留原记录。");
    }
}
