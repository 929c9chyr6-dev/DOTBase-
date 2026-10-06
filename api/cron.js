import { put, get, list } from '@vercel/blob';
import webpush from 'web-push';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('https://dotbase-shared.vercel.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
async function readJson(path, fallback) {
  const r = await get(path, { access: 'private', useCache: false });
  if (r?.statusCode === 200) {
    try { return JSON.parse(await new Response(r.stream).text()); } catch { return fallback; }
  }
  return fallback;
}
async function writeJson(path, value) {
  await put(path, JSON.stringify(value), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
}
async function getRecords() {
  let blobs = [], cursor;
  do {
    const r = await list({ prefix: 'records/', limit: 1000, cursor });
    blobs.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor && blobs.length < 10000);
  return blobs.map((b) => {
    const p = b.pathname.split('/').pop().replace(/\.rec$/, '').split('_');
    if (p.length < 7) return null;
    const [ts, id, carId, season, dot, mileage, userId] = p;
    const n = Number(ts);
    return Number.isFinite(n) ? { path: b.pathname, ts: n, id, carId, season, dot, mileage: Number(mileage), userId, createdAt: new Date(n).toISOString() } : null;
  }).filter(Boolean).sort((a, b) => b.ts - a.ts);
}
function latest(recs, carId, season) { return recs.find((r) => r.carId === carId && (!season || r.season === season)); }
async function appendNotificationLog(row) {
  const rows = await readJson('notifications.json', []);
  rows.unshift({ id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`, ts: Date.now(), createdAt: new Date().toISOString(), ...row });
  await writeJson('notifications.json', rows.slice(0, 300));
}
async function appendAudit(summary, details) {
  const rows = await readJson('audit.json', []);
  rows.unshift({ id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`, ts: Date.now(), createdAt: new Date().toISOString(), actorId: 'system', actorName: 'Systém', action: 'automatic_notification', summary, details });
  await writeJson('audit.json', rows.slice(0, 500));
}
async function sendToUsers(userIds, payload) {
  let pushes = await readJson('push.json', []);
  const wanted = new Set(userIds);
  const targets = pushes.filter((p) => wanted.has(p.userId));
  let sent = 0, failed = 0;
  const dead = new Set();
  for (const p of targets) {
    try { await webpush.sendNotification(p.subscription, JSON.stringify(payload), { TTL: 86400 }); sent++; }
    catch (err) {
      failed++;
      if (err?.statusCode === 404 || err?.statusCode === 410) dead.add(p.id);
      else console.error('cron push', err?.statusCode, err?.message);
    }
  }
  if (dead.size) {
    pushes = pushes.filter((p) => !dead.has(p.id));
    await writeJson('push.json', pushes);
  }
  return { sent, failed, devices: targets.length };
}
function mileageIssues(cfg, recs) {
  const out = [];
  for (const c of cfg.cars.filter((x) => x.active !== false)) {
    const cr = recs.filter((r) => r.carId === c.id).sort((a, b) => a.ts - b.ts);
    for (let i = 1; i < cr.length; i++) {
      if (cr[i].mileage < cr[i - 1].mileage) out.push(`${c.plate}: ${cr[i - 1].mileage} → ${cr[i].mileage} km`);
    }
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'METHOD' });
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return send(res, 401, { error: 'AUTH' });
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return send(res, 500, { error: 'PUSH_NOT_CONFIGURED' });

  try {
    const [cfgRaw, recs, stateRaw] = await Promise.all([
      readJson('config.json', {}), getRecords(), readJson('notification-state.json', {})
    ]);
    const cfg = cfgRaw || {};
    cfg.users ||= [];
    cfg.cars ||= [];
    const s = cfg.notificationSettings || {};
    const state = stateRaw || {};
    state.lastSent ||= {};
    const now = Date.now();
    const results = [];

    if (s.incompleteEnabled) {
      const missing = [];
      for (const c of cfg.cars.filter((x) => x.active !== false)) {
        const noSummer = !!s.incompleteMissingSummer && !latest(recs, c.id, 'summer');
        const noWinter = !!s.incompleteMissingWinter && !latest(recs, c.id, 'winter');
        if (!noSummer && !noWinter) continue;
        const key = `incomplete:${c.id}:${noSummer ? 'S' : ''}${noWinter ? 'W' : ''}`;
        const last = Number(state.lastSent[key] || 0);
        const repeatMs = Math.max(1, Number(s.incompleteRepeatDays || 3)) * 86400000;
        if (now - last < repeatMs) continue;
        missing.push({ car: c, noSummer, noWinter, key });
      }
      if (missing.length) {
        const users = cfg.users.filter((u) => u.active && (s.incompleteRecipients === 'all' || u.role !== 'admin'));
        const lines = missing.slice(0, 5).map((x) => `${x.car.plate}: ${x.noSummer && x.noWinter ? 'chybí letní i zimní DOT' : x.noSummer ? 'chybí letní DOT' : 'chybí zimní DOT'}`);
        const more = missing.length > 5 ? ` (+${missing.length - 5} dalších)` : '';
        const payload = { title: 'Neúplná DOT evidence', body: lines.join(' · ') + more, tag: 'dot-incomplete', url: '/?tab=fleet' };
        const result = await sendToUsers(users.map((u) => u.id), payload);
        if (result.sent > 0 || result.devices > 0) {
          for (const x of missing) state.lastSent[x.key] = now;
          await appendNotificationLog({ type: 'automatic_incomplete', title: payload.title, body: payload.body, recipient: s.incompleteRecipients || 'workers', ...result });
          await appendAudit(`Automatické upozornění na neúplnou evidenci (${missing.length} aut)`, { ...result, cars: missing.map((x) => x.car.id) });
          results.push({ type: 'incomplete', count: missing.length, ...result });
        }
      }
    }

    if (s.adminAnomalyEnabled) {
      const issues = mileageIssues(cfg, recs);
      const key = `adminAnomaly:${issues.join('|')}`;
      const last = Number(state.lastSent[key] || 0);
      const repeatMs = Math.max(1, Number(s.adminAnomalyRepeatDays || 3)) * 86400000;
      if (issues.length && now - last >= repeatMs) {
        const admins = cfg.users.filter((u) => u.active && u.role === 'admin');
        const body = issues.slice(0, 5).join(' · ') + (issues.length > 5 ? ` (+${issues.length - 5} dalších)` : '');
        const payload = { title: 'Podezřelý stav kilometrů', body, tag: 'dot-anomaly', url: '/?tab=admin' };
        const result = await sendToUsers(admins.map((u) => u.id), payload);
        if (result.sent > 0 || result.devices > 0) {
          state.lastSent[key] = now;
          await appendNotificationLog({ type: 'automatic_anomaly', title: payload.title, body, recipient: 'admins', ...result });
          await appendAudit(`Automatické upozornění adminovi na pokles km (${issues.length})`, { ...result, issues });
          results.push({ type: 'anomaly', count: issues.length, ...result });
        }
      }
    }

    if (s.staleEnabled) {
      const staleDays = Math.max(1, Number(s.staleDays || 365));
      const stale = cfg.cars.filter((c) => c.active !== false).filter((c) => {
        const l = latest(recs, c.id);
        return !l || now - l.ts > staleDays * 86400000;
      });
      const key = `stale:${stale.map((c) => c.id).sort().join(',')}:${staleDays}`;
      const last = Number(state.lastSent[key] || 0);
      const repeatMs = Math.max(1, Number(s.adminAnomalyRepeatDays || 3)) * 86400000;
      if (stale.length && now - last >= repeatMs) {
        const admins = cfg.users.filter((u) => u.active && u.role === 'admin');
        const body = stale.slice(0, 5).map((c) => c.plate).join(', ') + (stale.length > 5 ? ` (+${stale.length - 5} dalších)` : '');
        const payload = { title: 'Dlouho neaktualizovaná auta', body: `${body} · limit ${staleDays} dní`, tag: 'dot-stale', url: '/?tab=admin' };
        const result = await sendToUsers(admins.map((u) => u.id), payload);
        if (result.sent > 0 || result.devices > 0) {
          state.lastSent[key] = now;
          await appendNotificationLog({ type: 'automatic_stale', title: payload.title, body: payload.body, recipient: 'admins', ...result });
          await appendAudit(`Automatické upozornění na dlouho neaktualizovaná auta (${stale.length})`, { ...result, cars: stale.map((c) => c.id) });
          results.push({ type: 'stale', count: stale.length, ...result });
        }
      }
    }

    await writeJson('notification-state.json', state);
    return send(res, 200, { ok: true, ranAt: new Date().toISOString(), results });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'SERVER' });
  }
}
