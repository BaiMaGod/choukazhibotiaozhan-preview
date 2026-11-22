import { applyGameSnapshot, transactRecord } from "./save.js";
const name = "ssr_live_main";
const journalKey = "tap-cloud-journal-v1";
const uploadInterval = 65000;
const pollInterval = 15000;
const archiveWarningBytes = 5000000;
const archiveLimitBytes = 10000000;
const utf8 = new TextEncoder();
export class PlatformFailure extends Error {
    constructor(message, code = 0, conflict = false) {
        super(message);
        this.code = code;
        this.conflict = conflict;
    }
}
function api(owner, method, args = {}) {
    return new Promise((resolve, reject) => {
        const handler = owner[method];
        if (typeof handler !== "function") {
            reject(new PlatformFailure("当前 TapTap 容器缺少所需能力。"));
            return;
        }
        const timeout = setTimeout(() => reject(new PlatformFailure("云档请求超时，请检查网络。")), 12000);
        try {
            handler.call(owner, { ...args, success: (value) => { clearTimeout(timeout); resolve(value); },
                fail: (error) => {
                    clearTimeout(timeout);
                    reject(new PlatformFailure("TapTap 请求失败，请重试。", error?.errno));
                } });
        }
        catch {
            clearTimeout(timeout);
            reject(new PlatformFailure("TapTap 容器调用失败。"));
        }
    });
}
const manager = (tap, method) => {
    const get = tap[method];
    if (typeof get !== "function")
        throw new PlatformFailure("此版本需要在支持云存档的 TapTap 容器中打开。");
    const value = get.call(tap);
    if (!value)
        throw new PlatformFailure("TapTap 云存档暂不可用。");
    return value;
};
export function archiveFileBytes(file) {
    const bytes = utf8.encode(file).length;
    if (bytes >= archiveLimitBytes)
        throw new PlatformFailure("云档达到 TapTap 文件大小上限，已保留本机进度。");
    return bytes;
}
async function digest(payload) {
    const buffer = await crypto.subtle.digest("SHA-256", utf8.encode(payload));
    return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
}
const sameSlot = (first, second) => first?.uuid === second?.uuid && first?.fileId === second?.fileId;
function sameCheckpoint(first, second) {
    return first.commit === second.commit && first.session === second.session &&
        first.hash === second.hash && first.parent === second.parent;
}
export class TapCloud {
    constructor(db, tap) {
        this.db = db;
        this.tap = tap;
        this.session = null;
        this.checking = null;
        this.lastRead = 0;
        this.active = false;
        this.dirty = false;
        this.archiveBytes = 0;
        this.generation = 0;
        this.cloud = manager(tap, "getCloudSaveManager");
        this.files = manager(tap, "getFileSystemManager");
        const env = tap.env;
        if (!env?.USER_DATA_PATH)
            throw new PlatformFailure("TapTap 文件系统暂不可用。");
        this.folder = env.USER_DATA_PATH;
    }
    get available() { return this.active && navigator.onLine; }
    suspend() { this.active = false; this.generation++; }
    local() {
        return transactRecord(this.db, journalKey, false, value => value ?? null);
    }
    change(update) {
        return transactRecord(this.db, journalKey, true, value => update(value ?? null));
    }
    async currentSlot() {
        if (!navigator.onLine)
            throw new PlatformFailure("网络已断开，重新联网后核对云档。");
        const response = await api(this.cloud, "getArchiveList");
        if (!Array.isArray(response?.saves))
            throw new PlatformFailure("TapTap 云档列表无效。");
        const matches = response.saves.filter(item => item.name === name);
        if (matches.length > 1)
            throw new PlatformFailure("发现多个同名云档，请联系游戏维护者核对。", 0, true);
        if (!matches.length)
            return null;
        const { uuid, fileId } = matches[0];
        if (typeof uuid !== "string" || !uuid || typeof fileId !== "string" || !fileId)
            throw new PlatformFailure("云档标识无效。");
        return { uuid, fileId };
    }
    async read() {
        const slot = await this.currentSlot();
        if (!slot)
            return null;
        const result = await api(this.cloud, "getArchiveData", {
            archiveUUID: slot.uuid, archiveFileId: slot.fileId,
        });
        const file = await api(this.files, "readFile", { filePath: result.filePath, encoding: "utf8" });
        let checkpoint;
        let raw;
        try {
            if (typeof file?.data !== "string")
                throw new Error();
            this.archiveBytes = archiveFileBytes(file.data);
            checkpoint = JSON.parse(file.data);
            if (checkpoint.schema !== 1 || typeof checkpoint.payload !== "string" ||
                typeof checkpoint.commit !== "string" || !checkpoint.commit || typeof checkpoint.session !== "string" ||
                !checkpoint.session || typeof checkpoint.parent !== "string" ||
                await digest(checkpoint.payload) !== checkpoint.hash)
                throw new Error();
            raw = JSON.parse(checkpoint.payload);
            if (!raw)
                throw new Error();
            applyGameSnapshot(raw, undefined, Date.now());
        }
        catch (error) {
            if (error instanceof PlatformFailure)
                throw error;
            throw new PlatformFailure("云档损坏或版本不可读，已保留本机记录。");
        }
        return { slot, checkpoint, state: raw };
    }
    async checkpoint(journal) {
        const payload = JSON.stringify(journal.state);
        return { schema: 1, session: journal.session, commit: crypto.randomUUID(),
            parent: journal.confirmed?.hash ?? "", hash: await digest(payload), payload };
    }
    async upload(journal, checkpoint, data) {
        const path = `${this.folder}/ssr-checkpoint-${checkpoint.commit}.json`;
        await api(this.files, "writeFile", { filePath: path, data, encoding: "utf8" });
        const archiveMetaData = { name, summary: "Card livestream save", extra: JSON.stringify({
                schema: 1, session: checkpoint.session, commit: checkpoint.commit, hash: checkpoint.hash,
            }) };
        const parameters = { archiveMetaData, archiveFilePath: path };
        if (!sameSlot(journal.base, await this.currentSlot()))
            throw this.conflict();
        if (journal.base)
            await api(this.cloud, "updateArchive", { ...parameters, archiveUUID: journal.base.uuid });
        else
            await api(this.cloud, "createArchive", parameters);
    }
    cleanUpload(checkpoint) {
        if (typeof this.files.unlink === "function")
            void api(this.files, "unlink", { filePath: `${this.folder}/ssr-checkpoint-${checkpoint.commit}.json` }).catch(() => { });
    }
    async reconcile(local, remote) {
        if (local.flight && remote && (!local.base || local.base.uuid === remote.slot.uuid) &&
            sameCheckpoint(local.flight.checkpoint, remote.checkpoint)) {
            const confirmed = await this.change(current => {
                if (!current || current.session !== local.session)
                    throw this.conflict();
                if (current.flight?.checkpoint.commit !== remote.checkpoint.commit) {
                    if (current.confirmed?.commit === remote.checkpoint.commit)
                        return current;
                    throw this.conflict();
                }
                return { ...current, base: remote.slot, flight: undefined,
                    confirmed: { serial: current.flight.serial, hash: remote.checkpoint.hash, commit: remote.checkpoint.commit } };
            });
            this.cleanUpload(remote.checkpoint);
            return confirmed;
        }
        if (sameSlot(local.base, remote?.slot ?? null) &&
            (!remote || remote.checkpoint.commit === local.confirmed?.commit &&
                remote.checkpoint.hash === local.confirmed?.hash))
            return local;
        throw this.conflict();
    }
    conflict() {
        return new PlatformFailure("检测到云档已由其他设备更新。确认后可从最新云档在此设备继续。", 0, true);
    }
    async sync(takeover = false) {
        if (this.checking)
            return this.checking;
        const generation = this.generation;
        this.checking = this.check(takeover, generation);
        try {
            return await this.checking;
        }
        catch (error) {
            this.active = false;
            throw error;
        }
        finally {
            this.checking = null;
        }
    }
    async check(takeover, generation) {
        if (!this.session || !this.active) {
            const login = await api(this.tap, "login");
            if (!login?.code)
                throw new PlatformFailure("TapTap 登录未确认，暂时无法进入游戏。");
        }
        let local = await this.local();
        let remote = await this.read();
        this.lastRead = performance.now();
        const known = !!local && (!remote || local.base?.uuid === remote.slot.uuid ||
            local.flight?.checkpoint.commit === remote.checkpoint.commit);
        if (local && known && !takeover) {
            local = await this.reconcile(local, remote);
        }
        else {
            if (local?.base && !remote)
                throw new PlatformFailure("云档槽缺失，已保留本机记录。", 0, true);
            if (this.session && !takeover)
                throw this.conflict();
            const previous = local;
            if (previous)
                await transactRecord(this.db, `${journalKey}-displaced/${previous.session}`, true, () => previous);
            local = await this.change(current => {
                if (current?.session !== previous?.session || current?.serial !== previous?.serial)
                    throw this.conflict();
                return {
                    state: remote?.state ?? applyGameSnapshot(undefined, undefined, Date.now()),
                    serial: 1, session: crypto.randomUUID(), base: remote?.slot ?? null,
                    confirmed: remote ? { serial: 0, hash: remote.checkpoint.hash, commit: remote.checkpoint.commit } : null,
                    attemptAt: previous?.attemptAt ?? 0,
                };
            });
        }
        this.session = local.session;
        const needsUpload = !local.confirmed || local.serial > local.confirmed.serial;
        const verified = !!remote && remote.checkpoint.session === local.session;
        if (needsUpload && Date.now() - local.attemptAt >= uploadInterval) {
            const next = local.flight?.checkpoint ?? await this.checkpoint(local);
            const data = JSON.stringify(next);
            archiveFileBytes(data);
            const serial = local.flight?.serial ?? local.serial;
            const expectedAttempt = local.attemptAt;
            const claimed = await this.change(current => {
                if (!current || current.session !== local?.session || !sameSlot(current.base, local.base) ||
                    current.attemptAt !== expectedAttempt)
                    throw this.conflict();
                return { ...current, attemptAt: Date.now(), flight: { checkpoint: next, serial } };
            });
            try {
                await this.upload(claimed, next, data);
            }
            catch (error) {
                if (!(error instanceof PlatformFailure) || ![400001, 400007].includes(error.code))
                    throw error;
                if (!verified)
                    throw new PlatformFailure("云档限频，请稍后重试。", error.code);
            }
            remote = await this.read();
            local = await this.reconcile(claimed, remote);
            if (local.flight && verified) {
                this.active = false;
                throw new PlatformFailure("正在确认上次上传结果，请稍后重试。", 400001);
            }
        }
        if (local.flight)
            throw new PlatformFailure("正在确认上次上传结果，请稍后重试。", 400001);
        if (!remote || remote.checkpoint.session !== local.session) {
            throw new PlatformFailure("正在确认本设备的云档会话，请稍后重试。", 400001);
        }
        if (generation !== this.generation || !navigator.onLine)
            throw new PlatformFailure("联网状态已变化，请重试。");
        const latest = await this.local();
        if (!latest || latest.session !== local.session || generation !== this.generation)
            throw this.conflict();
        this.active = true;
        this.dirty = latest.serial > (latest.confirmed?.serial ?? 0);
        return latest.state;
    }
    async tick() {
        if (!this.available || performance.now() - this.lastRead < pollInterval)
            return null;
        return this.sync();
    }
    async transact(action, now = Date.now()) {
        if (!this.available)
            throw new PlatformFailure("云档会话暂不可用，请联网后重试。");
        const session = this.session;
        const journal = await this.change(current => {
            if (!this.available || !current || current.session !== session)
                throw this.conflict();
            const next = applyGameSnapshot(current.state, action, now);
            return next === current.state ? current : { ...current, state: next, serial: current.serial + 1 };
        });
        this.dirty = journal.serial > (journal.confirmed?.serial ?? 0);
        return journal.state;
    }
    get sessionId() { return this.session; }
    get status() {
        const sync = this.dirty ? "本机已保存 · 待同步云档" : "TapTap 云档已同步";
        return this.archiveBytes < archiveWarningBytes ? sync
            : `${sync} · 云档较大（${(this.archiveBytes / 1000000).toFixed(1)} MB）`;
    }
}
export function currentTap() {
    return globalThis.tap;
}
export function playRewardedAd(tap, adUnitId) {
    if (!adUnitId || typeof tap.createRewardedVideoAd !== "function")
        return Promise.resolve(false);
    return new Promise(resolve => {
        const ad = tap.createRewardedVideoAd instanceof Function
            ? tap.createRewardedVideoAd({ adUnitId, multiton: true }) : undefined;
        if (!ad || ![ad.show, ad.load, ad.onClose, ad.offClose, ad.onError, ad.offError, ad.destroy]
            .every(method => typeof method === "function")) {
            resolve(false);
            return;
        }
        let done = false;
        const finish = (succeeded) => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            try {
                ad.offClose(closed);
                ad.offError(failed);
                ad.destroy();
            }
            finally {
                resolve(succeeded);
            }
        };
        const closed = (result) => finish(result?.isEnded === true);
        const failed = () => finish(false);
        const timer = setTimeout(failed, 10 * 60000);
        ad.onClose(closed);
        ad.onError(failed);
        void ad.load().then(() => { if (!done)
            return ad.show(); }).catch(failed);
    });
}
export async function openShare(tap, templateId) {
    if (templateId && typeof tap.showShareboard === "function")
        await api(tap, "showShareboard", { templateId });
}
function shareListenerPair(tap) {
    return [["onShareAppMessage", "offShareAppMessage"], ["onShareMessage", "offShareMessage"]]
        .find(([on, off]) => typeof tap[on] === "function" && typeof tap[off] === "function");
}
export function supportsShareRewards(tap) {
    return !!tap && typeof tap.showShareboard === "function" && !!shareListenerPair(tap);
}
export function probeShare(tap, templateId, timeout = 12000) {
    return watchShare(tap, templateId, crypto.randomUUID(), timeout, false);
}
export async function playRewardedShare(tap, templateId, requestId, timeout = 120000) {
    return await watchShare(tap, templateId, requestId, timeout, true) === "matched";
}
async function watchShare(tap, templateId, requestId, timeout, waitForMatch) {
    const pair = shareListenerPair(tap);
    if (!pair)
        return "unsupported";
    const [on, off] = pair;
    const sceneParam = JSON.stringify({ requestId });
    return new Promise(resolve => {
        let done = false;
        const finish = (result) => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            try {
                tap[off].call(tap, callbacks);
            }
            catch { /* The result still belongs to this request. */ }
            resolve(result);
        };
        const callbacks = {
            success: (result) => {
                if (typeof result?.channel === "string" && result.channel !== "" && result.sceneParam === sceneParam)
                    finish("matched");
                else if (!waitForMatch)
                    finish("uncorrelated");
            },
            fail: () => finish("unavailable"),
        };
        const timer = setTimeout(callbacks.fail, timeout);
        try {
            tap[on].call(tap, callbacks);
            if (!done)
                void api(tap, "showShareboard", { templateId, sceneParam }).catch(callbacks.fail);
        }
        catch {
            callbacks.fail();
        }
    });
}
