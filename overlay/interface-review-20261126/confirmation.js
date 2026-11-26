/** Game-owned confirmation UI; cancellation never performs the requested action. */
let active = false;
export function confirmAction(title, message, confirmLabel = "确认") {
    if (active)
        return Promise.resolve(false);
    active = true;
    return new Promise(resolve => {
        const dialog = document.createElement("dialog");
        dialog.id = "action-confirm";
        dialog.className = "market";
        dialog.setAttribute("aria-labelledby", "action-confirm-title");
        dialog.setAttribute("aria-describedby", "action-confirm-message");
        const header = document.createElement("header");
        const heading = document.createElement("h2");
        heading.id = "action-confirm-title";
        heading.textContent = title;
        header.append(heading);
        const copy = document.createElement("p");
        copy.id = "action-confirm-message";
        copy.textContent = message;
        const form = document.createElement("form");
        form.method = "dialog";
        form.className = "dialog-actions";
        for (const [label, value, skin] of [["取消", "cancel", "quiet"], [confirmLabel, "confirm", "primary"]]) {
            const button = document.createElement("button");
            button.type = "submit";
            button.value = value;
            button.className = skin;
            button.textContent = label;
            button.autofocus = value === "cancel";
            form.append(button);
        }
        dialog.append(header, copy, form);
        dialog.addEventListener("close", () => {
            const accepted = dialog.returnValue === "confirm";
            active = false;
            dialog.remove();
            document.dispatchEvent(new Event("game:modalchange"));
            resolve(accepted);
        }, { once: true });
        document.querySelector("main").append(dialog);
        dialog.showModal();
        document.dispatchEvent(new Event("game:modalchange"));
    });
}
