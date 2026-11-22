import { applyPackAction, readPack } from "./pack.js";
import { applyTeachingAction, readTeaching, recoverClock } from "./teaching.js";
import { applyBusiness, prepareBusiness, validateBusiness } from "./business.js";
const storeName = "sessions";
const activeKey = "active";
export function openPackStore() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("choukazhibo-pack-slice", 1);
        request.onupgradeneeded = () => request.result.createObjectStore(storeName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("请关闭其他试拆页面后重试。"));
    });
}
export function transactPack(db, action) {
    return transactRecord(db, activeKey, !!action, value => {
        const current = readPack(value);
        return action ? applyPackAction(current, action) : current;
    });
}
export function transactTeaching(db, action, now = Date.now(), recovered) {
    return transactRecord(db, "teaching-v1", true, value => applyGameSnapshot(value, action, now), recovered);
}
export function applyGameSnapshot(value, action, now) {
    const hasBusiness = !!value && typeof value === "object" && "business" in value;
    const stored = readTeaching(value, now, hasBusiness);
    validateBusiness(stored);
    const current = prepareBusiness(recoverClock(stored, now));
    if (action?.type === "business")
        return applyBusiness(current, action.command, now);
    if (current.business || !action)
        return current;
    return prepareBusiness(applyTeachingAction(current, action, now));
}
export function transactRecord(db, key, write, update, recovered) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, write ? "readwrite" : "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        const previousKey = `${key}/previous`;
        let result;
        let validationError;
        let didRecover = false;
        const abort = (error) => { validationError = error; transaction.abort(); };
        request.onsuccess = () => {
            try {
                result = update(request.result);
            }
            catch (error) {
                if (!write || !recovered) {
                    abort(error);
                    return;
                }
                const previous = store.get(previousKey);
                previous.onsuccess = () => {
                    if (previous.result === undefined) {
                        abort(error);
                        return;
                    }
                    try {
                        result = update(previous.result);
                        if (result === null) {
                            abort(error);
                            return;
                        }
                        store.put(request.result, `${key}/damaged`);
                        store.put(result, key);
                        didRecover = true;
                    }
                    catch {
                        abort(error);
                    }
                };
                return;
            }
            if (!write || result === request.result)
                return;
            if (recovered && request.result !== undefined)
                store.put(request.result, previousKey);
            if (result !== null)
                store.put(result, key);
            else if (request.result !== undefined)
                store.delete(key);
        };
        transaction.oncomplete = () => {
            if (didRecover)
                recovered?.();
            resolve(result);
        };
        transaction.onabort = () => reject(validationError ?? transaction.error ?? new Error("存档事务已取消。"));
    });
}
