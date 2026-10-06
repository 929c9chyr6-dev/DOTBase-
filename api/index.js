import { put, get, list, del } from '@vercel/blob';
import crypto from 'node:crypto';
import webpush from 'web-push';

const SECRET = process.env.SESSION_SECRET || 'missing-secret';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const attempts = globalThis.__dotAttempts || (globalThis.__dotAttempts = new Map());

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('https://dotbase-shared.vercel.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const DEFAULT_NOTIFICATION_SETTINGS = {
  incompleteEnabled: false,
  incompleteRepeatDays: 3,
  incompleteMissingSummer: true,
  incompleteMissingWinter: true,
  incompleteRecipients: 'workers',
  adminAnomalyEnabled: false,
  adminAnomalyRepeatDays: 3,
  staleEnabled: false,
  staleDays: 365,
};

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function pinHash(pin) {
  return crypto.createHmac('sha256', SECRET).update(String(pin)).digest('hex');
}
function safeEqualHex(a, b) {
  try { return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); }
  catch { return false; }
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verify(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const good = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}
function auth(req) {
  const h = String(req.headers.authorization || '');
  return verify(h.startsWith('Bearer ') ? h.slice(7) : '');
}
function ip(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}
function cleanPlate(v) {
  return String(v || '').toUpperCase().replace(/\s+/g, '').trim().slice(0, 16);
}
function cleanText(v, max = 100) {
  return String(v || '').trim().slice(0, max);
}
function uid(prefix = '') {
  return prefix + crypto.randomUUID().replaceAll('-', '').slice(0, 12);
}
async function readJson(path, fallback) {
  const r = await get(path, { access: 'private', useCache: false });
  if (r?.statusCode === 200) {
    try { return JSON.parse(await new Response(r.stream).text()); }
    catch { return fallback; }
  }
  return fallback;
}
async function writeJson(path, value) {
  await put(path, JSON.stringify(value), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json'
  });
}
function normalizeConfig(cfg) {
  cfg ||= {};
  cfg.version = 3;
  cfg.users ||= [];
  cfg.cars ||= [];
  cfg.notificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...(cfg.notificationSettings || {}) };
  for (const u of cfg.users) {
    if (u.active === undefined) u.active = true;
    if (!u.createdAt) u.createdAt = null;
    if (!u.lastLoginAt) u.lastLoginAt = null;
  }
  for (const c of cfg.cars) {
    if (c.active === undefined) c.active = true;
    if (!c.createdAt) c.createdAt = null;
    if (!c.updatedAt) c.updatedAt = null;
  }
  return cfg;
}
async function writeConfig(cfg) { await writeJson('config.json', normalizeConfig(cfg)); }
async function readConfig() {
  let cfg = await readJson('config.json', null);
  if (cfg) return normalizeConfig(cfg);
  const now = new Date().toISOString();
  cfg = normalizeConfig({
    users: [
      { id: 'u1', name: 'Admin', role: 'admin', pinHash: pinHash(process.env.INITIAL_ADMIN_PIN), active: true, createdAt: now },
      { id: 'u2', name: 'Pracovník 1', role: 'user', pinHash: pinHash(process.env.INITIAL_USER1_PIN), active: true, createdAt: now },
      { id: 'u3', name: 'Pracovník 2', role: 'user', pinHash: pinHash(process.env.INITIAL_USER2_PIN), active: true, createdAt: now },
      { id: 'u4', name: 'Pracovník 3', role: 'user', pinHash: pinHash(process.env.INITIAL_USER3_PIN), active: true, createdAt: now },
    ],
    cars: [],
  });
  await writeConfig(cfg);
  return cfg;
}
async function getRecords() {
  let blobs = [], cursor;
  do {
    const r = await list({ prefix: 'records/', limit: 1000, cursor });
    blobs.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor && blobs.length < 10000);
  return blobs.map((b) => {
    const file = b.pathname.split('/').pop().replace(/\.rec$/, '');
    const p = file.split('_');
    if (p.length < 7) return null;
    const [ts, id, carId, season, dot, mileage, userId] = p;
    const n = Number(ts);
    if (!Number.isFinite(n)) return null;
    return { path: b.pathname, ts: n, id, carId, season, dot, mileage: Number(mileage), userId, createdAt: new Date(n).toISOString() };
  }).filter(Boolean).sort((a, b) => b.ts - a.ts);
}
async function getAudit() { return await readJson('audit.json', []); }
async function appendAudit(actor, action, summary, details = null) {
  const audit = await getAudit();
  audit.unshift({ id: uid('a'), ts: Date.now(), createdAt: new Date().toISOString(), actorId: actor?.id || 'system', actorName: actor?.name || 'Systém', action, summary, details });
  await writeJson('audit.json', audit.slice(0, 500));
}
async function getPushStore() { return await readJson('push.json', []); }
async function writePushStore(rows) { await writeJson('push.json', rows.slice(0, 1000)); }
async function getNotificationLog() { return await readJson('notifications.json', []); }
async function writeNotificationLog(rows) { await writeJson('notifications.json', rows.slice(0, 500)); }
async function createNotification(row) {
  const rows = await getNotificationLog();
  const n = {
    id: uid('n'), ts: Date.now(), createdAt: new Date().toISOString(),
    recipientUserIds: [...new Set((row.recipientUserIds || []).filter(Boolean))],
    acks: [],
    ...row,
  };
  rows.unshift(n);
  await writeNotificationLog(rows);
  return n;
}
async function patchNotification(id, patch) {
  const rows = await getNotificationLog();
  const n = rows.find((x) => x.id === id);
  if (!n) return null;
  Object.assign(n, patch);
  await writeNotificationLog(rows);
  return n;
}
function enrichRecords(cfg, recs) {
  const byUser = Object.fromEntries(cfg.users.map((u) => [u.id, u.name]));
  const byCar = Object.fromEntries(cfg.cars.map((c) => [c.id, c]));
  return recs.map((r) => ({ ...r, userName: byUser[r.userId] || 'Neznámý', plate: byCar[r.carId]?.plate || 'Archiv', vehicle: byCar[r.carId]?.name || '' }));
}
function latestRecord(recs, carId, season) {
  return recs.find((r) => r.carId === carId && (!season || r.season === season));
}
async function buildVehicleDetail(cfg, recs, carId) {
  const car = cfg.cars.find((c) => c.id === carId);
  if (!car) return null;
  const enriched = enrichRecords(cfg, recs).filter((r) => r.carId === carId);
  const audit = await getAudit();
  const timeline = audit.filter((a) => {
    const d = a.details || {};
    return d.carId === carId || d.id === carId || d.before?.carId === carId || d.after?.carId === carId ||
      d.before?.id === carId || d.after?.id === carId || (Array.isArray(d.carIds) && d.carIds.includes(carId)) ||
      String(a.summary || '').includes(car.plate);
  }).slice(0, 5).map((a) => ({
    id: a.id, createdAt: a.createdAt, actorName: a.actorName, action: a.action, summary: a.summary,
  }));
  return {
    car: { id: car.id, plate: car.plate, name: car.name, active: car.active !== false, createdAt: car.createdAt, updatedAt: car.updatedAt },
    latest: enriched[0] || null,
    latestSummer: enriched.find((r) => r.season === 'summer') || null,
    latestWinter: enriched.find((r) => r.season === 'winter') || null,
    records: enriched.slice(0, 5),
    timeline,
  };
}
function computeIssues(cfg, recs) {
  const issues = [];
  const activeCars = cfg.cars.filter((c) => c.active !== false);
  const now = Date.now();
  for (const c of activeCars) {
    const cr = recs.filter((r) => r.carId === c.id).sort((a, b) => a.ts - b.ts);
    const s = [...cr].reverse().find((r) => r.season === 'summer');
    const w = [...cr].reverse().find((r) => r.season === 'winter');
    const l = cr.at(-1);
    if (!s) issues.push({ type: 'missing_summer', carId: c.id, plate: c.plate, vehicle: c.name, text: 'Chybí letní DOT' });
    if (!w) issues.push({ type: 'missing_winter', carId: c.id, plate: c.plate, vehicle: c.name, text: 'Chybí zimní DOT' });
    if (!l) issues.push({ type: 'no_record', carId: c.id, plate: c.plate, vehicle: c.name, text: 'Bez jediného záznamu' });
    if (l && cfg.notificationSettings.staleEnabled && now - l.ts > Number(cfg.notificationSettings.staleDays || 365) * 86400000) {
      issues.push({ type: 'stale', carId: c.id, plate: c.plate, vehicle: c.name, text: `Poslední záznam starší než ${cfg.notificationSettings.staleDays} dní` });
    }
    for (let i = 1; i < cr.length; i++) {
      if (cr[i].mileage < cr[i - 1].mileage) {
        issues.push({ type: 'mileage_drop', carId: c.id, plate: c.plate, vehicle: c.name, recordId: cr[i].id, text: `Pokles km: ${cr[i - 1].mileage} → ${cr[i].mileage}` });
      }
    }
  }
  return issues;
}
function dashboard(cfg, recs) {
  const activeCars = cfg.cars.filter((c) => c.active !== false);
  let complete = 0;
  for (const c of activeCars) if (latestRecord(recs, c.id, 'summer') && latestRecord(recs, c.id, 'winter')) complete++;
  const issues = computeIssues(cfg, recs);
  return {
    activeCars: activeCars.length,
    archivedCars: cfg.cars.length - activeCars.length,
    complete,
    incomplete: activeCars.length - complete,
    records: recs.length,
    anomalyCount: issues.filter((x) => x.type === 'mileage_drop').length,
    issues: issues.slice(0, 100),
  };
}
function userStats(cfg, recs, pushes) {
  return cfg.users.map((u) => {
    const own = recs.filter((r) => r.userId === u.id);
    return {
      id: u.id, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt || null,
      lastLoginAt: u.lastLoginAt || null, recordCount: own.length, lastRecordAt: own[0]?.createdAt || null,
      pushDevices: pushes.filter((p) => p.userId === u.id).length,
    };
  });
}
async function publicState(cfg, recs, session) {
  const baseUsers = cfg.users.map((u) => ({ id: u.id, name: u.name, role: u.role, active: u.active }));
  const records = enrichRecords(cfg, recs);
  const notifications = await getNotificationLog();
  const carById = Object.fromEntries(cfg.cars.map((c) => [c.id, c]));
  const pendingNotifications = notifications.filter((n) =>
    Array.isArray(n.recipientUserIds) && n.recipientUserIds.includes(session.uid) &&
    !(n.acks || []).some((a) => a.userId === session.uid)
  ).map((n) => ({
    id: n.id, type: n.type, title: n.title, body: n.body, createdAt: n.createdAt,
    carId: n.carId || null, carPlate: n.carId ? (carById[n.carId]?.plate || '') : '',
  }));
  const base = {
    me: baseUsers.find((u) => u.id === session.uid),
    cars: cfg.cars.filter((c) => c.active !== false),
    records,
    pendingNotifications,
    push: { publicKey: VAPID_PUBLIC_KEY },
  };
  if (session.role !== 'admin') return base;
  const [audit, pushes] = await Promise.all([getAudit(), getPushStore()]);
  return {
    ...base,
    users: userStats(cfg, recs, pushes),
    allCars: cfg.cars,
    dashboard: dashboard(cfg, recs),
    audit: audit.slice(0, 200),
    notificationLog: notifications.slice(0, 150).map((n) => ({ ...n, carPlate: n.carId ? (carById[n.carId]?.plate || '') : '' })),
    notificationSettings: cfg.notificationSettings,
  };
}
function validateRecordFields(car, season, dot, mileage) {
  if (!car) return 'CAR';
  if (!['summer', 'winter'].includes(season)) return 'SEASON';
  if (!/^\d{4}$/.test(dot) || Number(dot.slice(0, 2)) < 1 || Number(dot.slice(0, 2)) > 53) return 'DOT';
  if (!Number.isInteger(mileage) || mileage < 0 || mileage > 9_999_999) return 'MILEAGE';
  return null;
}
function recordPath({ ts, id, carId, season, dot, mileage, userId }) {
  return `records/${[ts, id, carId, season, dot, mileage, userId].join('_')}.rec`;
}
function randomFreePin(cfg, excludeId = null) {
  const used = new Set(cfg.users.filter((u) => u.active && u.id !== excludeId).map((u) => u.pinHash));
  const available = [];
  for (let n = 0; n <= 99; n++) {
    const p = String(n).padStart(2, '0');
    if (!used.has(pinHash(p))) available.push(p);
  }
  if (!available.length) return null;
  return available[crypto.randomInt(available.length)];
}
async function sendPushToUsers(cfg, userIds, payload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return { sent: 0, failed: 0, reason: 'PUSH_NOT_CONFIGURED' };
  let pushes = await getPushStore();
  const wanted = new Set(userIds);
  const targets = pushes.filter((p) => wanted.has(p.userId));
  let sent = 0, failed = 0;
  const dead = new Set();
  for (const p of targets) {
    try {
      await webpush.sendNotification(p.subscription, JSON.stringify(payload), { TTL: 86400 });
      sent++;
    } catch (err) {
      failed++;
      if (err?.statusCode === 404 || err?.statusCode === 410) dead.add(p.id);
      else console.error('push', err?.statusCode, err?.message);
    }
  }
  if (dead.size) {
    pushes = pushes.filter((p) => !dead.has(p.id));
    await writePushStore(pushes);
  }
  return { sent, failed, devices: targets.length };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body ||= {};

  try {
    if (body.action === 'login') {
      const key = ip(req);
      const a = attempts.get(key) || { n: 0, blocked: 0 };
      if (a.blocked > Date.now()) return json(res, 429, { error: 'LOCKED', seconds: Math.ceil((a.blocked - Date.now()) / 1000) });
      const pin = String(body.pin || '');
      if (!/^\d{2}$/.test(pin)) return json(res, 400, { error: 'PIN' });
      const cfg = await readConfig();
      const h = pinHash(pin);
      const u = cfg.users.find((x) => x.active && safeEqualHex(x.pinHash, h));
      if (!u) {
        a.n += 1;
        if (a.n >= 5) { a.blocked = Date.now() + 10 * 60 * 1000; a.n = 0; }
        attempts.set(key, a);
        await new Promise((r) => setTimeout(r, 450));
        return json(res, 401, { error: 'BAD_PIN' });
      }
      attempts.delete(key);
      u.lastLoginAt = new Date().toISOString();
      await writeConfig(cfg);
      const token = sign({ uid: u.id, role: u.role, exp: Date.now() + 12 * 60 * 60 * 1000 });
      return json(res, 200, { token, user: { id: u.id, name: u.name, role: u.role } });
    }

    const session = auth(req);
    if (!session) return json(res, 401, { error: 'AUTH' });
    const cfg = await readConfig();
    const currentUser = cfg.users.find((x) => x.id === session.uid && x.active);
    if (!currentUser) return json(res, 401, { error: 'AUTH' });

    if (body.action === 'state') return json(res, 200, await publicState(cfg, await getRecords(), session));

    if (body.action === 'addRecord') {
      const car = cfg.cars.find((c) => c.id === body.carId && c.active !== false);
      const season = String(body.season || ''), dot = String(body.dot || ''), mileage = Number(body.mileage);
      const error = validateRecordFields(car, season, dot, mileage);
      if (error) return json(res, 400, { error });
      const r = { ts: Date.now(), id: uid(), carId: car.id, season, dot, mileage, userId: currentUser.id };
      await put(recordPath(r), '1', { access: 'private', addRandomSuffix: false, contentType: 'text/plain' });
      await appendAudit(currentUser, 'record_add', `Přidán záznam ${car.plate} · ${season === 'summer' ? 'Letní' : 'Zimní'} · DOT ${dot} · ${mileage} km`, r);
      return json(res, 200, { ok: true });
    }

    if (body.action === 'pushSubscribe') {
      if (!body.subscription?.endpoint) return json(res, 400, { error: 'SUBSCRIPTION' });
      let rows = await getPushStore();
      const endpoint = String(body.subscription.endpoint);
      const id = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24);
      const row = { id, userId: currentUser.id, subscription: body.subscription, createdAt: new Date().toISOString(), userAgent: cleanText(req.headers['user-agent'], 240) };
      rows = rows.filter((p) => p.id !== id);
      rows.push(row);
      await writePushStore(rows);
      return json(res, 200, { ok: true });
    }

    if (body.action === 'pushUnsubscribe') {
      const endpoint = String(body.endpoint || '');
      if (!endpoint) return json(res, 400, { error: 'SUBSCRIPTION' });
      const id = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24);
      let rows = await getPushStore();
      rows = rows.filter((p) => !(p.id === id && p.userId === currentUser.id));
      await writePushStore(rows);
      return json(res, 200, { ok: true });
    }

    if (body.action === 'notificationRespond') {
      const notificationId = String(body.notificationId || '');
      const response = String(body.response || '');
      if (!['understood', 'view_vehicle'].includes(response)) return json(res, 400, { error: 'RESPONSE' });
      const notifications = await getNotificationLog();
      const n = notifications.find((x) => x.id === notificationId);
      if (!n || !Array.isArray(n.recipientUserIds) || !n.recipientUserIds.includes(currentUser.id)) return json(res, 403, { error: 'NOTIFICATION' });
      let ack = (n.acks || []).find((a) => a.userId === currentUser.id);
      if (!ack) {
        ack = { userId: currentUser.id, userName: currentUser.name, response, at: new Date().toISOString() };
        n.acks ||= [];
        n.acks.push(ack);
        await writeNotificationLog(notifications);
        const responseText = response === 'view_vehicle' ? 'zobrazil vozidlo' : 'potvrdil Rozumím';
        await appendAudit(currentUser, 'notification_ack', currentUser.name + ' ' + responseText + ': ' + n.title, { notificationId: n.id, carId: n.carId || null, response });
        const adminIds = cfg.users.filter((u) => u.active && u.role === 'admin' && u.id !== currentUser.id).map((u) => u.id);
        if (adminIds.length) {
          await sendPushToUsers(cfg, adminIds, {
            title: 'Potvrzeno oznámení',
            body: currentUser.name + ': ' + (response === 'view_vehicle' ? 'Zobrazil vozidlo' : 'Rozumím') + ' – ' + n.title,
            tag: 'ack-' + n.id + '-' + currentUser.id,
            url: '/?tab=admin',
          });
        }
      }
      if (response === 'view_vehicle') {
        if (!n.carId) return json(res, 400, { error: 'CAR' });
        const vehicle = await buildVehicleDetail(cfg, await getRecords(), n.carId);
        if (!vehicle) return json(res, 404, { error: 'CAR' });
        return json(res, 200, { ok: true, vehicle });
      }
      return json(res, 200, { ok: true });
    }

    if (session.role !== 'admin') return json(res, 403, { error: 'ADMIN' });

    if (body.action === 'adminVehicleDetail') {
      const vehicle = await buildVehicleDetail(cfg, await getRecords(), String(body.carId || ''));
      if (!vehicle) return json(res, 404, { error: 'CAR' });
      return json(res, 200, { ok: true, vehicle });
    }

    if (body.action === 'adminAddCar') {
      const plate = cleanPlate(body.plate), name = cleanText(body.name, 80);
      if (!plate) return json(res, 400, { error: 'PLATE' });
      if (cfg.cars.some((c) => c.plate === plate)) return json(res, 409, { error: 'DUPLICATE' });
      const now = new Date().toISOString();
      const car = { id: uid('c'), plate, name, active: true, createdAt: now, updatedAt: now };
      cfg.cars.push(car); await writeConfig(cfg);
      await appendAudit(currentUser, 'car_add', `Přidáno auto ${plate} ${name}`, car);
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminUpdateCar') {
      const car = cfg.cars.find((c) => c.id === body.carId);
      if (!car) return json(res, 404, { error: 'CAR' });
      const plate = cleanPlate(body.plate), name = cleanText(body.name, 80);
      if (!plate) return json(res, 400, { error: 'PLATE' });
      if (cfg.cars.some((c) => c.id !== car.id && c.plate === plate)) return json(res, 409, { error: 'DUPLICATE' });
      const before = { plate: car.plate, name: car.name };
      car.plate = plate; car.name = name; car.updatedAt = new Date().toISOString();
      await writeConfig(cfg);
      await appendAudit(currentUser, 'car_edit', `Upraveno auto ${before.plate} → ${plate}`, { carId: car.id, before, after: { carId: car.id, plate, name } });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminSetCarActive') {
      const car = cfg.cars.find((c) => c.id === body.carId);
      if (!car) return json(res, 404, { error: 'CAR' });
      car.active = !!body.active; car.updatedAt = new Date().toISOString();
      await writeConfig(cfg);
      await appendAudit(currentUser, car.active ? 'car_restore' : 'car_archive', `${car.active ? 'Obnoveno' : 'Archivováno'} auto ${car.plate}`, { carId: car.id });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminBulkCars') {
      const ids = Array.isArray(body.carIds) ? body.carIds.slice(0, 500) : [];
      const active = !!body.active;
      let n = 0;
      for (const car of cfg.cars) if (ids.includes(car.id)) { car.active = active; car.updatedAt = new Date().toISOString(); n++; }
      await writeConfig(cfg);
      await appendAudit(currentUser, active ? 'cars_bulk_restore' : 'cars_bulk_archive', `${active ? 'Obnoveno' : 'Archivováno'} ${n} aut`, { carIds: ids });
      return json(res, 200, { ok: true, count: n });
    }

    if (body.action === 'adminImportCars') {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 1000) : [];
      let added = 0, skipped = 0;
      const existing = new Set(cfg.cars.map((c) => c.plate));
      const now = new Date().toISOString();
      for (const row of rows) {
        const plate = cleanPlate(row?.plate), name = cleanText(row?.name, 80);
        if (!plate || existing.has(plate)) { skipped++; continue; }
        cfg.cars.push({ id: uid('c'), plate, name, active: true, createdAt: now, updatedAt: now });
        existing.add(plate); added++;
      }
      await writeConfig(cfg);
      await appendAudit(currentUser, 'cars_import', `Import aut: přidáno ${added}, přeskočeno ${skipped}`, { added, skipped });
      return json(res, 200, { ok: true, added, skipped });
    }

    if (body.action === 'adminEditRecord') {
      const recs = await getRecords();
      const r = recs.find((x) => x.path === body.path || x.id === body.recordId);
      if (!r) return json(res, 404, { error: 'RECORD' });
      const car = cfg.cars.find((c) => c.id === (body.carId || r.carId));
      const season = String(body.season || r.season), dot = String(body.dot || r.dot), mileage = Number(body.mileage);
      const error = validateRecordFields(car, season, dot, mileage);
      if (error) return json(res, 400, { error });
      const before = { ...r };
      const after = { ...r, carId: car.id, season, dot, mileage };
      const newPath = recordPath(after);
      await put(newPath, '1', { access: 'private', addRandomSuffix: false, contentType: 'text/plain' });
      if (newPath !== r.path) await del(r.path);
      await appendAudit(currentUser, 'record_edit', `Upraven záznam ${car.plate}: DOT ${before.dot} → ${dot}, km ${before.mileage} → ${mileage}`, { before, after: { ...after, path: newPath } });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminDeleteRecord') {
      const path = String(body.path || '');
      if (!path.startsWith('records/')) return json(res, 400, { error: 'PATH' });
      const recs = await getRecords();
      const r = recs.find((x) => x.path === path);
      await del(path);
      const car = r ? cfg.cars.find((c) => c.id === r.carId) : null;
      await appendAudit(currentUser, 'record_delete', `Smazán záznam ${car?.plate || ''} ${r ? `DOT ${r.dot} · ${r.mileage} km` : ''}`.trim(), r || { path });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminAddUser') {
      const name = cleanText(body.name, 40), pin = String(body.pin || '');
      if (!name) return json(res, 400, { error: 'NAME' });
      if (!/^\d{2}$/.test(pin)) return json(res, 400, { error: 'PIN' });
      const h = pinHash(pin);
      if (cfg.users.some((u) => u.active && safeEqualHex(u.pinHash, h))) return json(res, 409, { error: 'PIN_USED' });
      const u = { id: uid('u'), name, role: 'user', pinHash: h, active: true, createdAt: new Date().toISOString(), lastLoginAt: null };
      cfg.users.push(u); await writeConfig(cfg);
      await appendAudit(currentUser, 'user_add', `Přidán uživatel ${name}`, { userId: u.id });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminUpdateUser') {
      const target = cfg.users.find((x) => x.id === body.userId);
      if (!target) return json(res, 404, { error: 'USER' });
      const before = { name: target.name, active: target.active };
      const name = cleanText(body.name, 40);
      if (name) target.name = name;
      if (body.pin !== undefined && body.pin !== '') {
        const p = String(body.pin);
        if (!/^\d{2}$/.test(p)) return json(res, 400, { error: 'PIN' });
        const h = pinHash(p);
        if (cfg.users.some((x) => x.id !== target.id && x.active && safeEqualHex(x.pinHash, h))) return json(res, 409, { error: 'PIN_USED' });
        target.pinHash = h;
      }
      if (typeof body.active === 'boolean' && target.role !== 'admin') target.active = body.active;
      await writeConfig(cfg);
      await appendAudit(currentUser, 'user_edit', `Upraven uživatel ${target.name}`, { userId: target.id, before, after: { name: target.name, active: target.active }, pinChanged: body.pin !== undefined && body.pin !== '' });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminGeneratePin') {
      const target = cfg.users.find((x) => x.id === body.userId);
      if (!target) return json(res, 404, { error: 'USER' });
      const pin = randomFreePin(cfg, target.id);
      if (!pin) return json(res, 409, { error: 'NO_PIN' });
      target.pinHash = pinHash(pin);
      await writeConfig(cfg);
      await appendAudit(currentUser, 'user_pin_reset', `Vygenerován nový PIN pro ${target.name}`, { userId: target.id });
      return json(res, 200, { ok: true, pin });
    }

    if (body.action === 'adminSaveNotificationSettings') {
      const s = body.settings || {};
      cfg.notificationSettings = {
        incompleteEnabled: !!s.incompleteEnabled,
        incompleteRepeatDays: Math.min(30, Math.max(1, Number(s.incompleteRepeatDays) || 3)),
        incompleteMissingSummer: !!s.incompleteMissingSummer,
        incompleteMissingWinter: !!s.incompleteMissingWinter,
        incompleteRecipients: s.incompleteRecipients === 'all' ? 'all' : 'workers',
        adminAnomalyEnabled: !!s.adminAnomalyEnabled,
        adminAnomalyRepeatDays: Math.min(30, Math.max(1, Number(s.adminAnomalyRepeatDays) || 3)),
        staleEnabled: !!s.staleEnabled,
        staleDays: Math.min(3650, Math.max(1, Number(s.staleDays) || 365)),
      };
      await writeConfig(cfg);
      await appendAudit(currentUser, 'notification_settings', 'Upraveno nastavení automatických oznámení', cfg.notificationSettings);
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminSendNotification') {
      const title = cleanText(body.title, 80), message = cleanText(body.message, 240), recipient = String(body.recipient || 'all');
      if (!title || !message) return json(res, 400, { error: 'MESSAGE' });
      let users = cfg.users.filter((u) => u.active);
      if (recipient !== 'all') users = users.filter((u) => u.id === recipient);
      if (!users.length) return json(res, 404, { error: 'USER' });
      const carId = body.carId ? String(body.carId) : null;
      const car = carId ? cfg.cars.find((c) => c.id === carId) : null;
      if (carId && !car) return json(res, 404, { error: 'CAR' });
      const n = await createNotification({
        type: 'manual', title, body: message, recipient, recipientUserIds: users.map((u) => u.id),
        carId: car?.id || null, carPlate: car?.plate || '', byUserId: currentUser.id, byUserName: currentUser.name,
      });
      const result = await sendPushToUsers(cfg, users.map((u) => u.id), {
        title, body: message, tag: 'notification-' + n.id, url: '/?notification=' + encodeURIComponent(n.id),
      });
      await patchNotification(n.id, result);
      await appendAudit(currentUser, 'notification_send', 'Odesláno oznámení „' + title + '“ (' + result.sent + '/' + (result.devices || 0) + ')', { notificationId: n.id, recipient, carId: car?.id || null, ...result });
      return json(res, 200, { ok: true, notificationId: n.id, ...result });
    }

    if (body.action === 'adminBackup') {
      const [recs, audit, notifications] = await Promise.all([getRecords(), getAudit(), getNotificationLog()]);
      const safeUsers = cfg.users.map(({ pinHash, ...u }) => u);
      return json(res, 200, { version: 3, exportedAt: new Date().toISOString(), users: safeUsers, cars: cfg.cars, records: enrichRecords(cfg, recs), audit, notifications, notificationSettings: cfg.notificationSettings });
    }

    return json(res, 400, { error: 'ACTION' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'SERVER' });
  }
}
