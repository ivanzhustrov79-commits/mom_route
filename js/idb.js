/* ── idb.js ── маленькое хранилище будильников ─────────────────────────
   Единственное место, доступное и странице, и служебному работнику, когда
   приложение закрыто. Здесь лежит текст уведомлений — на самом устройстве,
   никуда не уезжая.                                                      */
const IDB_NAME = 'momroute', IDB_STORE = 'alerts';

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(IDB_STORE))
        r.result.createObjectStore(IDB_STORE, { keyPath: 'at' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}

/* весь план будильников переписывается целиком — так проще не рассинхронить */
async function idbReplace(items) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const st = tx.objectStore(IDB_STORE);
    st.clear();
    for (const i of items) st.put(i);
    tx.oncomplete = () => res(items.length);
    tx.onerror    = () => rej(tx.error);
  });
}

/* что пора показать прямо сейчас; заодно выметаем просроченное */
async function idbDue(now = Date.now(), ahead = 90000, stale = 300000) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const out = [];
    tx.objectStore(IDB_STORE).openCursor().onsuccess = e => {
      const c = e.target.result;
      if (!c) return;
      if (c.value.at <= now + ahead && c.value.at > now - stale) { out.push(c.value); c.delete(); }
      else if (c.value.at <= now - stale) c.delete();
      c.continue();
    };
    tx.oncomplete = () => res(out);
    tx.onerror    = () => rej(tx.error);
  });
}
