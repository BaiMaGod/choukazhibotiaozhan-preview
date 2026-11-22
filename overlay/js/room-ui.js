import { element } from "./dom.js";
import { rules } from "./generated-rules.js";
export function roomButton(label, activate, className = "quiet") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.onclick = activate;
    return button;
}
export function roomImage(path, className = "", alt = "") {
    const image = new Image();
    image.src = path;
    image.className = className;
    image.alt = alt;
    image.decoding = "async";
    return image;
}
export function packImage(theme, className = "") {
    const path = rules.art.packs[theme];
    return path ? roomImage(path, className) : undefined;
}
export function cardImage(card, className = "") {
    const path = rules.art.cards[card.id];
    if (!path)
        return;
    const image = roomImage(path, className, card.name);
    image.dataset.rarity = card.rarity;
    return image;
}
export function roomTabs(label) {
    const tabs = document.createElement("div");
    tabs.className = "room-tabs";
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", label);
    return tabs;
}
export function roomTab(label, active, activate) {
    const button = roomButton(label, () => {
        const group = button.closest(".room-tabs");
        const groupLabel = group?.getAttribute("aria-label");
        const left = group?.scrollLeft ?? 0;
        activate();
        if (!group || group.isConnected || !groupLabel)
            return;
        const next = Array.from(document.querySelectorAll(".room-tabs"))
            .find(tabs => tabs.getAttribute("aria-label") === groupLabel);
        if (next) {
            next.scrollLeft = left;
            next.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
        }
    });
    button.setAttribute("aria-pressed", String(active));
    return button;
}
export function installPageHud(dialog, showSettings) {
    const hud = document.createElement("div");
    hud.className = "page-hud";
    const host = document.querySelector(".host-chip").cloneNode(true);
    const profile = element("profile").cloneNode(true);
    profile.querySelectorAll("small").forEach(item => item.remove());
    profile.querySelectorAll("[id]").forEach(item => item.removeAttribute("id"));
    host.querySelectorAll("[id]").forEach(item => item.removeAttribute("id"));
    profile.removeAttribute("id");
    const settings = roomButton("⚙", showSettings);
    settings.setAttribute("aria-label", "设置");
    hud.append(host, profile, settings);
    dialog.querySelector(".page-hud")?.remove();
    dialog.prepend(hud);
}
