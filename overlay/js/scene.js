const width = 360;
const height = 306;
const palettes = {
    N: ["#fff8df", "#dfc389", "#d58d57"],
    R: ["#edfae9", "#80ac9a", "#5e9b87"],
    SR: ["#f1e6fc", "#a68ac2", "#8263a4"],
    SSR: ["#fff1c4", "#e0b65e", "#ad6f38"],
    UR: ["#e9e7ff", "#a49ce0", "#6f73b4"],
};
function rounded(g, x, y, w, h, r, fill, stroke) {
    g.drawRoundRect(x, y, w, h, r, r, r, r, fill, stroke, 2);
}
function star(g, x, y, size, fill) {
    g.drawPoly(x, y, [0, -size, size * .25, -size * .25, size, 0, size * .25, size * .25,
        0, size, -size * .25, size * .25, -size, 0, -size * .25, -size * .25], fill);
}
function ellipse(g, x, y, rx, ry, fill) {
    g.drawEllipse(x, y, rx, ry, fill, fill, 0);
}
function cat(g, color) {
    ellipse(g, 180, 181, 49, 13, "#7b675a26");
    ellipse(g, 180, 163, 38, 23, "#fff8e8");
    g.drawPoly(146, 132, [0, 14, 2, -17, 26, 0, 42, 0, 64, -17, 67, 16], "#fff8e8");
    g.drawPoly(152, 125, [0, 4, 2, -8, 13, 1], "#e7ae91");
    g.drawPoly(195, 125, [0, 1, 12, -8, 13, 4], "#e7ae91");
    ellipse(g, 180, 151, 39, 25, "#fff8e8");
    ellipse(g, 163, 148, 2.5, 3.2, "#47504b");
    ellipse(g, 197, 148, 2.5, 3.2, "#47504b");
    ellipse(g, 155, 157, 5, 2.5, "#edb29a");
    ellipse(g, 205, 157, 5, 2.5, "#edb29a");
    g.drawPoly(176, 153, [0, 0, 8, 0, 4, 4], "#b56862");
    g.drawLine(180, 157, 180, 160, "#8c675e", 1);
    ellipse(g, 180, 178, 9, 4, color);
}
export async function createScene(host, endUr) {
    Laya.addBeforeInitCallback(() => {
        const container = document.getElementById("layaContainer");
        if (container)
            host.append(container);
        Laya.Browser.clientWidth = width;
        Laya.Browser.clientHeight = height;
    });
    Laya.Config.useRetinalCanvas = true;
    const viewport = document.querySelector('meta[name="viewport"]');
    const viewportContent = viewport?.content;
    const bodyOverflow = document.body.style.overflow;
    let initializationError;
    try {
        await Laya.init({ designWidth: width, designHeight: height, scaleMode: "noscale", backgroundColor: "#000000" });
    }
    catch (error) {
        initializationError = error;
    }
    finally {
        // The embedded table is only one part of the page. Keep native scrolling and zoom.
        document.body.style.overflow = bodyOverflow;
        if (viewport && viewportContent)
            viewport.content = viewportContent;
    }
    // The native cards, saves and menus do not depend on the decorative WebGL
    // layer. A device without a context can still play and open those pages.
    if (initializationError) {
        console.warn("WebGL effects unavailable; using reduced native effects.", initializationError);
        host.replaceChildren();
        host.dataset.renderer = "native-fallback";
        let effect;
        const stopUr = () => { effect?.cancel(); effect = undefined; endUr(); };
        const draw = (_rarity, _opened = false, _tear = 0, hasArt = false) => {
            host.style.background = hasArt ? "none" : 'url("./assets/ui/card-back.webp") center / auto 85% no-repeat';
        };
        const playUr = () => {
            stopUr();
            if (matchMedia("(prefers-reduced-motion: reduce)").matches)
                return false;
            effect = host.animate([{ opacity: 0 }, { opacity: .7, offset: .3 }, { opacity: 0 }], { duration: 650 });
            const current = effect;
            current.onfinish = () => { if (effect === current) {
                effect = undefined;
                endUr();
            } };
            return true;
        };
        return { draw, playUr, stopUr };
    }
    const art = new Laya.Sprite();
    const effect = new Laya.Sprite();
    Laya.stage.addChild(art);
    Laya.stage.addChild(effect);
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let animation = 0;
    function stopUr() {
        cancelAnimationFrame(animation);
        effect.graphics.clear();
        endUr();
    }
    function draw(rarity, opened = false, tear = 0, hasArt = false) {
        const g = art.graphics;
        g.clear();
        if (hasArt && host.closest("[data-screen]:not([data-screen=demo])"))
            return;
        rounded(g, 10, 9, 340, 288, 16, "#e9eddc", "#d4dec7");
        for (let i = 0; i < 24; i++) {
            g.drawCircle(27 + (i * 71) % 307, 23 + (i * 37) % 256, 1.1, "#bac9b0");
        }
        ellipse(g, 180, 155, 119, 105, "#e1e7d2");
        ellipse(g, 180, 155, 99, 88, "#f3efda");
        if (hasArt)
            return;
        if (opened && !rarity) {
            for (let i = 0; i < 3; i++) {
                rounded(g, 109 + i * 4, 55 + i * 5, 138, 174, 11, "#bad2bd", "#779c86");
            }
            rounded(g, 124, 70, 112, 144, 8, "#8cad97", "#e7eedc");
            star(g, 180, 145, 31, "#f4e7bf");
            return;
        }
        const [fill, border, accent] = palettes[rarity ?? "N"];
        const x = rarity ? 108 : 99;
        const y = rarity ? 53 : 49;
        const w = rarity ? 144 : 162;
        const h = rarity ? 184 : 199;
        rounded(g, x + 4, y + 8, w, h, 12, "#5d74532b");
        rounded(g, x, y, w, h, 12, rarity ? fill : "#f4dbad", border);
        rounded(g, x + 9, y + 12, w - 18, h - 24, 7, "#fff6e0", border);
        g.drawCircle(180, 145, 53, fill);
        g.drawCircle(180, 145, 44, border);
        star(g, 134, 107, 8, accent);
        star(g, 225, 105, 6, accent);
        star(g, 226, 183, 8, accent);
        cat(g, accent);
        for (let i = 0; i < 3; i++) {
            const stripe = x + 25 + i * (w - 50) / 2;
            g.drawLine(stripe - 7, y + h - 19, stripe + 7, y + h - 19, accent, 2);
        }
        if (!rarity) {
            g.drawLine(x + 9, y + 25, x + w - 9, y + 25, "#a9704c", 2);
            if (tear > 0) {
                g.drawLine(x + 9, y + 25, x + 9 + (w - 18) * tear, y + 25, "#fffaf0", 5);
            }
        }
    }
    function playUr() {
        stopUr();
        if (reducedMotion.matches)
            return false;
        const started = performance.now();
        function frame(now) {
            const progress = Math.min((now - started) / 1050, 1);
            effect.graphics.clear();
            if (progress === 1) {
                endUr();
                return;
            }
            effect.alpha = 1 - progress * .85;
            for (let i = 0; i < 12; i++) {
                const angle = i * Math.PI / 6;
                const radius = 66 + progress * (33 + i % 3 * 8);
                star(effect.graphics, 180 + Math.cos(angle) * radius, 145 + Math.sin(angle) * radius, 3 + i % 4, i % 2 ? "#f5d694" : "#8e7acf");
            }
            animation = requestAnimationFrame(frame);
        }
        animation = requestAnimationFrame(frame);
        return true;
    }
    return { draw, playUr, stopUr };
}
