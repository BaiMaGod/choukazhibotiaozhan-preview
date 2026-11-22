export function element(id) {
    const node = document.getElementById(id);
    if (!node)
        throw new Error(`Missing UI element: ${id}`);
    return node;
}
