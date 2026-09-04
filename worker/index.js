/* ── Cloudflare Worker: будильник для телефона ─────────────────────────
   Он ничего не знает про семью. Телефон присылает только «разбуди меня
   в такие-то минуты», и воркер шлёт пуш БЕЗ содержимого. Текст берётся
   на самом телефоне из его же базы. Значит, ни Cloudflare, ни Apple не
   видят ни имён, ни адресов — только моменты времени.                  */

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const hash = async s => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return b64u(d).slice(0, 22);
};

/* ── VAPID: подписываем JWT для службы доставки ───────────────────── */
async function vapidHeader(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const jwk = JSON.parse(env.VAPID_PRIVATE);
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const enc = o => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ typ: 'JWT', alg: 'ES256' });
  const body = enc({ aud, exp: Math.floor(Date.now() / 1000) + 11 * 3600,
                     sub: env.VAPID_SUBJECT || 'mailto:noreply@example.com' });

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key,
    new TextEncoder().encode(`${head}.${body}`));

  return { jwt: `${head}.${body}.${b64u(sig)}`, pub: env.VAPID_PUBLIC };
}

/* пуш без тела: телефон сам решит, что показать */
async function wake(sub, env) {
  const { jwt, pub } = await vapidHeader(sub.endpoint, env);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { TTL: '120', 'Content-Length': '0',
               Authorization: `vapid t=${jwt}, k=${pub}` }
  });
  return r.status;
}

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS')
      return new Response(null, { headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'POST, OPTIONS' } });

    if (req.method !== 'POST') return json({ error: 'post only' }, 405);

    let b;
    try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
    if (!env.APP_SECRET || b.secret !== env.APP_SECRET) return json({ error: 'nope' }, 403);

    const url = new URL(req.url);

    /* телефон прислал подписку и список моментов, когда его будить */
    if (url.pathname === '/schedule') {
      if (!b.sub || !b.sub.endpoint) return json({ error: 'no subscription' }, 400);
      const id = await hash(b.sub.endpoint);
      const times = (b.times || []).filter(t => t > Date.now() - 6e4).slice(0, 200).sort();
      await env.PUSHQ.put('q:' + id, JSON.stringify({ sub: b.sub, times }),
                          { expirationTtl: 60 * 60 * 24 * 14 });
      return json({ ok: true, queued: times.length });
    }

    if (url.pathname === '/forget') {
      if (b.sub && b.sub.endpoint) await env.PUSHQ.delete('q:' + await hash(b.sub.endpoint));
      return json({ ok: true });
    }

    if (url.pathname === '/test') {
      if (!b.sub) return json({ error: 'no subscription' }, 400);
      return json({ status: await wake(b.sub, env) });
    }

    return json({ error: 'unknown path' }, 404);
  },

  /* раз в минуту: кого пора будить */
  async scheduled(_evt, env, ctx) {
    const now = Date.now();
    const list = await env.PUSHQ.list({ prefix: 'q:' });
    for (const k of list.keys) {
      const raw = await env.PUSHQ.get(k.name);
      if (!raw) continue;
      const { sub, times } = JSON.parse(raw);

      const due  = times.filter(t => t <= now + 20000 && t > now - 120000);
      const keep = times.filter(t => t > now + 20000);

      if (due.length) ctx.waitUntil(wake(sub, env).catch(() => {}));
      if (keep.length !== times.length)
        await env.PUSHQ.put(k.name, JSON.stringify({ sub, times: keep }),
                            { expirationTtl: 60 * 60 * 24 * 14 });
    }
  }
};
