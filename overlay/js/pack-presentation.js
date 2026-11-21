// Presentation only: callers persist each reveal through the existing transaction.
export const revealDuration = { N: 720, R: 800, SR: 1100, SSR: 1600, UR: 2100 };
export function nextRevealSlot(pack) {
    return pack && pack.revealed < pack.cards.length ? pack.revealed : null;
}
export function createPackPresentation(table) {
    const layer = document.createElement("div");
    layer.className = "pack-presentation";
    layer.setAttribute("aria-hidden", "true");
    layer.hidden = true;
    table.append(layer);
    let finish;
    let animations = [];
    let destination;
    let skippedPack = "";
    let generation = 0;
    const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    function clear() {
        generation++;
        animations.forEach(animation => animation.cancel());
        animations = [];
        destination?.classList.remove("card-in-flight");
        destination = undefined;
        layer.hidden = true;
        layer.replaceChildren();
        finish?.();
        finish = undefined;
    }
    function image(url, className) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.className = className;
        layer.append(img);
        return img;
    }
    async function play(id, kind, url, rarity = "N", slot, reduceFlash = false) {
        clear();
        if (id === skippedPack)
            return;
        layer.hidden = false;
        layer.dataset.kind = kind;
        layer.dataset.rarity = rarity;
        layer.classList.toggle("soft-light", reduceFlash || reduced());
        const duration = reduced() ? 180 : kind === "rip" ? 650 : revealDuration[rarity];
        const options = { duration, fill: "both", easing: "cubic-bezier(.2,.7,.2,1)" };
        if (kind === "rip") {
            const body = image(url, "opening-wrapper wrapper-body");
            const seal = image(url, "opening-wrapper wrapper-seal");
            animations.push(body.animate(reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [
                { transform: "translate(-50%,-50%) rotate(0deg)", opacity: 1 },
                { transform: "translate(-50%,-45%) rotate(-3deg)", opacity: 1, offset: .35 },
                { transform: "translate(-50%,35%) rotate(-9deg)", opacity: 0 },
            ], options));
            animations.push(seal.animate(reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [
                { transform: "translate(-50%,-50%)", opacity: 1 },
                { transform: "translate(20%,-110%) rotate(24deg)", opacity: .9, offset: .5 },
                { transform: "translate(75%,-160%) rotate(45deg)", opacity: 0 },
            ], options));
        }
        else {
            destination = slot;
            slot?.classList.add("card-in-flight");
            image("./assets/ui/card-back.webp", "opening-card opening-back");
            const card = image(url, "opening-card opening-face");
            const back = layer.querySelector(".opening-back");
            const box = table.getBoundingClientRect();
            const target = slot?.getBoundingClientRect();
            const dx = target ? target.left + target.width / 2 - box.left - box.width / 2 : 0;
            const dy = target ? target.top + target.height / 2 - box.top - box.height / 2 : 0;
            const cardWidth = box.height * .76 * .75;
            const scale = target ? Math.min(target.width / cardWidth, target.height / (box.height * .76)) : .75;
            const end = `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(${scale})`;
            animations.push(back.animate(reduced() ? [{ opacity: 1 }, { opacity: 0 }] : [
                { transform: "translate(-50%,0%) rotateY(0deg)", opacity: 0 },
                { transform: "translate(-50%,-50%) rotateY(0deg)", opacity: 1, offset: .16 },
                { transform: "translate(-50%,-50%) rotateY(90deg)", opacity: 1, offset: .32 },
                { opacity: 0, offset: .33 }, { opacity: 0 },
            ], options));
            animations.push(card.animate(reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [
                { transform: "translate(-50%,-50%) rotateY(-90deg)", opacity: 0 },
                { transform: "translate(-50%,-50%) rotateY(-90deg)", opacity: 0, offset: .32 },
                { transform: "translate(-50%,-50%) rotateY(0deg)", opacity: 1, offset: .48 },
                { transform: "translate(-50%,-50%) rotateY(0deg)", opacity: 1, offset: .78 },
                { transform: end, opacity: target ? .2 : 1 },
            ], options));
            const glow = document.createElement("div");
            glow.className = "opening-glow";
            layer.prepend(glow);
            if (!reduceFlash && !reduced() && rarity !== "N" && rarity !== "R") {
                animations.push(glow.animate([{ opacity: 0, transform: "scale(.5)" },
                    { opacity: .65, transform: "scale(1)", offset: .5 }, { opacity: 0, transform: "scale(1.2)" }], options));
            }
        }
        await new Promise(resolve => {
            finish = resolve;
            const current = generation;
            void Promise.all(animations.map(animation => animation.finished.catch(() => { }))).then(() => {
                if (generation === current)
                    clear();
            });
        });
    }
    document.addEventListener("visibilitychange", () => {
        animations.forEach(animation => document.hidden ? animation.pause() : animation.play());
    });
    return { play, clear, skip(id) { skippedPack = id; clear(); }, skipped: (id) => id === skippedPack };
}
