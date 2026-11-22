import { rules } from "./generated-rules.js";
import { talentNode, talentOffer } from "./growth.js";
import { roomButton, roomTab, roomTabs } from "./room-ui.js";
const branches = { draw: "抽卡", order: "订单", gift: "礼物", challenge: "挑战", tool: "道具", heat: "热度" };
let branch = "draw";
// Remember each branch's selected node without altering the underlying ranks.
const selectedIds = {};
const positions = [
    [50, 4], [25, 25], [78, 25], [13, 53], [35, 49], [64, 49],
    [87, 53], [13, 80], [32, 80], [50, 87], [69, 80], [88, 80],
];
const skins = [0, 1, 2, 3, 4, 5, 6, 7, 8, 4, 5, 6];
const asset = (name) => `./assets/ui/talents-v2/${name}.webp`;
function icon(name, className) {
    const image = new Image();
    image.src = asset(name);
    image.className = className;
    image.alt = "";
    image.draggable = false;
    return image;
}
export function renderTalentTree(container, profile, busy, send) {
    const render = () => {
        const nodes = rules.talents.nodes.filter(item => item.branch === branch);
        const selected = nodes.find(node => node.id === selectedIds[branch]) ?? nodes[0];
        const dialog = container.closest(".room-page");
        if (dialog)
            dialog.dataset.talentTheme = branch;
        const area = document.createElement("section");
        area.className = "talent-area talent-restored";
        area.dataset.branch = branch;
        const back = roomButton("返回首页", () => {
            if (dialog instanceof HTMLDialogElement)
                dialog.close();
        }, "talent-back");
        back.setAttribute("aria-label", "返回首页");
        const art = document.createElement("div");
        art.className = "talent-art";
        art.setAttribute("aria-hidden", "true");
        art.append(icon(`${branch}-header`, "talent-header-scene"));
        const tree = document.createElement("div");
        tree.className = "talent-tree";
        tree.setAttribute("role", "group");
        tree.setAttribute("aria-label", `${branches[branch]}天赋树`);
        for (const [index, node] of nodes.entries()) {
            const level = profile.ranks?.[node.id] ?? 0;
            const offer = talentOffer(node, profile.ranks, profile.fans, profile.wallet);
            const button = roomTab("", node.id === selected.id, () => {
                selectedIds[branch] = node.id;
                render();
                container.querySelector(`[data-talent-node="${node.id}"]`)?.focus({ preventScroll: true });
            });
            button.className = "talent-node";
            button.dataset.talentNode = node.id;
            button.dataset.level = String(level);
            button.dataset.locked = String(offer.needs.length > 0);
            if (index === 0)
                button.classList.add("talent-root");
            const position = positions[index % positions.length];
            button.style.left = position[0] + "%";
            button.style.top = position[1] + "%";
            button.setAttribute("aria-label", `${node.name}，${level}/10 级${offer.needs.length ? "，前置未满足" : ""}`);
            button.title = node.description;
            button.append(icon(`${branch}-node-${skins[index % skins.length]}`, "talent-node-art"));
            const rank = document.createElement("small");
            rank.textContent = String(level);
            rank.setAttribute("aria-hidden", "true");
            button.append(rank);
            tree.append(button);
        }
        const detail = document.createElement("section");
        detail.className = "talent-detail";
        detail.setAttribute("aria-label", "已选天赋详情");
        const { level, price, gate, needs, allowed } = talentOffer(selected, profile.ranks, profile.fans, profile.wallet);
        const content = document.createElement("div");
        content.className = "talent-detail-content";
        const name = document.createElement("h3");
        name.textContent = selected.name;
        const info = document.createElement("p");
        info.className = "talent-description";
        info.textContent = selected.description;
        if (selected.description.length > 30)
            info.tabIndex = 0;
        const copy = document.createElement("div");
        copy.className = "talent-copy";
        copy.append(name, info);
        const rank = document.createElement("p");
        rank.className = "talent-rank";
        rank.textContent = `当前 Lv.${level}/10` + (price === undefined ? " · 已满级" : ` → Lv.${level + 1}/10`);
        const cost = document.createElement("p");
        cost.className = "talent-cost";
        cost.textContent = price === undefined ? "已达到最高等级" : `${price.toLocaleString("zh-CN")} 金币 · ${gate.toLocaleString("zh-CN")} 粉丝`;
        const requirements = document.createElement("p");
        requirements.className = "talent-requirements";
        requirements.textContent = needs.length ? `前置：${needs.map(item => `${talentNode(item.id)?.name} Lv.${item.rank}`).join("、")}` : "";
        const buy = roomButton(price === undefined ? "已满级" : "升级", () => send({ type: "buy-talent", revision: profile.revision, id: selected.id }), "primary talent-upgrade");
        buy.disabled = !allowed || busy;
        buy.setAttribute("aria-label", `${price === undefined ? "已满级" : "升级"}：${selected.name}`);
        content.append(copy, rank, cost, requirements);
        const selectedIndex = nodes.indexOf(selected);
        detail.append(icon(`${branch}-node-${skins[selectedIndex % skins.length]}`, "talent-detail-emblem"), content, buy);
        const tabs = roomTabs("天赋分系");
        tabs.classList.add("talent-tabs");
        for (const key of Object.keys(branches)) {
            const tab = roomTab(branches[key], key === branch, () => {
                branch = key;
                render();
                container.querySelector(`[data-talent-branch="${key}"]`)?.focus({ preventScroll: true });
            });
            tab.dataset.talentBranch = key;
            tab.setAttribute("aria-label", branches[key]);
            tab.append(icon(`${key}-tab`, "talent-tab-art"));
            tabs.append(tab);
        }
        area.append(back, art, tree, detail, tabs);
        container.replaceChildren(area);
    };
    render();
}
