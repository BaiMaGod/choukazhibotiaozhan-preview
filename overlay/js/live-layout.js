import { element } from "./dom.js";
/** Reuse the live panels themselves so actions, saved state and focus stay intact. */
export function installLiveDrawer(shell, onModalChange) {
    const dialog = document.createElement("dialog");
    dialog.id = "live-detail-dialog";
    dialog.className = "live-detail-dialog";
    dialog.setAttribute("aria-labelledby", "live-detail-title");
    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.id = "live-detail-title";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "quiet";
    close.textContent = "返回直播";
    close.onclick = () => dismiss();
    header.append(title, close);
    const content = document.createElement("div");
    content.className = "live-detail-content";
    dialog.append(header, content);
    shell.append(dialog);
    let moved = [];
    function restore() {
        for (const { panel, marker } of moved)
            marker.replaceWith(panel);
        moved = [];
        content.replaceChildren();
    }
    dialog.addEventListener("close", () => {
        // A queued close from the previous opening must not empty a reopened drawer.
        if (!dialog.open) {
            restore();
            onModalChange();
        }
    });
    function dismiss() {
        if (dialog.open) {
            dialog.close();
            restore();
        }
    }
    function open(label, ids) {
        if (dialog.open)
            return;
        restore();
        title.textContent = label;
        for (const id of ids) {
            const panel = element(id);
            if (panel.hidden)
                continue;
            const marker = document.createComment("live panel position");
            panel.before(marker);
            moved.push({ panel, marker });
            content.append(panel);
        }
        if (!moved.length) {
            const empty = document.createElement("p");
            empty.textContent = "当前没有可查看的内容。";
            content.append(empty);
        }
        dialog.showModal();
        content.scrollTop = 0;
        onModalChange();
    }
    const orders = () => open("订单与账单", ["lesson", "business-live", "receipt", "candidate-panel"]);
    for (const id of ["lesson", "business-live"]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "quiet live-order-details";
        button.textContent = "查看订单";
        button.onclick = orders;
        element(id).append(button);
    }
    const receiptButton = document.createElement("button");
    receiptButton.type = "button";
    receiptButton.className = "quiet live-receipt-details";
    receiptButton.textContent = "已发货 · 查看账单";
    receiptButton.onclick = orders;
    shell.querySelector(".live-panels").prepend(receiptButton);
    element("live-orders").onclick = orders;
    element("live-items").onclick = () => open("本包道具", ["tools"]);
    element("live-effects").onclick = () => {
        if (element("settlement").hidden)
            element("show-odds").click();
        else
            open("本包增益", ["settlement"]);
    };
    return { dialog, close: dismiss };
}
