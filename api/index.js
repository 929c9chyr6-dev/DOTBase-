import { put, get, list, del } from '@vercel/blob';
import crypto from 'node:crypto';
import webpush from 'web-push';

const SECRET = process.env.SESSION_SECRET || 'missing-secret';
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const GOLEMIO_API_KEY = process.env.GOLEMIO_API_KEY || '';
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
const DEFAULT_TRANSPORT_CORRIDORS = [
  { id:'jenec', name:'Jeneč a okolí', type:'area', active:true, notifyAllowed:true, description:'Perimetr obce Jeneč a nejbližšího okolí.', matchTerms:['jeneč','jenec','hostivice','dobrovíz','dobroviz'] },
  { id:'d0-west', name:'D0 · Středokluky → Lochkov', type:'route', active:true, notifyAllowed:true, description:'Západní část Pražského okruhu od Středokluk po Lochkov.', matchTerms:['pražský okruh','prazsky okruh','d0','středokluky','stredokluky','ruzyň','ruzyne','zličín','zlicin','třebonice','trebonice','slivenec','lochkov'] },
  { id:'lochkov-tunnels', name:'Tunely u Lochkova', type:'route', active:true, notifyAllowed:true, description:'Tunelové úseky a bezprostřední okolí Lochkova.', matchTerms:['lochkov','lochkovský tunel','lochkovsky tunel','tunel lochkov'] },
  { id:'d6-west', name:'D6 · Praha → Velká Dobrá', type:'route', active:true, notifyAllowed:true, description:'D6 od Prahy směrem na Velkou Dobrou.', matchTerms:['d6','velká dobrá','velka dobra','pavlov','jinočany','jinocany','hostivice','ruzyň','ruzyne'] },
  { id:'rozvadovska', name:'Rozvadovská spojka', type:'route', active:true, notifyAllowed:true, description:'Rozvadovská spojka a navazující příjezdy.', matchTerms:['rozvadovská spojka','rozvadovska spojka','rozvadovská','rozvadovska'] },
  { id:'plzenska', name:'Plzeňská', type:'route', active:true, notifyAllowed:true, description:'Hlavní tah Plzeňskou ulicí.', matchTerms:['plzeňská','plzenska'] },
  { id:'evropska', name:'Evropská', type:'route', active:true, notifyAllowed:true, description:'Hlavní tah Evropskou ulicí.', matchTerms:['evropská','evropska'] },
];
const DEFAULT_TRANSPORT_SETTINGS = {
  enabled: true,
  notificationsEnabled: true,
  cacheMinutes: 3,
  pollMinutes: 5,
};
const DEFAULT_TRANSPORT_PREFS = {
  notificationsEnabled: false,
  corridorIds: [],
  severity: 'significant',
  repeatMode: 'change',
  repeatMinutes: 60,
  resolved: true,
};
function cloneDefaultCorridors(){ return DEFAULT_TRANSPORT_CORRIDORS.map((x)=>({ ...x, matchTerms:[...x.matchTerms] })); }
function normalizeTransportConfig(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  let corridors = Array.isArray(input.corridors) && input.corridors.length ? input.corridors : cloneDefaultCorridors();
  corridors = corridors.slice(0, 40).map((x, i) => ({
    id: String(x?.id || ('route-' + i)).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40) || ('route-' + i),
    name: cleanText(x?.name || 'Sledovaný úsek', 80),
    type: x?.type === 'area' ? 'area' : 'route',
    active: x?.active !== false,
    notifyAllowed: x?.notifyAllowed !== false,
    description: cleanText(x?.description || '', 180),
    matchTerms: [...new Set((Array.isArray(x?.matchTerms) ? x.matchTerms : []).map((t)=>cleanText(t,60)).filter(Boolean))].slice(0,30),
  })).filter((x)=>x.name);
  return {
    enabled: input.enabled !== false,
    notificationsEnabled: input.notificationsEnabled !== false,
    cacheMinutes: Math.min(15, Math.max(1, Number(input.cacheMinutes) || DEFAULT_TRANSPORT_SETTINGS.cacheMinutes)),
    pollMinutes: Math.min(60, Math.max(3, Number(input.pollMinutes) || DEFAULT_TRANSPORT_SETTINGS.pollMinutes)),
    corridors,
  };
}
function normalizeTransportPrefs(raw, transport) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const allowed = new Set((transport?.corridors || []).map((x)=>x.id));
  let ids = Array.isArray(input.corridorIds) ? input.corridorIds.map(String).filter((id)=>allowed.has(id)) : [];
  if (!ids.length) ids = (transport?.corridors || []).filter((x)=>x.active).map((x)=>x.id);
  return {
    notificationsEnabled: !!input.notificationsEnabled,
    corridorIds: [...new Set(ids)].slice(0,40),
    severity: ['critical','significant','all'].includes(input.severity) ? input.severity : DEFAULT_TRANSPORT_PREFS.severity,
    repeatMode: ['once','change','interval'].includes(input.repeatMode) ? input.repeatMode : DEFAULT_TRANSPORT_PREFS.repeatMode,
    repeatMinutes: Math.min(240, Math.max(15, Number(input.repeatMinutes) || DEFAULT_TRANSPORT_PREFS.repeatMinutes)),
    resolved: input.resolved !== false,
  };
}
function publicTransportConfig(cfg, user) {
  const t = normalizeTransportConfig(cfg.transport);
  return {
    enabled: t.enabled,
    notificationsEnabled: t.notificationsEnabled,
    pollMinutes: t.pollMinutes,
    sourceConfigured: !!GOLEMIO_API_KEY,
    sourceName: 'NDIC přes Golemio',
    corridors: t.corridors.filter((x)=>x.active).map(({matchTerms,...x})=>x),
    prefs: normalizeTransportPrefs(user?.transportPrefs, t),
  };
}

const SYSTEM_MODES = ['normal', 'read_only', 'maintenance'];
const DEFAULT_SYSTEM_STATE = { mode: 'normal', message: '', updatedAt: null, updatedBy: null };
function systemState(cfg) {
  const s = { ...DEFAULT_SYSTEM_STATE, ...(cfg.system || {}) };
  if (!SYSTEM_MODES.includes(s.mode)) s.mode = 'normal';
  return s;
}
function defaultSystemMessage(mode) {
  if (mode === 'maintenance') return '🔧 Probíhá technická údržba\nAplikace je momentálně dočasně pozastavena administrátorem.\nZkuste to prosím později.';
  if (mode === 'read_only') return 'Probíhá systémová údržba.\nData lze prohlížet, ale zápisy jsou dočasně pozastavené.';
  return '';
}
const DEFAULT_NORMAL_RETURN_MESSAGE = 'Jsme zpátky. Aplikace zpět v normálním provozu. Děkuji za trpělivost.';
const MODULE_KEYS = ['service','pneu','transport','maintenance','settings'];
const MODULE_LABELS = {
  service:'SERVIS', pneu:'PNEU / DOT', transport:'DOPRAVA', maintenance:'ÚDRŽBA', settings:'NASTAVENÍ'
};
const DEFAULT_MODULES = {
  service:{ visible:true, online:true, offlineMessage:'Modul SERVIS je dočasně mimo provoz.' },
  pneu:{ visible:true, online:true, offlineMessage:'Modul PNEU / DOT je dočasně mimo provoz.' },
  transport:{ visible:true, online:true, offlineMessage:'Dopravní report je dočasně mimo provoz.' },
  maintenance:{ visible:true, online:true, offlineMessage:'Modul ÚDRŽBA je dočasně mimo provoz.' },
  settings:{ visible:true, online:true, offlineMessage:'Nastavení aplikace je dočasně mimo provoz.' },
};
function normalizeModules(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of MODULE_KEYS) {
    const src = input[key] && typeof input[key] === 'object' ? input[key] : {};
    out[key] = {
      visible: src.visible !== false,
      online: src.online !== false,
      offlineMessage: cleanText(src.offlineMessage || DEFAULT_MODULES[key].offlineMessage, 220),
    };
  }
  return out;
}
function moduleState(cfg,key){ return normalizeModules(cfg.modules)[key] || {visible:true,online:true,offlineMessage:'Modul je dočasně mimo provoz.'}; }
function publicModules(cfg,currentUser){
  const modules=normalizeModules(cfg.modules);
  return Object.fromEntries(MODULE_KEYS.map((key)=>[key,{
    visible: currentUser?.role==='admin' ? true : modules[key].visible,
    online: currentUser?.role==='admin' ? true : modules[key].online,
    offlineMessage: modules[key].offlineMessage,
  }]));
}
function actionModule(action){
  if (['addRecord','editRecord','deleteRecord','attentionSave'].includes(action)) return 'pneu';
  if (['trafficReport','saveTransportPrefs'].includes(action)) return 'transport';
  if (['pushSubscribe','pushUnsubscribe','myPushDevices'].includes(action)) return 'settings';
  return null;
}
const NON_ADMIN_ROLES = ['dispatch', 'driver', 'technician'];
const PERMISSION_KEYS = ['dotView','dotCreate','dotEdit','dotDelete','fleetView','fleetExport','historyView','historyExport','vehicleDetail','attentionView','attentionEdit','notificationsReceive'];
const BASE_PERMISSIONS = {
  dotView: true,
  dotCreate: true,
  dotEdit: false,
  dotDelete: false,
  fleetView: true,
  fleetExport: true,
  historyView: true,
  historyExport: true,
  vehicleDetail: false,
  attentionView: false,
  attentionEdit: false,
  notificationsReceive: true,
};
function normalizeRole(role) {
  if (role === 'admin') return 'admin';
  if (role === 'user') return 'driver';
  return NON_ADMIN_ROLES.includes(role) ? role : 'driver';
}
function effectivePermissions(user) {
  if (user?.role === 'admin') return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true]));
  const out = { ...BASE_PERMISSIONS };
  for (const k of PERMISSION_KEYS) if (typeof user?.permissions?.[k] === 'boolean') out[k] = user.permissions[k];
  return out;
}
function hasPermission(user, key) { return user?.role === 'admin' || !!effectivePermissions(user)[key]; }

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
  cfg.version = 7;
  cfg.users ||= [];
  cfg.cars ||= [];
  cfg.notificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...(cfg.notificationSettings || {}) };
  cfg.system = systemState(cfg);
  cfg.transport = normalizeTransportConfig(cfg.transport);
  cfg.modules = normalizeModules(cfg.modules);
  for (const u of cfg.users) {
    if (u.active === undefined) u.active = true;
    if (!u.createdAt) u.createdAt = null;
    if (!u.lastLoginAt) u.lastLoginAt = null;
    u.role = normalizeRole(u.role);
    u.transportPrefs = normalizeTransportPrefs(u.transportPrefs, cfg.transport);
    if (u.role !== 'admin') {
      u.permissions ||= {};
      for (const k of Object.keys(u.permissions)) if (!PERMISSION_KEYS.includes(k) || typeof u.permissions[k] !== 'boolean') delete u.permissions[k];
    } else {
      delete u.permissions;
    }
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
async function getPresence() { return await readJson('presence.json', {}); }
async function writePresence(rows) { await writeJson('presence.json', rows); }
function presenceFor(userId, presence, now = Date.now()) {
  const p = presence?.[userId] || {};
  const heartbeat = p.lastHeartbeatAt ? new Date(p.lastHeartbeatAt).getTime() : 0;
  const activity = p.lastActivityAt ? new Date(p.lastActivityAt).getTime() : 0;
  let status = 'offline';
  if (heartbeat && now - heartbeat <= 180000) {
    status = p.visible && p.active && activity && now - activity <= 120000 ? 'online' : 'standby';
  }
  return { status, lastOnlineAt: p.lastHeartbeatAt || null, lastActivityAt: p.lastActivityAt || null };
}
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
    if (!s) issues.push({ key: 'missing_summer:' + c.id, type: 'missing_summer', carId: c.id, plate: c.plate, vehicle: c.name, mileage: l?.mileage ?? '', text: 'Chybí letní DOT' });
    if (!w) issues.push({ key: 'missing_winter:' + c.id, type: 'missing_winter', carId: c.id, plate: c.plate, vehicle: c.name, mileage: l?.mileage ?? '', text: 'Chybí zimní DOT' });
    if (!l) issues.push({ key: 'no_record:' + c.id, type: 'no_record', carId: c.id, plate: c.plate, vehicle: c.name, mileage: '', text: 'Bez jediného záznamu' });
    if (l && cfg.notificationSettings.staleEnabled && now - l.ts > Number(cfg.notificationSettings.staleDays || 365) * 86400000) {
      issues.push({ key: 'stale:' + c.id, type: 'stale', carId: c.id, plate: c.plate, vehicle: c.name, recordId: l.id, season: l.season, dot: l.dot, mileage: l.mileage, text: `Poslední záznam starší než ${cfg.notificationSettings.staleDays} dní` });
    }
    for (let i = 1; i < cr.length; i++) {
      if (cr[i].mileage < cr[i - 1].mileage) {
        issues.push({ key: 'mileage_drop:' + cr[i].id, type: 'mileage_drop', carId: c.id, plate: c.plate, vehicle: c.name, recordId: cr[i].id, season: cr[i].season, dot: cr[i].dot, mileage: cr[i].mileage, text: `Pokles km: ${cr[i - 1].mileage} → ${cr[i].mileage}` });
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
function compactRecordsForPermissions(records, perms) {
  if (perms.historyView) return records;
  if (!(perms.fleetView || perms.dotView || perms.dotCreate || perms.dotEdit || perms.dotDelete)) return [];
  const seen = new Set(), out = [];
  for (const r of records) {
    for (const key of [r.carId + ':latest', r.carId + ':' + r.season]) {
      if (!seen.has(key)) { seen.add(key); out.push(r); }
    }
  }
  return [...new Map(out.map((r) => [r.path, r])).values()].sort((a,b)=>b.ts-a.ts);
}
function userStats(cfg, recs, pushes, presence) {
  return cfg.users.map((u) => {
    const own = recs.filter((r) => r.userId === u.id);
    const p = presenceFor(u.id, presence);
    return {
      id: u.id, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt || null,
      lastLoginAt: u.lastLoginAt || null, recordCount: own.length, lastRecordAt: own[0]?.createdAt || null,
      pushDevices: pushes.filter((x) => x.userId === u.id).length,
      permissions: effectivePermissions(u),
      presenceStatus: p.status, lastOnlineAt: p.lastOnlineAt, lastActivityAt: p.lastActivityAt,
    };
  });
}
async function publicState(cfg, recs, currentUser) {
  const perms = effectivePermissions(currentUser);
  const allRecords = enrichRecords(cfg, recs);
  const records = currentUser.role === 'admin' ? allRecords : compactRecordsForPermissions(allRecords, perms);
  const notifications = await getNotificationLog();
  const carById = Object.fromEntries(cfg.cars.map((c) => [c.id, c]));
  const pendingNotifications = notifications.filter((n) =>
    Array.isArray(n.recipientUserIds) && n.recipientUserIds.includes(currentUser.id) &&
    !(n.acks || []).some((a) => a.userId === currentUser.id)
  ).map((n) => ({
    id: n.id, type: n.type, title: n.title, body: n.body, createdAt: n.createdAt,
    carId: n.carId || null, carPlate: n.carId ? (carById[n.carId]?.plate || '') : '',
  }));
  const base = {
    me: { id: currentUser.id, name: currentUser.name, role: currentUser.role, active: currentUser.active },
    permissions: perms,
    cars: cfg.cars.filter((c) => c.active !== false),
    records,
    attentionIssues: perms.attentionView ? computeIssues(cfg, recs).slice(0, 100) : [],
    pendingNotifications,
    system: (() => {
      const s = systemState(cfg);
      return { mode: s.mode, message: s.message || defaultSystemMessage(s.mode), customMessage: currentUser.role === 'admin' ? (s.message || '') : undefined, updatedAt: s.updatedAt || null, updatedBy: currentUser.role === 'admin' ? (s.updatedBy || null) : null };
    })(),
    transport: publicTransportConfig(cfg, currentUser),
    modules: publicModules(cfg, currentUser),
    push: { publicKey: hasPermission(currentUser,'notificationsReceive') ? VAPID_PUBLIC_KEY : '' },
  };
  if (currentUser.role !== 'admin') return base;
  const [audit, pushes, presence] = await Promise.all([getAudit(), getPushStore(), getPresence()]);
  return {
    ...base,
    users: userStats(cfg, recs, pushes, presence),
    allCars: cfg.cars,
    dashboard: dashboard(cfg, recs),
    audit: audit.slice(0, 200),
    notificationLog: notifications.slice(0, 150).map((n) => ({ ...n, carPlate: n.carId ? (carById[n.carId]?.plate || '') : '' })),
    notificationSettings: cfg.notificationSettings,
    transportAdmin: { ...cfg.transport, sourceConfigured: !!GOLEMIO_API_KEY, sourceName: 'NDIC přes Golemio' },
    modulesAdmin: normalizeModules(cfg.modules),
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

function normalizedTrafficText(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function trafficTypeLabel(type) {
  const t=String(type||'').toLowerCase();
  if(t.includes('accident'))return 'Dopravní nehoda';
  if(t.includes('maintenance')||t.includes('construction')||t.includes('roadwork'))return 'Práce na komunikaci';
  if(t.includes('vehicle'))return 'Překážka / vozidlo';
  if(t.includes('obstruction'))return 'Překážka v provozu';
  if(t.includes('abnormaltraffic')||t.includes('congestion'))return 'Dopravní komplikace';
  if(t.includes('weather')||t.includes('environment'))return 'Podmínky ovlivňující provoz';
  return type ? String(type).replace(/([a-z])([A-Z])/g,'$1 $2') : 'Dopravní omezení';
}
function trafficSeverity(record) {
  const impact=record?.impact||{}, delay=Number(impact?.delays?.timeValue||0)/60;
  const capacity=impact?.capacityRemaining, lanes=Number(impact?.numberOfOperationalLanes);
  const type=String(record?.type||'').toLowerCase();
  if(capacity===0||lanes===0||delay>=20||type.includes('roadclosure'))return 'critical';
  if(type.includes('accident')||delay>=8||Number(impact?.numberOfLanesRestricted||0)>0)return 'critical';
  return 'significant';
}
function trafficSeverityRank(v){return v==='critical'?2:v==='significant'?1:0}
function extractGolemioTrafficEvents(data) {
  const pub=data?.situationPublicationLight||data?.situationPublication||{};
  const situations=Array.isArray(pub.situation)?pub.situation:(Array.isArray(pub.situations)?pub.situations:[]);
  const out=[];
  for(const s of situations){
    const records=Array.isArray(s?.situationRecord)?s.situationRecord:[];
    records.forEach((r,idx)=>{
      const comment=r?.generalPublicComment||{};
      const text=cleanText(comment.cs||comment.en||comment.de||trafficTypeLabel(r?.type),500);
      const delayMinutes=Math.max(0,Math.round(Number(r?.impact?.delays?.timeValue||0)/60));
      const lanesRestricted=Math.max(0,Number(r?.impact?.numberOfLanesRestricted||0));
      const severity=trafficSeverity(r);
      const id=cleanText(String(s?.id||'event')+':'+String(idx),180);
      const fingerprint=crypto.createHash('sha1').update(JSON.stringify([r?.type,text,delayMinutes,lanesRestricted,r?.endTime,r?.situationRecordVersionTime])).digest('hex').slice(0,16);
      out.push({
        id, fingerprint, type:String(r?.type||''), typeLabel:trafficTypeLabel(r?.type), text,
        severity, delayMinutes, lanesRestricted,
        startTime:r?.startTime||null, endTime:r?.endTime||null,
        updatedAt:r?.situationRecordVersionTime||r?.situationRecordCreationTime||null,
        sourceName:cleanText(r?.sourceName||'NDIC',60),
      });
    });
  }
  return out.slice(0,10000);
}
function eventMatchesCorridor(event,corridor) {
  const hay=normalizedTrafficText([event.text,event.typeLabel,event.type,event.sourceName].join(' '));
  return (corridor.matchTerms||[]).some((term)=>hay.includes(normalizedTrafficText(term)));
}
async function trafficFeed(cfg, force=false) {
  const t=normalizeTransportConfig(cfg.transport);
  const maxAge=t.cacheMinutes*60000;
  const cache=await readJson('traffic-cache.json',null);
  if(!force&&cache?.fetchedAt&&Date.now()-new Date(cache.fetchedAt).getTime()<maxAge)return cache;
  if(!GOLEMIO_API_KEY)return { sourceConfigured:false, source:'NDIC přes Golemio', fetchedAt:cache?.fetchedAt||null, stale:false, error:'GOLEMIO_NOT_CONFIGURED', events:[] };
  try{
    const u=new URL('https://api.golemio.cz/v2/traffic/restrictions');
    u.searchParams.set('moment',new Date().toISOString());
    u.searchParams.set('limit','10000');
    const r=await fetch(u,{headers:{accept:'application/json','X-Access-Token':GOLEMIO_API_KEY},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new Error('GOLEMIO_'+r.status);
    const raw=await r.json();
    const result={ sourceConfigured:true, source:'NDIC přes Golemio', fetchedAt:new Date().toISOString(), stale:false, error:null, events:extractGolemioTrafficEvents(raw) };
    await writeJson('traffic-cache.json',result);
    return result;
  }catch(err){
    console.error('traffic feed',err?.message);
    if(cache?.events)return {...cache,sourceConfigured:true,stale:true,error:'SOURCE_TEMPORARILY_UNAVAILABLE'};
    return { sourceConfigured:true, source:'NDIC přes Golemio', fetchedAt:null, stale:false, error:'SOURCE_TEMPORARILY_UNAVAILABLE', events:[] };
  }
}
async function buildTrafficReport(cfg, force=false) {
  const t=normalizeTransportConfig(cfg.transport);
  const feed=await trafficFeed(cfg,force);
  const corridors=t.corridors.filter((x)=>x.active).map((corridor)=>{
    const events=feed.events.filter((event)=>eventMatchesCorridor(event,corridor)).map((event)=>({...event,corridorIds:[corridor.id]}));
    const critical=events.filter((x)=>x.severity==='critical').length;
    return {
      id:corridor.id,name:corridor.name,type:corridor.type,description:corridor.description,notifyAllowed:corridor.notifyAllowed,
      status:!feed.sourceConfigured?'unknown':critical?'critical':events.length?'warning':'clear',
      eventCount:events.length,criticalCount:critical,
      summary:!feed.sourceConfigured?'Datový zdroj čeká na připojení.':events[0]?.text||'Bez hlášených omezení.',
      events,
    };
  });
  const byId=new Map();
  for(const corridor of corridors)for(const ev of corridor.events){
    const old=byId.get(ev.id);
    if(old)old.corridorIds=[...new Set([...old.corridorIds,...ev.corridorIds])];
    else byId.set(ev.id,{...ev});
  }
  const events=[...byId.values()].sort((a,b)=>trafficSeverityRank(b.severity)-trafficSeverityRank(a.severity)||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  return {
    sourceConfigured:feed.sourceConfigured, source:feed.source, fetchedAt:feed.fetchedAt, stale:!!feed.stale, error:feed.error||null,
    corridors, events,
    summary:{
      clear:corridors.filter((x)=>x.status==='clear').length,
      warning:corridors.filter((x)=>x.status==='warning').length,
      critical:corridors.filter((x)=>x.status==='critical').length,
      unknown:corridors.filter((x)=>x.status==='unknown').length,
    },
  };
}
function selectedTrafficEvents(report,prefs,cfg) {
  const selected=new Set(prefs.corridorIds||[]);
  const allowed=new Set(normalizeTransportConfig(cfg.transport).corridors.filter((x)=>x.active&&x.notifyAllowed).map((x)=>x.id));
  const min=prefs.severity==='critical'?2:prefs.severity==='significant'?1:0;
  return report.events.filter((event)=>trafficSeverityRank(event.severity)>=min&&event.corridorIds.some((id)=>selected.has(id)&&allowed.has(id)));
}
async function maybeNotifyTrafficUser(cfg,user,report) {
  const t=normalizeTransportConfig(cfg.transport),prefs=normalizeTransportPrefs(user.transportPrefs,t);
  if(!t.notificationsEnabled||!prefs.notificationsEnabled||!hasPermission(user,'notificationsReceive')||!report.sourceConfigured||report.error)return {sent:0};
  const state=await readJson('traffic-notification-state.json',{users:{}});
  state.users ||= {};
  const us=state.users[user.id]||{events:{}};
  us.events ||= {};
  const active=selectedTrafficEvents(report,prefs,cfg),reportEventIds=new Set((report.events||[]).map((x)=>x.id));
  let sent=0;
  const now=Date.now(),repeatMs=prefs.repeatMinutes*60000;
  const corridorNames=Object.fromEntries(report.corridors.map((x)=>[x.id,x.name]));
  for(const event of active){
    const prev=us.events[event.id]||{};
    const changed=!!prev.fingerprint&&prev.fingerprint!==event.fingerprint;
    const due=prefs.repeatMode==='interval'&&prev.lastSentAt&&now-prev.lastSentAt>=repeatMs;
    const should=!prev.lastSentAt||(prefs.repeatMode==='change'&&changed)||(prefs.repeatMode==='interval'&&(changed||due));
    const firstCorridor=event.corridorIds.find((id)=>prefs.corridorIds.includes(id))||event.corridorIds[0];
    const corridorName=corridorNames[firstCorridor]||'Dopravní report';
    if(should){
      const extra=[event.delayMinutes?('zdržení cca '+event.delayMinutes+' min'):'',event.lanesRestricted?('omezené pruhy: '+event.lanesRestricted):''].filter(Boolean).join(' · ');
      const body=cleanText(event.text+(extra?' · '+extra:''),240);
      const n=await createNotification({type:'traffic_alert',title:'🚦 Doprava – '+corridorName,body,recipient:'user',recipientUserIds:[user.id],byUserId:'system',byUserName:'Dopravní report',transportCorridorIds:event.corridorIds});
      const result=await sendPushToUsers(cfg,[user.id],{title:n.title,body:n.body,tag:'traffic-'+event.id,url:'/?module=transport&notification='+encodeURIComponent(n.id)});
      await patchNotification(n.id,result);
      prev.lastSentAt=now;prev.resolvedSent=false;prev.corridorName=corridorName;prev.lastText=event.text;sent+=result.sent||0;
    }
    prev.fingerprint=event.fingerprint;prev.lastSeenAt=now;us.events[event.id]=prev;
  }
  if(prefs.resolved&&!report.stale){
    for(const [id,prev] of Object.entries(us.events)){
      if(reportEventIds.has(id)||!prev.lastSentAt||prev.resolvedSent)continue;
      if(now-Number(prev.lastSeenAt||0)>12*60*60*1000)continue;
      const title='✅ Doprava – omezení ukončeno';
      const body=cleanText((prev.corridorName||'Sledovaný úsek')+': předchozí omezení už není v aktuálním dopravním reportu.',240);
      const n=await createNotification({type:'traffic_resolved',title,body,recipient:'user',recipientUserIds:[user.id],byUserId:'system',byUserName:'Dopravní report'});
      const result=await sendPushToUsers(cfg,[user.id],{title,body,tag:'traffic-resolved-'+id,url:'/?module=transport&notification='+encodeURIComponent(n.id)});
      await patchNotification(n.id,result);prev.resolvedSent=true;sent+=result.sent||0;
    }
  }
  for(const [id,prev] of Object.entries(us.events))if(now-Number(prev.lastSeenAt||0)>7*86400000)delete us.events[id];
  state.users[user.id]=us;await writeJson('traffic-notification-state.json',state);
  return {sent};
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
      const sys = systemState(cfg);
      if (u.role !== 'admin' && sys.mode === 'maintenance') {
        return json(res, 423, { error: 'MAINTENANCE', message: sys.message || defaultSystemMessage('maintenance') });
      }
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

    const sys = systemState(cfg);
    if (currentUser.role !== 'admin' && sys.mode === 'maintenance') {
      return json(res, 423, { error: 'MAINTENANCE', message: sys.message || defaultSystemMessage('maintenance') });
    }
    const readOnlyAllowed = new Set(['state', 'heartbeat', 'myPushDevices', 'vehicleDetail', 'notificationRespond', 'trafficReport']);
    if (currentUser.role !== 'admin' && sys.mode === 'read_only' && !readOnlyAllowed.has(body.action)) {
      return json(res, 423, { error: 'READ_ONLY', message: sys.message || defaultSystemMessage('read_only') });
    }

    const requestedModule = actionModule(body.action);
    if (currentUser.role !== 'admin' && requestedModule) {
      const ms = moduleState(cfg, requestedModule);
      if (!ms.online) return json(res, 423, { error:'MODULE_OFFLINE', module:requestedModule, moduleLabel:MODULE_LABELS[requestedModule], message:ms.offlineMessage });
    }

    if (body.action === 'state') return json(res, 200, await publicState(cfg, await getRecords(), currentUser));

    if (body.action === 'heartbeat') {
      const presence = await getPresence();
      const now = new Date().toISOString();
      const previous = presence[currentUser.id] || {};
      presence[currentUser.id] = {
        lastHeartbeatAt: now,
        lastActivityAt: body.active ? now : (previous.lastActivityAt || currentUser.lastLoginAt || now),
        visible: !!body.visible,
        active: !!body.active,
      };
      await writePresence(presence);
      return json(res, 200, { ok: true });
    }

    if (body.action === 'addRecord') {
      if (!hasPermission(currentUser, 'dotCreate')) return json(res, 403, { error: 'PERMISSION' });
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
      if (!hasPermission(currentUser, 'notificationsReceive')) return json(res, 403, { error: 'PERMISSION' });
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

    if (body.action === 'myPushDevices') {
      const rows = await getPushStore();
      const devices = rows.filter((p) => p.userId === currentUser.id).map((p) => ({
        id: p.id,
        createdAt: p.createdAt || null,
        userAgent: cleanText(p.userAgent, 240),
      })).sort((x, y) => String(y.createdAt || '').localeCompare(String(x.createdAt || '')));
      return json(res, 200, { devices });
    }


    if (body.action === 'trafficReport') {
      if (cfg.transport?.enabled === false && currentUser.role !== 'admin') return json(res, 403, { error: 'TRAFFIC_DISABLED' });
      const report = await buildTrafficReport(cfg, false);
      const allowAlerts = currentUser.role === 'admin' || sys.mode !== 'read_only';
      const alertResult = allowAlerts ? await maybeNotifyTrafficUser(cfg, currentUser, report) : { sent: 0, skipped: 'read_only' };
      return json(res, 200, { ...report, alertResult });
    }

    if (body.action === 'saveTransportPrefs') {
      currentUser.transportPrefs = normalizeTransportPrefs(body.prefs, cfg.transport);
      await writeConfig(cfg);
      await appendAudit(currentUser, 'transport_prefs', 'Upraveno osobní nastavení Dopravního reportu', currentUser.transportPrefs);
      return json(res, 200, { ok:true, prefs:currentUser.transportPrefs });
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

    if (body.action === 'editRecord') {
      if (!hasPermission(currentUser, 'dotEdit')) return json(res, 403, { error: 'PERMISSION' });
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
      await put(newPath, '1', { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain' });
      if (newPath !== r.path) await del(r.path);
      await appendAudit(currentUser, 'record_edit', `Upraven záznam ${car.plate}: DOT ${before.dot} → ${dot}, km ${before.mileage} → ${mileage}`, { before, after: { ...after, path: newPath } });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'deleteRecord') {
      if (!hasPermission(currentUser, 'dotDelete')) return json(res, 403, { error: 'PERMISSION' });
      const path = String(body.path || '');
      if (!path.startsWith('records/')) return json(res, 400, { error: 'PATH' });
      const recs = await getRecords();
      const r = recs.find((x) => x.path === path);
      if (!r) return json(res, 404, { error: 'RECORD' });
      await del(path);
      const car = cfg.cars.find((c) => c.id === r.carId);
      await appendAudit(currentUser, 'record_delete', `Smazán záznam ${car?.plate || ''} DOT ${r.dot} · ${r.mileage} km`, r);
      return json(res, 200, { ok: true });
    }

    if (body.action === 'vehicleDetail') {
      if (!hasPermission(currentUser, 'vehicleDetail')) return json(res, 403, { error: 'PERMISSION' });
      const vehicle = await buildVehicleDetail(cfg, await getRecords(), String(body.carId || ''));
      if (!vehicle) return json(res, 404, { error: 'CAR' });
      vehicle.timeline = [];
      return json(res, 200, { ok: true, vehicle });
    }

    if (body.action === 'attentionSave') {
      if (!hasPermission(currentUser, 'attentionView') || !hasPermission(currentUser, 'attentionEdit')) return json(res, 403, { error: 'PERMISSION' });
      const recs = await getRecords();
      const issueKey = String(body.issueKey || '');
      const issue = computeIssues(cfg, recs).find((x) => x.key === issueKey && x.carId === String(body.carId || ''));
      if (!issue) return json(res, 409, { error: 'ISSUE_RESOLVED' });
      const car = cfg.cars.find((x) => x.id === issue.carId && x.active !== false);
      if (!car) return json(res, 404, { error: 'CAR' });
      const season = String(body.season || issue.season || '');
      const dot = String(body.dot || '');
      const mileage = Number(body.mileage);
      const error = validateRecordFields(car, season, dot, mileage);
      if (error) return json(res, 400, { error });

      if (issue.type === 'mileage_drop') {
        const r = recs.find((x) => x.id === issue.recordId && x.carId === issue.carId);
        if (!r) return json(res, 409, { error: 'ISSUE_RESOLVED' });
        const before = { ...r };
        const after = { ...r, season, dot, mileage };
        const newPath = recordPath(after);
        await put(newPath, '1', { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain' });
        if (newPath !== r.path) await del(r.path);
        await appendAudit(currentUser, 'attention_issue_edit', `Opraveno upozornění ${car.plate}: ${issue.text}`, { issueKey, before, after: { ...after, path: newPath } });
      } else {
        const r = { ts: Date.now(), id: uid(), carId: car.id, season, dot, mileage, userId: currentUser.id };
        await put(recordPath(r), '1', { access: 'private', addRandomSuffix: false, contentType: 'text/plain' });
        await appendAudit(currentUser, 'attention_issue_edit', `Doplněno z upozornění ${car.plate}: ${issue.text}`, { issueKey, record: r });
      }
      return json(res, 200, { ok: true });
    }

    if (currentUser.role !== 'admin') return json(res, 403, { error: 'ADMIN' });


    if (body.action === 'adminSaveModules') {
      const incoming = body.modules && typeof body.modules === 'object' ? body.modules : {};
      const before = normalizeModules(cfg.modules);
      const next = normalizeModules(cfg.modules);
      for (const key of MODULE_KEYS) {
        if (!incoming[key] || typeof incoming[key] !== 'object') continue;
        if (typeof incoming[key].visible === 'boolean') next[key].visible = incoming[key].visible;
        if (typeof incoming[key].online === 'boolean') next[key].online = incoming[key].online;
        if (incoming[key].offlineMessage !== undefined) next[key].offlineMessage = cleanText(incoming[key].offlineMessage,220) || DEFAULT_MODULES[key].offlineMessage;
      }
      cfg.modules = next;
      await writeConfig(cfg);
      await appendAudit(currentUser,'module_settings','Upraveno zobrazení a dostupnost modulů',{before,after:next});
      return json(res,200,{ok:true,modulesAdmin:next});
    }

    if (body.action === 'adminSaveTransportSettings') {
      const s=body.settings||{};
      cfg.transport = normalizeTransportConfig({
        ...cfg.transport,
        enabled: s.enabled !== false,
        notificationsEnabled: s.notificationsEnabled !== false,
        cacheMinutes: s.cacheMinutes,
        pollMinutes: s.pollMinutes,
      });
      await writeConfig(cfg);
      await appendAudit(currentUser,'transport_settings','Upraveno nastavení Dopravního reportu',{enabled:cfg.transport.enabled,notificationsEnabled:cfg.transport.notificationsEnabled,cacheMinutes:cfg.transport.cacheMinutes,pollMinutes:cfg.transport.pollMinutes});
      return json(res,200,{ok:true,transportAdmin:{...cfg.transport,sourceConfigured:!!GOLEMIO_API_KEY,sourceName:'NDIC přes Golemio'}});
    }

    if (body.action === 'adminAddTransportCorridor') {
      const name=cleanText(body.name,80);
      if(!name)return json(res,400,{error:'NAME'});
      const terms=[...new Set(String(body.matchTerms||'').split(',').map((x)=>cleanText(x,60)).filter(Boolean))].slice(0,30);
      if(!terms.length)return json(res,400,{error:'TRAFFIC_TERMS'});
      cfg.transport=normalizeTransportConfig(cfg.transport);
      const corridor={id:uid('tr'),name,type:body.type==='area'?'area':'route',active:true,notifyAllowed:true,description:cleanText(body.description,180),matchTerms:terms};
      cfg.transport.corridors.push(corridor);await writeConfig(cfg);
      await appendAudit(currentUser,'transport_corridor_add','Přidán sledovaný dopravní úsek '+name,corridor);
      return json(res,200,{ok:true,corridor});
    }

    if (body.action === 'adminUpdateTransportCorridor') {
      cfg.transport=normalizeTransportConfig(cfg.transport);
      const x=cfg.transport.corridors.find((row)=>row.id===String(body.id||''));
      if(!x)return json(res,404,{error:'TRAFFIC_CORRIDOR'});
      const before={...x,matchTerms:[...x.matchTerms]};
      if(body.name!==undefined)x.name=cleanText(body.name,80)||x.name;
      if(body.description!==undefined)x.description=cleanText(body.description,180);
      if(body.type!==undefined)x.type=body.type==='area'?'area':'route';
      if(typeof body.active==='boolean')x.active=body.active;
      if(typeof body.notifyAllowed==='boolean')x.notifyAllowed=body.notifyAllowed;
      if(body.matchTerms!==undefined){
        const terms=[...new Set((Array.isArray(body.matchTerms)?body.matchTerms:String(body.matchTerms||'').split(',')).map((v)=>cleanText(v,60)).filter(Boolean))].slice(0,30);
        if(terms.length)x.matchTerms=terms;
      }
      await writeConfig(cfg);
      await appendAudit(currentUser,'transport_corridor_edit','Upraven sledovaný dopravní úsek '+x.name,{before,after:x});
      return json(res,200,{ok:true,corridor:x});
    }

    if (body.action === 'adminDeleteTransportCorridor') {
      cfg.transport=normalizeTransportConfig(cfg.transport);
      const id=String(body.id||''),x=cfg.transport.corridors.find((row)=>row.id===id);
      if(!x)return json(res,404,{error:'TRAFFIC_CORRIDOR'});
      cfg.transport.corridors=cfg.transport.corridors.filter((row)=>row.id!==id);
      await writeConfig(cfg);
      await appendAudit(currentUser,'transport_corridor_delete','Odstraněn sledovaný dopravní úsek '+x.name,x);
      return json(res,200,{ok:true});
    }

    if (body.action === 'adminSetSystemMode') {
      const mode = String(body.mode || '');
      if (!SYSTEM_MODES.includes(mode)) return json(res, 400, { error: 'SYSTEM_MODE' });
      const before = systemState(cfg);
      const message = cleanText(body.message, 300);
      const returningToNormal = mode === 'normal' && before.mode !== 'normal';
      const notifyOnNormal = returningToNormal && !!body.notifyOnNormal;
      const normalNotifyMessage = cleanText(body.normalNotifyMessage, 240) || DEFAULT_NORMAL_RETURN_MESSAGE;
      cfg.system = {
        mode,
        message,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.name,
      };
      await writeConfig(cfg);

      let notification = null;
      if (notifyOnNormal) {
        const users = cfg.users.filter((u) => u.active && u.role !== 'admin' && hasPermission(u, 'notificationsReceive'));
        if (users.length) {
          const n = await createNotification({
            type: 'system_normal',
            title: 'Jsme zpátky',
            body: normalNotifyMessage,
            recipient: 'workers',
            recipientUserIds: users.map((u) => u.id),
            byUserId: currentUser.id,
            byUserName: currentUser.name,
          });
          const result = await sendPushToUsers(cfg, users.map((u) => u.id), {
            title: n.title,
            body: n.body,
            tag: 'notification-' + n.id,
            url: '/?notification=' + encodeURIComponent(n.id),
          });
          await patchNotification(n.id, result);
          notification = { notificationId: n.id, ...result };
          await appendAudit(currentUser, 'system_normal_notification', 'Odesláno oznámení o návratu do NORMAL (' + result.sent + '/' + (result.devices || 0) + ')', { notificationId: n.id, message: normalNotifyMessage, ...result });
        } else {
          notification = { sent: 0, failed: 0, devices: 0 };
        }
      }

      await appendAudit(currentUser, 'system_mode', `Provozní režim: ${before.mode} → ${mode}`, { before, after: cfg.system, normalNotification: notification });
      return json(res, 200, { ok: true, system: { ...cfg.system, message: cfg.system.message || defaultSystemMessage(mode) }, notification });
    }

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
      await put(newPath, '1', { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain' });
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
      const role = NON_ADMIN_ROLES.includes(body.role) ? body.role : 'driver';
      const u = { id: uid('u'), name, role, permissions: {}, pinHash: h, active: true, createdAt: new Date().toISOString(), lastLoginAt: null };
      cfg.users.push(u); await writeConfig(cfg);
      await appendAudit(currentUser, 'user_add', `Přidán uživatel ${name}`, { userId: u.id });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminUpdateUser') {
      const target = cfg.users.find((x) => x.id === body.userId);
      if (!target) return json(res, 404, { error: 'USER' });
      const before = { name: target.name, active: target.active, role: target.role, permissions: effectivePermissions(target) };
      const name = cleanText(body.name, 40);
      if (name) target.name = name;
      if (body.pin !== undefined && body.pin !== '') {
        const p = String(body.pin);
        if (!/^\d{2}$/.test(p)) return json(res, 400, { error: 'PIN' });
        const h = pinHash(p);
        if (cfg.users.some((x) => x.id !== target.id && x.active && safeEqualHex(x.pinHash, h))) return json(res, 409, { error: 'PIN_USED' });
        target.pinHash = h;
      }
      if (target.role !== 'admin') {
        if (NON_ADMIN_ROLES.includes(body.role)) target.role = body.role;
        if (body.permissions && typeof body.permissions === 'object') {
          target.permissions = {};
          for (const k of PERMISSION_KEYS) if (typeof body.permissions[k] === 'boolean') target.permissions[k] = body.permissions[k];
        }
        if (typeof body.active === 'boolean') target.active = body.active;
      }
      await writeConfig(cfg);
      await appendAudit(currentUser, 'user_edit', `Upraven uživatel ${target.name}`, { userId: target.id, before, after: { name: target.name, active: target.active, role: target.role, permissions: effectivePermissions(target) }, pinChanged: body.pin !== undefined && body.pin !== '' });
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
      let users = cfg.users.filter((u) => u.active && hasPermission(u, 'notificationsReceive'));
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
      return json(res, 200, { version: 6, exportedAt: new Date().toISOString(), users: safeUsers, cars: cfg.cars, records: enrichRecords(cfg, recs), audit, notifications, notificationSettings: cfg.notificationSettings, system: systemState(cfg), transport: cfg.transport, modules: normalizeModules(cfg.modules) });
    }

    return json(res, 400, { error: 'ACTION' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'SERVER' });
  }
}
