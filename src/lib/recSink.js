/* SPDX-License-Identifier: AGPL-3.0-or-later */
// Where recording chunks go. Data never leaves the phone/PC.
//   1. OPFS (Origin Private File System): written to disk chunk by chunk, no big string in RAM.
//      createWritable() only commits on close(), so we close and reopen (keepExistingData + seek to the
//      end) every CHECKPOINT_MS and when the page is hidden: a crash / killed tab loses <= ~20 s.
//      Rows written meanwhile queue behind the checkpoint on the same promise chain.
//   2. Fallback: array of Blob parts (browser may keep them on disk, in any case no giant string).
//      Capped at BLOB_MAX_SECONDS (RAM risk, ~340 MB/h); OPFS capped at the free-space estimate.
// finish() returns { file, size, partial }. Then the UI offers download / share; discard() deletes it.
// Leftover files of unfinished recordings are NOT deleted on start: findLeftover() offers them.

const DIR = 'brainarcade-rec';
const CHECKPOINT_MS = 20000;
const BLOB_MAX_SECONDS = 1800;
const SAFETY_BYTES = 8 * 1024 * 1024; // keep this much free
const active = new Set(); // names being written by this page

async function opfsDir() {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(DIR, { create: true });
  } catch {
    return null;
  }
}

async function freeBytes() {
  try {
    const e = await navigator.storage?.estimate?.();
    if (e && Number.isFinite(e.quota) && Number.isFinite(e.usage)) return Math.max(0, e.quota - e.usage);
  } catch { /* unknown */ }
  return Infinity;
}

/**
 * Newest unfinished/unsaved recording left by an earlier session (empty files are removed), or null.
 * @returns {Promise<{name:string,size:number,file:File,remove:()=>Promise<void>}|null>}
 */
export async function findLeftover() {
  const dir = await opfsDir();
  if (!dir) return null;
  try {
    let best = null;
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== 'file' || active.has(name)) continue;
      const file = await h.getFile();
      if (!file.size) { await dir.removeEntry(name).catch(() => {}); continue; }
      if (!best || file.name > best.file.name) best = { name, file };
    }
    if (!best) return null;
    const { name, file } = best;
    return { name, size: file.size, file, remove: () => dir.removeEntry(name).catch(() => {}) };
  } catch {
    return null;
  }
}

export async function createSink(name) {
  let size = 0;
  const dir = await opfsDir();
  if (dir) {
    try {
      const handle = await dir.getFileHandle(name, { create: true });
      let writable = await handle.createWritable();
      let chain = Promise.resolve();
      let failed = null;
      let closed = false;
      let maxBytes = Infinity;
      let warnBytes = Infinity;
      active.add(name);

      const enqueue = (fn) => {
        chain = chain.then(() => (failed ? undefined : fn())).catch((e) => { failed = e; });
        return chain;
      };
      const refreshLimit = async () => {
        const free = await freeBytes();
        if (free === Infinity) return;
        maxBytes = Math.max(0, size + free - SAFETY_BYTES);
        warnBytes = maxBytes * 0.9;
      };
      const checkpoint = () => enqueue(async () => {
        if (closed) return;
        await writable.close();
        const committed = (await handle.getFile()).size;
        writable = await handle.createWritable({ keepExistingData: true });
        await writable.seek(committed);
        await refreshLimit();
      });
      const onHidden = () => { if (document.visibilityState === 'hidden') checkpoint(); };
      const onPageHide = () => { checkpoint(); };
      const timer = setInterval(checkpoint, CHECKPOINT_MS);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHidden);
      if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);
      const detach = () => {
        clearInterval(timer);
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHidden);
        if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
      };
      await refreshLimit();

      return {
        kind: 'opfs',
        get size() { return size; },
        get failure() { return failed; },
        get maxBytes() { return maxBytes; },
        get warnBytes() { return warnBytes; },
        maxSeconds: Infinity,
        write(text) {
          size += text.length; // ASCII only
          enqueue(() => writable.write(text));
        },
        async finish() {
          detach();
          await chain;
          const partial = !!failed;
          try { if (!closed) await writable.close(); } catch (e) { if (!failed) failed = e; }
          closed = true;
          active.delete(name);
          if (failed && !(await handle.getFile().catch(() => null))) throw failed;
          const file = await handle.getFile();
          return { file, size: file.size, partial: partial || !!failed };
        },
        async discard() {
          detach();
          await chain;
          closed = true;
          try { await writable.abort(); } catch { /* already closed */ }
          active.delete(name);
          await dir.removeEntry(name).catch(() => {});
        },
        async cleanup() { active.delete(name); await dir.removeEntry(name).catch(() => {}); },
      };
    } catch {
      // fall through to Blob parts
    }
  }
  const parts = [];
  return {
    kind: 'blob',
    get size() { return size; },
    failure: null,
    maxBytes: Infinity,
    warnBytes: Infinity,
    maxSeconds: BLOB_MAX_SECONDS,
    write(text) {
      size += text.length;
      parts.push(text);
      // Merge small strings into Blobs so the engine can move them out of the JS heap
      if (parts.length >= 64 && typeof Blob !== 'undefined') {
        const merged = new Blob(parts);
        parts.length = 0;
        parts.push(merged);
      }
    },
    async finish() {
      return { file: new File(parts.splice(0), name, { type: 'text/csv' }), size, partial: false };
    },
    async discard() { parts.length = 0; },
    async cleanup() {},
  };
}
