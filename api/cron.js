import { put, get, list } from '@vercel/blob';
import webpush from 'web-push';
import { mutateBlobJsonArray } from '../lib/blob-json.js';
import { noticeAudit, touchNoticeSync } from '../lib/manual-notifications.js';

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
function canReceiveNotifications(user) { return user?.role === 'admin' || user?.permissions?.notificationsReceive !== false; }
function nid(prefix = 'n') { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
async function createNotification(row) {
  const n = { id: nid(), ts: Date.now(), createdAt: new Date().toISOString(), channel:'automatic', severity:'info', requiresAck:false, recipientUserIds: [...new Set((row.recipientUserIds || []).filter(Boolean))], acks: [], seen: [], ...row };
  await mutateBlobJsonArray('notifications.json', rows=>({rows:[n,...rows].slice(0,500),changed:true}));
  await touchNoticeSync(); return n;
}
async function patchNotification(id, patch) {
  const out=await mutateBlobJsonArray('notifications.json',rows=>{const n=rows.find(x=>x.id===id);if(n)Object.assign(n,patch);return {rows,changed:!!n,notice:n||null}});return out.notice;
}
async function appendAudit(summary, details) {
  await noticeAudit(null,'automatic_notification',summary,details);
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
    await mutateBlobJsonArray('push.json',rows=>({rows:rows.filter(p=>!dead.has(p.id)),changed:rows.some(p=>dead.has(p.id))}));
  }
  return { sent, failed, devices: targets.length };
}
function mileageIssues(cfg, recs) {
  const out = [];
  for (const car of cfg.cars.filter((x) => x.active !== false)) {
    const cr = recs.filter((r) => r.carId === car.id).sort((a, b) => a.ts - b.ts);
    let lastIssue = null;
    for (let i = 1; i < cr.length; i++) {
      if (cr[i].mileage < cr[i - 1].mileage) lastIssue = { carId: car.id, plate: car.plate, vehicle: car.name, from: cr[i - 1].mileage, to: cr[i].mileage, recordId: cr[i].id };
    }
    if (lastIssue) out.push(lastIssue);
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
    if ((cfg.system?.mode || 'normal') === 'maintenance') return send(res, 200, { ok: true, skipped: 'maintenance' });
    const s = cfg.notificationSettings || {};
    const state = stateRaw || {};
    state.lastSent ||= {};
    const now = Date.now();
    const results = [];

    if (s.incompleteEnabled) {
      const users = cfg.users.filter((u) => u.active && canReceiveNotifications(u) && (s.incompleteRecipients === 'all' || u.role !== 'admin'));
      for (const car of cfg.cars.filter((x) => x.active !== false)) {
        const noSummer = !!s.incompleteMissingSummer && !latest(recs, car.id, 'summer');
        const noWinter = !!s.incompleteMissingWinter && !latest(recs, car.id, 'winter');
        if (!noSummer && !noWinter) continue;
        const key = 'incomplete:' + car.id + ':' + (noSummer ? 'S' : '') + (noWinter ? 'W' : '');
        const lastSent = Number(state.lastSent[key] || 0);
        const repeatMs = Math.max(1, Number(s.incompleteRepeatDays || 3)) * 86400000;
        if (now - lastSent < repeatMs) continue;
        const body = noSummer && noWinter ? 'Chybí letní i zimní DOT.' : noSummer ? 'Chybí letní DOT.' : 'Chybí zimní DOT.';
        const n = await createNotification({
          type: 'automatic_incomplete', title: 'Neúplná DOT evidence – ' + car.plate, body,
          recipient: s.incompleteRecipients || 'workers', recipientUserIds: users.map((u) => u.id), carId: car.id, carPlate: car.plate, byUserId: 'system', byUserName: 'Systém',
        });
        const result = await sendToUsers(users.map((u) => u.id), { title: n.title, body: n.body, tag: 'notification-' + n.id, url: '/?notification=' + encodeURIComponent(n.id) });
        await patchNotification(n.id, result);
        state.lastSent[key] = now;
        await appendAudit('Automatické upozornění na neúplnou evidenci ' + car.plate, { notificationId: n.id, carId: car.id, ...result });
        results.push({ type: 'incomplete', carId: car.id, ...result });
      }
    }

    if (s.adminAnomalyEnabled) {
      const admins = cfg.users.filter((u) => u.active && u.role === 'admin');
      const issues = mileageIssues(cfg, recs);
      for (const issue of issues) {
        const key = 'adminAnomaly:' + issue.carId + ':' + issue.from + ':' + issue.to;
        const lastSent = Number(state.lastSent[key] || 0);
        const repeatMs = Math.max(1, Number(s.adminAnomalyRepeatDays || 3)) * 86400000;
        if (now - lastSent < repeatMs) continue;
        const body = 'Pokles km: ' + issue.from + ' → ' + issue.to + ' km.';
        const n = await createNotification({
          type: 'automatic_anomaly', title: 'Podezřelý stav kilometrů – ' + issue.plate, body,
          recipient: 'admins', recipientUserIds: admins.map((u) => u.id), carId: issue.carId, carPlate: issue.plate, byUserId: 'system', byUserName: 'Systém',
        });
        const result = await sendToUsers(admins.map((u) => u.id), { title: n.title, body: n.body, tag: 'notification-' + n.id, url: '/?notification=' + encodeURIComponent(n.id) });
        await patchNotification(n.id, result);
        state.lastSent[key] = now;
        await appendAudit('Automatické upozornění na pokles km ' + issue.plate, { notificationId: n.id, carId: issue.carId, issue, ...result });
        results.push({ type: 'anomaly', carId: issue.carId, ...result });
      }
    }

    if (s.staleEnabled) {
      const admins = cfg.users.filter((u) => u.active && u.role === 'admin');
      const staleDays = Math.max(1, Number(s.staleDays || 365));
      for (const car of cfg.cars.filter((x) => x.active !== false)) {
        const l = latest(recs, car.id);
        if (l && now - l.ts <= staleDays * 86400000) continue;
        const key = 'stale:' + car.id + ':' + staleDays;
        const lastSent = Number(state.lastSent[key] || 0);
        const repeatMs = Math.max(1, Number(s.adminAnomalyRepeatDays || 3)) * 86400000;
        if (now - lastSent < repeatMs) continue;
        const body = l ? 'Poslední záznam je starší než ' + staleDays + ' dní.' : 'Vozidlo zatím nemá žádný DOT záznam.';
        const n = await createNotification({
          type: 'automatic_stale', title: 'Neaktualizované vozidlo – ' + car.plate, body,
          recipient: 'admins', recipientUserIds: admins.map((u) => u.id), carId: car.id, carPlate: car.plate, byUserId: 'system', byUserName: 'Systém',
        });
        const result = await sendToUsers(admins.map((u) => u.id), { title: n.title, body: n.body, tag: 'notification-' + n.id, url: '/?notification=' + encodeURIComponent(n.id) });
        await patchNotification(n.id, result);
        state.lastSent[key] = now;
        await appendAudit('Automatické upozornění na neaktualizované vozidlo ' + car.plate, { notificationId: n.id, carId: car.id, ...result });
        results.push({ type: 'stale', carId: car.id, ...result });
      }
    }

    await writeJson('notification-state.json', state);
    return send(res, 200, { ok: true, ranAt: new Date().toISOString(), results });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'SERVER' });
  }
}
