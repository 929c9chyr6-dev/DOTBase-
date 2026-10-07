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
const DEFAULT_USER_NOTIFICATION_PREFS = { operational: true, adminInfo: true };
function normalizeUserNotificationPrefs(raw) {
  const input=raw&&typeof raw==='object'?raw:{};
  return { operational: input.operational !== false, adminInfo: input.adminInfo !== false };
}
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
  userSettingsVisible: true,
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
    userSettingsVisible: input.userSettingsVisible !== false,
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
    userSettingsVisible: t.userSettingsVisible,
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
const MODULE_KEYS = ['vehicleOverview','service','pneu','tiretask','transport','maintenance','notifications','settings'];
const MODULE_LABELS = {
  vehicleOverview:'PŘEHLED VOZIDEL', service:'SERVIS', pneu:'PNEU / DOT', tiretask:'TIRETASK', transport:'DOPRAVA', maintenance:'ÚDRŽBA', notifications:'OZNÁMENÍ', settings:'NASTAVENÍ'
};
const DEFAULT_MODULES = {
  vehicleOverview:{ visible:true, online:true, offlineMessage:'Přehled vozidel je dočasně mimo provoz.' },
  service:{ visible:true, online:true, offlineMessage:'Modul SERVIS je dočasně mimo provoz.' },
  pneu:{ visible:true, online:true, offlineMessage:'Modul PNEU / DOT je dočasně mimo provoz.' },
  tiretask:{ visible:true, online:true, offlineMessage:'Modul TIRETASK je dočasně mimo provoz.' },
  transport:{ visible:true, online:true, offlineMessage:'Dopravní report je dočasně mimo provoz.' },
  maintenance:{ visible:true, online:true, offlineMessage:'Modul ÚDRŽBA je dočasně mimo provoz.' },
  notifications:{ visible:true, online:true, offlineMessage:'Modul OZNÁMENÍ je dočasně mimo provoz.' },
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
      allowedUserIds: [...new Set((Array.isArray(src.allowedUserIds)?src.allowedUserIds:[]).map(String).filter(Boolean))].slice(0,200),
      offlineMessage: cleanText(src.offlineMessage || DEFAULT_MODULES[key].offlineMessage, 220),
    };
  }
  return out;
}
function moduleState(cfg,key){ return normalizeModules(cfg.modules)[key] || {visible:true,online:true,allowedUserIds:[],offlineMessage:'Modul je dočasně mimo provoz.'}; }
function userCanSeeModule(cfg,key,user){
  const m=moduleState(cfg,key);
  if(user?.role==='admin')return true;
  if(user?.role==='test')return m.allowedUserIds.includes(user?.id);
  return m.visible||m.allowedUserIds.includes(user?.id);
}
function userCanAccessModule(cfg,key,user){
  const m=moduleState(cfg,key);
  if(!m.online)return false;
  return userCanSeeModule(cfg,key,user);
}
function publicModules(cfg,currentUser){
  const modules=normalizeModules(cfg.modules);
  return Object.fromEntries(MODULE_KEYS.map((key)=>[key,{
    visible: userCanSeeModule(cfg,key,currentUser),
    online: modules[key].online,
    offlineMessage: modules[key].offlineMessage,
  }]));
}
function actionModule(action){
  if (['addRecord','editRecord','deleteRecord','attentionSave'].includes(action)) return 'pneu';
  if (['tireTaskCreate','tireTaskCreateBatch','tireTaskUpdate','tireTaskComment','tireTaskSetStatus','tireTaskClose','tireTaskDelete'].includes(action)) return 'tiretask';
  if (['vehicleAdd','vehicleCategoryAdd'].includes(action)) return 'vehicleOverview';
  if (['trafficReport','saveTransportPrefs'].includes(action)) return 'transport';
  if (['sendOperationalNotification'].includes(action)) return 'notifications';
  if (['pushSubscribe','pushUnsubscribe','myPushDevices','saveNotificationPrefs'].includes(action)) return 'settings';
  return null;
}
const NON_ADMIN_ROLES = ['dispatch', 'driver', 'technician', 'test'];
const PERMISSION_KEYS = ['dotView','dotCreate','dotEdit','dotDelete','fleetView','fleetExport','historyView','historyExport','vehicleDetail','vehicleAdd','vehicleCategoryAdd','attentionView','attentionEdit','tireTaskCreate','tireTaskEdit','notificationsReceive','notificationsSendOperational'];
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
  vehicleAdd: false,
  vehicleCategoryAdd: false,
  attentionView: false,
  attentionEdit: false,
  tireTaskCreate: false,
  tireTaskEdit: false,
  notificationsReceive: true,
  notificationsSendOperational: false,
};
function normalizeRole(role) {
  if (role === 'admin') return 'admin';
  if (role === 'user') return 'driver';
  return NON_ADMIN_ROLES.includes(role) ? role : 'driver';
}
function effectivePermissions(user) {
  if (user?.role === 'admin') return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true]));
  const out = user?.role === 'test'
    ? Object.fromEntries(PERMISSION_KEYS.map((k)=>[k,false]))
    : { ...BASE_PERMISSIONS };
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
function migrateLegacyTwoDigitPinHash(hash) {
  if(!hash)return hash;
  for(let n=0;n<=99;n++){
    const oldPin=String(n).padStart(2,'0');
    if(safeEqualHex(hash,pinHash(oldPin)))return pinHash(oldPin.padStart(4,'0'));
  }
  return hash;
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
function cleanVin(v) {
  return String(v || '').toUpperCase().replace(/\s+/g, '').trim().slice(0, 32);
}
function cleanText(v, max = 100) {
  return String(v || '').trim().slice(0, max);
}
const DEFAULT_VEHICLE_CATEGORIES = ['VIP','MANAŽER','POOL','TECHNICI','ÚDRŽBA','FOLLOW','AUTOPROVOZ','BMS'];
function cleanVehicleCategory(v) {
  return cleanText(v, 40).replace(/\s+/g,' ').toUpperCase();
}
function normalizeVehicleCategories(raw, cars = []) {
  const out = [], seen = new Set();
  const add = (value) => {
    const name = cleanVehicleCategory(value);
    if (!name || seen.has(name)) return;
    seen.add(name); out.push(name);
  };
  DEFAULT_VEHICLE_CATEGORIES.forEach(add);
  (Array.isArray(raw) ? raw : []).forEach(add);
  (Array.isArray(cars) ? cars : []).forEach((c)=>add(c?.category));
  return out;
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
  const previousVersion = Number(cfg.version) || 0;
  cfg.version = 17;
  cfg.users ||= [];
  cfg.cars ||= [];
  cfg.vehicleCategories = normalizeVehicleCategories(cfg.vehicleCategories, cfg.cars);
  cfg.notificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...(cfg.notificationSettings || {}) };
  cfg.system = systemState(cfg);
  cfg.transport = normalizeTransportConfig(cfg.transport);
  cfg.modules = normalizeModules(cfg.modules);
  for (const u of cfg.users) {
    if (u.active === undefined) u.active = true;
    if (!u.createdAt) u.createdAt = null;
    if (!u.lastLoginAt) u.lastLoginAt = null;
    if(previousVersion<15)u.pinHash=migrateLegacyTwoDigitPinHash(u.pinHash);
    u.role = normalizeRole(u.role);
    u.transportPrefs = normalizeTransportPrefs(u.transportPrefs, cfg.transport);
    u.notificationPrefs = normalizeUserNotificationPrefs(u.notificationPrefs);
    u.pinChangeRequired = normalizePinChangeRequired(u.pinChangeRequired);
    u.failedPinAttempts = Math.max(0, Math.min(3, Number(u.failedPinAttempts) || 0));
    u.lastFailedPinAt = u.lastFailedPinAt || null;
    u.loginLockedAt = u.loginLockedAt || null;
    if (u.role !== 'admin') {
      u.permissions ||= {};
      if (previousVersion < 11 && u.role === 'dispatch') {
        if (typeof u.permissions.tireTaskCreate !== 'boolean') u.permissions.tireTaskCreate = true;
        if (typeof u.permissions.tireTaskEdit !== 'boolean') u.permissions.tireTaskEdit = true;
      }
      for (const k of Object.keys(u.permissions)) if (!PERMISSION_KEYS.includes(k) || typeof u.permissions[k] !== 'boolean') delete u.permissions[k];
    } else {
      delete u.permissions;
    }
  }
  for (const c of cfg.cars) {
    if (c.active === undefined) c.active = true;
    if (!c.createdAt) c.createdAt = null;
    if (!c.updatedAt) c.updatedAt = null;
    c.vin = cleanVin(c.vin || '');
    c.category = cleanVehicleCategory(c.category || '');
    if (c.category && !cfg.vehicleCategories.includes(c.category)) cfg.vehicleCategories.push(c.category);
    if (!c.lastModifiedAt) c.lastModifiedAt = c.updatedAt || c.createdAt || null;
    if (!c.lastModifiedBy) c.lastModifiedBy = '';
    if (!c.lastModifiedById) c.lastModifiedById = null;
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
    const [ts, id, carId, season, dot, mileage, userId, dotFrontRaw, dotRearRaw] = p;
    const n = Number(ts);
    if (!Number.isFinite(n)) return null;
    const dotFront=/^\d{4}$/.test(dotFrontRaw||'')?dotFrontRaw:'',dotRear=/^\d{4}$/.test(dotRearRaw||'')?dotRearRaw:'';
    const splitDot=!!(dotFront&&dotRear);
    return { path: b.pathname, ts: n, id, carId, season, dot, dotFront:splitDot?dotFront:'', dotRear:splitDot?dotRear:'', splitDot, mileage: Number(mileage), userId, createdAt: new Date(n).toISOString() };
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
function normalizeNotificationRecord(n) {
  const type=String(n?.type||'');
  const legacyPassive=!n?.channel&&typeof n?.requiresAck!=='boolean'&&type!=='manual';
  const channel=['operational','admin','automatic'].includes(n?.channel)?n.channel:(type==='manual'?'admin':'automatic');
  const severity=['info','important','critical'].includes(n?.severity)?n.severity:(type==='manual'?'important':'info');
  const requiresAck=typeof n?.requiresAck==='boolean'?n.requiresAck:type==='manual';
  const expiresAt=n?.expiresAt&&Number.isFinite(Date.parse(n.expiresAt))?new Date(n.expiresAt).toISOString():null;
  return {...n,channel,severity,requiresAck,expiresAt,legacyPassive,acks:Array.isArray(n?.acks)?n.acks:[],seen:Array.isArray(n?.seen)?n.seen:[]};
}
function notificationExpired(n,now=Date.now()){return !!(n?.expiresAt&&Date.parse(n.expiresAt)<=now)}
function normalizeNotificationExpiry(v){
  if(!v)return null;
  const ts=Date.parse(String(v));
  return Number.isFinite(ts)&&ts>Date.now()?new Date(ts).toISOString():null;
}
function userAllowsNotification(user,channel,severity){
  const prefs=normalizeUserNotificationPrefs(user?.notificationPrefs);
  if(channel==='admin'&&(severity==='important'||severity==='critical'))return true;
  if(channel==='operational')return prefs.operational;
  if(channel==='admin')return prefs.adminInfo;
  return true;
}
async function createNotification(row) {
  const rows = await getNotificationLog();
  const normalized=normalizeNotificationRecord(row);
  const n = {
    ...normalized,
    id: uid('n'), ts: Date.now(), createdAt: new Date().toISOString(),
    recipientUserIds: [...new Set((row.recipientUserIds || []).filter(Boolean))],
    acks: [], seen: [],
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
const TIRETASK_STATUSES = ['planned','in_progress','completed','problem','closed'];
function pragueDate(value = Date.now()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}
function normalizeTaskDate(v) {
  const s=String(v||'').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
}
function normalizeTaskTime(v) {
  const s=String(v||'').trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)?s:'';
}
function normalizeTireTaskCategory(cfg,v){
  const legacy=String(v||'').trim().toLowerCase();
  const mapped=legacy==='manager'?'MANAŽER':legacy==='vip'?'VIP':legacy==='pool'?'POOL':cleanVehicleCategory(v);
  return (cfg.vehicleCategories||[]).includes(mapped)?mapped:'';
}
function tireTaskCapabilities(user) {
  const admin=user?.role==='admin', dispatch=user?.role==='dispatch', technician=user?.role==='technician';
  const create=hasPermission(user,'tireTaskCreate'),edit=hasPermission(user,'tireTaskEdit');
  return {
    view:true,
    create,
    edit,
    assign:create||edit,
    progress:admin||dispatch||technician,
    comment:true,
    close:admin||dispatch||technician,
    delete:admin||dispatch||edit,
  };
}
async function getTireTasks() {
  const rows=await readJson('tiretasks.json',[]);
  return Array.isArray(rows)?rows:[];
}
async function writeTireTasks(rows) {
  await writeJson('tiretasks.json',(Array.isArray(rows)?rows:[]).slice(0,3000));
}
function publicTireTasks(cfg, rows) {
  const carById=Object.fromEntries(cfg.cars.map((car)=>[car.id,car]));
  const userById=Object.fromEntries(cfg.users.map((u)=>[u.id,u]));
  return (rows||[]).map((t)=>{
    const assignee=t.assignedToUserId?userById[t.assignedToUserId]:null;
    return {
      ...t,
      category:normalizeTireTaskCategory(cfg,t.category)||cleanVehicleCategory(t.category)||'POOL',
      assignedToUserId:t.assignedToUserId||null,
      assignedToName:assignee?.name||'',
      assignedToRole:assignee?.role||'',
      carPlate:carById[t.carId]?.plate||'Archiv',
      carName:carById[t.carId]?.name||'',
      carActive:carById[t.carId]?.active!==false,
      comments:Array.isArray(t.comments)?t.comments.slice(-100):[],
    };
  }).sort((a,b)=>{
    const aa=String(a.date||'')+'T'+String(a.time||'23:59'), bb=String(b.date||'')+'T'+String(b.time||'23:59');
    if(a.status==='closed'&&b.status!=='closed')return 1;
    if(a.status!=='closed'&&b.status==='closed')return -1;
    return aa.localeCompare(bb);
  });
}
async function completeMatchingTireTask(cfg, record, user, preferredTaskId = null) {
  const rows=await getTireTasks();
  const open=(t)=>t.carId===record.carId&&t.targetSeason===record.season&&['planned','in_progress','problem'].includes(t.status);
  let t=preferredTaskId ? rows.find((x)=>x.id===String(preferredTaskId)&&open(x)) : null;
  if(!t){
    const day=pragueDate(record.ts);
    const matches=rows.filter((x)=>open(x)&&x.date===day);
    matches.sort((a,b)=>String(a.time||'23:59').localeCompare(String(b.time||'23:59')));
    t=matches[0]||null;
  }
  if(!t)return null;
  const now=new Date(record.ts).toISOString();
  t.status='completed';
  t.completedRecordId=record.id;
  t.completedRecordPath=recordPath(record);
  t.completedDot=recordDotSummary(record);
  t.completedMileage=record.mileage;
  t.completedAt=now;
  t.completedBy=user?.name||'Neznámý';
  t.completedById=user?.id||null;
  t.updatedAt=now;
  t.updatedBy=user?.name||'Neznámý';
  t.updatedById=user?.id||null;
  t.activity=Array.isArray(t.activity)?t.activity:[];
  t.activity.push({id:uid('ta'),type:'dot_linked',at:now,userId:user?.id||null,userName:user?.name||'Neznámý',text:`PNEU/DOT záznam propojen: DOT ${recordDotSummary(record)} · ${Number(record.mileage).toLocaleString('cs-CZ')} km`});
  t.activity=t.activity.slice(-200);
  await writeTireTasks(rows);
  return t;
}
function enrichRecords(cfg, recs) {
  const byUser = Object.fromEntries(cfg.users.map((u) => [u.id, u.name]));
  const byCar = Object.fromEntries(cfg.cars.map((c) => [c.id, c]));
  return recs.map((r) => ({ ...r, userName: byUser[r.userId] || 'Neznámý', plate: byCar[r.carId]?.plate || 'Archiv', vehicle: byCar[r.carId]?.name || '' }));
}
function touchCar(car, user, at = new Date().toISOString()) {
  if (!car) return;
  car.lastModifiedAt = at;
  car.lastModifiedBy = user?.name || 'Systém';
  car.lastModifiedById = user?.id || null;
}
function buildVehicleOverview(cfg, recs, tireTasks = []) {
  const rows = enrichRecords(cfg, recs);
  return cfg.cars.map((car) => {
    const activeTasks=(tireTasks||[])
      .filter((t)=>t.carId===car.id&&t.status!=='closed')
      .sort((a,b)=>(String(a.date||'')+'T'+String(a.time||'23:59')).localeCompare(String(b.date||'')+'T'+String(b.time||'23:59')))
      .map((t)=>({id:t.id,date:t.date||'',time:t.time||'',status:t.status||'planned',targetSeason:t.targetSeason||'',category:normalizeTireTaskCategory(cfg,t.category)||cleanVehicleCategory(t.category)||''}));
    const own = rows.filter((r) => r.carId === car.id);
    const latest = own[0] || null;
    const summer = own.find((r) => r.season === 'summer') || null;
    const winter = own.find((r) => r.season === 'winter') || null;
    const metaTs = car.lastModifiedAt ? new Date(car.lastModifiedAt).getTime() : 0;
    const recTs = latest?.ts || 0;
    const lastModifiedBy = metaTs >= recTs ? (car.lastModifiedBy || latest?.userName || '—') : (latest?.userName || car.lastModifiedBy || '—');
    const lastModifiedAt = metaTs >= recTs ? (car.lastModifiedAt || latest?.createdAt || null) : (latest?.createdAt || car.lastModifiedAt || null);
    return {
      id: car.id,
      plate: car.plate,
      name: car.name || '',
      vin: car.vin || '',
      category: car.category || '',
      active: car.active !== false,
      createdAt: car.createdAt || null,
      updatedAt: car.updatedAt || null,
      lastModifiedAt,
      lastModifiedBy,
      recordCount: own.length,
      latestMileage: latest?.mileage ?? null,
      latestRecordAt: latest?.createdAt || null,
      latestRecordBy: latest?.userName || null,
      activeTaskCount: activeTasks.length,
      activeTasks,
      summer: summer ? { dot:summer.dot, dotFront:summer.dotFront||'', dotRear:summer.dotRear||'', splitDot:!!summer.splitDot, mileage:summer.mileage, createdAt:summer.createdAt, userName:summer.userName } : null,
      winter: winter ? { dot:winter.dot, dotFront:winter.dotFront||'', dotRear:winter.dotRear||'', splitDot:!!winter.splitDot, mileage:winter.mileage, createdAt:winter.createdAt, userName:winter.userName } : null,
    };
  }).sort((a,b)=>String(a.plate).localeCompare(String(b.plate),'cs'));
}
function seasonCampaignYear(season,value){
  const d=pragueDate(value),parts=d.split('-'),year=Number(parts[0]),month=Number(parts[1]);
  if(!Number.isFinite(year)||!Number.isFinite(month))return null;
  return season==='winter'?(month>=7?year:year-1):year;
}
function buildSeasonRecordEvidence(recs){
  const map=new Map();
  for(const r of recs||[]){
    if(!['summer','winter'].includes(r.season))continue;
    const campaignYear=seasonCampaignYear(r.season,r.ts||r.createdAt);
    if(!campaignYear)continue;
    const key=r.carId+':'+r.season+':'+campaignYear,prev=map.get(key);
    if(!prev||Number(r.ts||0)>Number(prev.ts||0)){
      map.set(key,{carId:r.carId,season:r.season,campaignYear,createdAt:r.createdAt||new Date(r.ts).toISOString(),ts:Number(r.ts)||0,dot:r.dot||'',dotFront:r.dotFront||'',dotRear:r.dotRear||'',splitDot:!!r.splitDot,mileage:Number(r.mileage)||0});
    }
  }
  return [...map.values()].sort((a,b)=>(b.campaignYear-a.campaignYear)||(b.ts-a.ts));
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
    car: { id: car.id, plate: car.plate, name: car.name, vin: car.vin || '', category: car.category || '', active: car.active !== false, createdAt: car.createdAt, updatedAt: car.updatedAt, lastModifiedAt: car.lastModifiedAt || null, lastModifiedBy: car.lastModifiedBy || '' },
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
      lastLoginAt: u.lastLoginAt || null, pinChangeRequired: normalizePinChangeRequired(u.pinChangeRequired),
      failedPinAttempts: Number(u.failedPinAttempts) || 0, lastFailedPinAt: u.lastFailedPinAt || null, loginLockedAt: u.loginLockedAt || null,
      recordCount: own.length, lastRecordAt: own[0]?.createdAt || null,
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
  const [notifications, tireTaskRows] = await Promise.all([getNotificationLog(), getTireTasks()]);
  const carById = Object.fromEntries(cfg.cars.map((c) => [c.id, c]));
  const notificationRows=notifications
    .map(normalizeNotificationRecord)
    .filter((n)=>Array.isArray(n.recipientUserIds)&&n.recipientUserIds.includes(currentUser.id)&&!n.retractedAt);
  const publicNotification=(n)=>{
    const ack=(n.acks||[]).find((a)=>a.userId===currentUser.id)||null;
    const seen=(n.seen||[]).find((a)=>a.userId===currentUser.id)||null;
    return {
      id:n.id,type:n.type,channel:n.channel,severity:n.severity,requiresAck:!!n.requiresAck,title:n.title,body:n.body,createdAt:n.createdAt,
      expiresAt:n.expiresAt||null,expired:notificationExpired(n),byUserName:n.byUserName||'',carId:n.carId||null,carPlate:n.carId?(carById[n.carId]?.plate||n.carPlate||''):(n.carPlate||''),
      acknowledgedAt:ack?.at||null,seenAt:seen?.at||ack?.at||null,read:!!(seen||ack||n.legacyPassive),
    };
  };
  const severityOrder={critical:3,important:2,info:1};
  const pendingNotifications=notificationRows
    .filter((n)=>n.requiresAck&&!notificationExpired(n)&&!(n.acks||[]).some((a)=>a.userId===currentUser.id))
    .sort((a,b)=>(severityOrder[b.severity]||0)-(severityOrder[a.severity]||0)||(b.ts||0)-(a.ts||0))
    .map(publicNotification);
  const toastNotifications=notificationRows
    .filter((n)=>!n.requiresAck&&!n.legacyPassive&&!notificationExpired(n)&&!(n.seen||[]).some((a)=>a.userId===currentUser.id))
    .sort((a,b)=>(severityOrder[b.severity]||0)-(severityOrder[a.severity]||0)||(b.ts||0)-(a.ts||0))
    .map(publicNotification);
  const notificationInbox=notificationRows.slice(0,150).map(publicNotification);
  const base = {
    me: { id: currentUser.id, name: currentUser.name, role: currentUser.role, active: currentUser.active },
    permissions: perms,
    vehicleCategories: cfg.vehicleCategories || DEFAULT_VEHICLE_CATEGORIES,
    cars: cfg.cars.filter((c) => c.active !== false),
    vehicleOverview: buildVehicleOverview(cfg, recs, tireTaskRows),
    seasonRecords: userCanAccessModule(cfg,'pneu',currentUser)&&['dotCreate','fleetView','historyView','attentionView'].some((k)=>perms[k]) ? buildSeasonRecordEvidence(recs) : [],
    tireTasks: userCanAccessModule(cfg,'tiretask',currentUser) ? publicTireTasks(cfg,tireTaskRows) : [],
    tireTaskCapabilities: tireTaskCapabilities(currentUser),
    tireTaskAssignableUsers: (()=>{const caps=tireTaskCapabilities(currentUser);return (caps.create||caps.edit)?cfg.users.filter((u)=>u.active!==false&&userCanAccessModule(cfg,'tiretask',u)).map((u)=>({id:u.id,name:u.name,role:u.role})):[]})(),
    records,
    attentionIssues: perms.attentionView ? computeIssues(cfg, recs).slice(0, 100) : [],
    pendingNotifications,
    toastNotifications,
    notificationInbox,
    notificationUnreadCount: notificationInbox.filter((n)=>!n.read&&!n.expired).length,
    notificationPrefs: normalizeUserNotificationPrefs(currentUser.notificationPrefs),
    notificationRecipients: hasPermission(currentUser,'notificationsSendOperational') ? cfg.users.filter((u)=>u.active!==false).map((u)=>({id:u.id,name:u.name,role:u.role})) : [],
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
    notificationLog: notifications.slice(0, 150).map((raw) => {const n=normalizeNotificationRecord(raw);return { ...n, carPlate: n.carId ? (carById[n.carId]?.plate || '') : '' };}),
    notificationSettings: cfg.notificationSettings,
    transportAdmin: { ...cfg.transport, sourceConfigured: !!GOLEMIO_API_KEY, sourceName: 'NDIC přes Golemio' },
    modulesAdmin: normalizeModules(cfg.modules),
  };
}
function validDotValue(dot){
  return /^\d{4}$/.test(dot) && Number(dot.slice(0,2))>=1 && Number(dot.slice(0,2))<=53;
}
function validateRecordFields(car, season, dot, mileage, splitDot=false, dotFront='', dotRear='') {
  if (!car) return 'CAR';
  if (!['summer', 'winter'].includes(season)) return 'SEASON';
  if (splitDot) {
    if (!validDotValue(dotFront) || !validDotValue(dotRear)) return 'DOT';
  } else if (!validDotValue(dot)) return 'DOT';
  if (!Number.isInteger(mileage) || mileage < 0 || mileage > 9_999_999) return 'MILEAGE';
  return null;
}
function recordDotSummary(record){
  return record?.dotFront&&record?.dotRear ? `PŘ ${record.dotFront} / Z ${record.dotRear}` : String(record?.dot||'');
}
function recordPath({ ts, id, carId, season, dot, mileage, userId, dotFront='', dotRear='' }) {
  const parts=[ts,id,carId,season,dot,mileage,userId];
  if(dotFront&&dotRear)parts.push(dotFront,dotRear);
  return `records/${parts.join('_')}.rec`;
}
function normalizePinChangeRequired(raw){
  if(!raw||raw.required!==true)return null;
  return {
    required:true,
    requireOldPin:raw.requireOldPin!==false,
    requestedAt:raw.requestedAt||null,
    requestedBy:raw.requestedBy||null,
    requestedById:raw.requestedById||null,
  };
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
    const forbidden=err?.message==='GOLEMIO_403';
    const unauthorized=err?.message==='GOLEMIO_401';
    const error=forbidden?'SOURCE_FORBIDDEN':unauthorized?'SOURCE_UNAUTHORIZED':'SOURCE_TEMPORARILY_UNAVAILABLE';
    if(cache?.events?.length&&!forbidden&&!unauthorized)return {...cache,sourceConfigured:true,stale:true,error};
    return { sourceConfigured:true, source:'NDIC přes Golemio', fetchedAt:null, stale:false, error, events:[] };
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
      status:(!feed.sourceConfigured||feed.error)?'unknown':critical?'critical':events.length?'warning':'clear',
      eventCount:events.length,criticalCount:critical,
      summary:!feed.sourceConfigured?'Datový zdroj čeká na připojení.':feed.error==='SOURCE_FORBIDDEN'?'API klíč nemá oprávnění k dopravnímu zdroji.':feed.error?'Dopravní data momentálně nejsou dostupná.':events[0]?.text||'Bez hlášených omezení.',
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

async function notifyAdminsAccountLocked(cfg,user,req) {
  const admins=cfg.users.filter((u)=>u.active&&u.role==='admin');
  if(!admins.length)return {sent:0,failed:0,devices:0};
  const n=await createNotification({
    type:'security_account_locked',channel:'admin',severity:'important',requiresAck:true,
    title:'Účet zablokován – '+user.name,
    body:'Účet byl zablokován po 3 chybných pokusech o PIN. Ověř fyzicky, co se stalo, a potom použij reset PINu v Admin → Uživatelé.',
    recipient:'admins',recipientUserIds:admins.map((u)=>u.id),byUserId:'system',byUserName:'Bezpečnost'
  });
  const result=await sendPushToUsers(cfg,admins.map((u)=>u.id),{
    title:'🔒 Účet zablokován – '+user.name,
    body:'3 chybné pokusy o PIN. Zkontroluj situaci a proveď reset PINu.',
    tag:'account-lock-'+user.id,url:'/?tab=admin'
  });
  await patchNotification(n.id,result);
  await appendAudit(null,'login_account_locked','Účet '+user.name+' zablokován po 3 chybných PIN pokusech',{
    userId:user.id,lockedAt:user.loginLockedAt,lastFailedPinAt:user.lastFailedPinAt,
    sourceIp:ip(req),userAgent:cleanText(req.headers['user-agent'],180),notificationId:n.id,...result
  });
  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body ||= {};

  try {
    if (body.action === 'loginUsers') {
      const cfg=await readConfig();
      return json(res,200,{users:cfg.users.filter((u)=>u.active).map((u)=>{
        const reset=normalizePinChangeRequired(u.pinChangeRequired);
        return {id:u.id,name:u.name,role:u.role,resetWithoutOldPin:!!(reset?.required&&reset.requireOldPin===false)};
      })});
    }

    if (body.action === 'beginPinReset') {
      const userId=String(body.userId||''),cfg=await readConfig();
      const u=cfg.users.find((x)=>x.id===userId&&x.active);
      if(!u)return json(res,404,{error:'USER'});
      if(u.role==='admin')return json(res,403,{error:'ADMIN_PIN_RESET'});
      const reset=normalizePinChangeRequired(u.pinChangeRequired);
      if(!reset?.required||reset.requireOldPin!==false)return json(res,403,{error:'PIN_RESET_NOT_AVAILABLE',message:'Pro tento účet není povolen reset bez stávajícího PINu.'});
      const token=sign({uid:u.id,role:u.role,pinResetOnly:true,resetRequestedAt:reset.requestedAt,exp:Date.now()+15*60*1000});
      return json(res,200,{token,user:{id:u.id,name:u.name,role:u.role},pinChangeRequired:reset});
    }

    if (body.action === 'login') {
      const userId=String(body.userId||''),pin=String(body.pin||'');
      if(!userId)return json(res,400,{error:'USER',message:'Vyber uživatele.'});
      if(!/^\d{4}$/.test(pin))return json(res,400,{error:'PIN'});
      const cfg=await readConfig();
      const u=cfg.users.find((x)=>x.id===userId&&x.active);
      if(!u)return json(res,404,{error:'USER'});
      if(u.role!=='admin'&&u.loginLockedAt){
        return json(res,423,{error:'ACCOUNT_LOCKED',message:'Účet je zablokovaný po 3 chybných pokusech. Kontaktuj administrátora.',lockedAt:u.loginLockedAt});
      }

      const adminKey='admin:'+u.id+':'+ip(req);
      const adminAttempt=attempts.get(adminKey)||{n:0,blocked:0};
      if(u.role==='admin'&&adminAttempt.blocked>Date.now()){
        return json(res,429,{error:'LOCKED',seconds:Math.ceil((adminAttempt.blocked-Date.now())/1000)});
      }

      const good=safeEqualHex(u.pinHash,pinHash(pin));
      if(!good){
        await new Promise((r)=>setTimeout(r,450));
        if(u.role==='admin'){
          adminAttempt.n+=1;
          if(adminAttempt.n>=3){adminAttempt.blocked=Date.now()+10*60*1000;adminAttempt.n=0}
          attempts.set(adminKey,adminAttempt);
          return json(res,401,{error:'BAD_PIN',attemptsRemaining:adminAttempt.blocked>Date.now()?0:Math.max(0,3-adminAttempt.n)});
        }
        u.failedPinAttempts=Math.min(3,(Number(u.failedPinAttempts)||0)+1);
        u.lastFailedPinAt=new Date().toISOString();
        const attemptsRemaining=Math.max(0,3-u.failedPinAttempts);
        if(u.failedPinAttempts>=3){
          u.loginLockedAt=u.lastFailedPinAt;
          await writeConfig(cfg);
          await notifyAdminsAccountLocked(cfg,u,req);
          return json(res,423,{error:'ACCOUNT_LOCKED',message:'Účet byl po 3 chybných pokusech zablokován. Kontaktuj administrátora.',attemptsRemaining:0,lockedAt:u.loginLockedAt});
        }
        await writeConfig(cfg);
        await appendAudit(null,'login_pin_failed','Chybný PIN pro účet '+u.name,{userId:u.id,attempt:u.failedPinAttempts,attemptsRemaining,at:u.lastFailedPinAt});
        return json(res,401,{error:'BAD_PIN',attemptsRemaining});
      }

      attempts.delete(adminKey);
      u.failedPinAttempts=0;
      u.lastFailedPinAt=null;
      const sys=systemState(cfg);
      if(u.role!=='admin'&&sys.mode==='maintenance'){
        await writeConfig(cfg);
        return json(res,423,{error:'MAINTENANCE',message:sys.message||defaultSystemMessage('maintenance')});
      }
      u.lastLoginAt=new Date().toISOString();
      await writeConfig(cfg);
      const token=sign({uid:u.id,role:u.role,exp:Date.now()+12*60*60*1000});
      return json(res,200,{token,user:{id:u.id,name:u.name,role:u.role},pinChangeRequired:normalizePinChangeRequired(u.pinChangeRequired)});
    }

    const session = auth(req);
    if (!session) return json(res, 401, { error: 'AUTH' });
    const cfg = await readConfig();
    const currentUser = cfg.users.find((x) => x.id === session.uid && x.active);
    if (!currentUser) return json(res, 401, { error: 'AUTH' });

    const pinReset=normalizePinChangeRequired(currentUser.pinChangeRequired);
    if(session.pinResetOnly){
      if(body.action!=='changeOwnPin')return json(res,403,{error:'PIN_RESET_ONLY',message:'Tento dočasný přístup slouží pouze ke změně PINu.'});
      if(!pinReset?.required||pinReset.requireOldPin!==false||session.resetRequestedAt!==pinReset.requestedAt)return json(res,401,{error:'AUTH'});
    }
    if(pinReset&&body.action!=='changeOwnPin'){
      return json(res,423,{error:'PIN_CHANGE_REQUIRED',message:'Než bude možné pokračovat, je nutné nastavit nový PIN.',requireOldPin:pinReset.requireOldPin});
    }
    if(body.action==='changeOwnPin'){
      if(!pinReset)return json(res,409,{error:'PIN_CHANGE_NOT_REQUIRED',message:'Pro tento účet není změna PINu vyžádána.'});
      const oldPin=String(body.oldPin||''),newPin=String(body.newPin||''),confirmPin=String(body.confirmPin||'');
      if(pinReset.requireOldPin&&(!/^\d{4}$/.test(oldPin)||!safeEqualHex(currentUser.pinHash,pinHash(oldPin))))return json(res,400,{error:'PIN_OLD',message:'Stávající PIN není správný.'});
      if(!/^\d{4}$/.test(newPin))return json(res,400,{error:'PIN',message:'Nový PIN musí mít 4 číslice.'});
      if(newPin!==confirmPin)return json(res,400,{error:'PIN_MATCH',message:'Nové PINy se neshodují.'});
      const newHash=pinHash(newPin);
      if(safeEqualHex(currentUser.pinHash,newHash))return json(res,400,{error:'PIN_SAME',message:'Nový PIN musí být jiný než stávající PIN.'});
      if(cfg.users.some((u)=>u.id!==currentUser.id&&u.active&&safeEqualHex(u.pinHash,newHash)))return json(res,409,{error:'PIN_USED'});
      const resetBefore={...pinReset};
      currentUser.pinHash=newHash;
      currentUser.pinChangeRequired=null;
      currentUser.failedPinAttempts=0;
      currentUser.lastFailedPinAt=null;
      currentUser.loginLockedAt=null;
      currentUser.pinChangedAt=new Date().toISOString();
      await writeConfig(cfg);
      await appendAudit(currentUser,'user_pin_self_change','Uživatel si změnil PIN po výzvě administrátora',{userId:currentUser.id,resetRequest:resetBefore});
      const token=sign({uid:currentUser.id,role:currentUser.role,exp:Date.now()+12*60*60*1000});
      return json(res,200,{ok:true,token,user:{id:currentUser.id,name:currentUser.name,role:currentUser.role}});
    }

    const sys = systemState(cfg);
    if (currentUser.role !== 'admin' && sys.mode === 'maintenance') {
      return json(res, 423, { error: 'MAINTENANCE', message: sys.message || defaultSystemMessage('maintenance') });
    }
    const readOnlyAllowed = new Set(['state', 'heartbeat', 'myPushDevices', 'vehicleDetail', 'notificationRespond', 'notificationSeen', 'saveNotificationPrefs', 'trafficReport']);
    if (currentUser.role !== 'admin' && sys.mode === 'read_only' && !readOnlyAllowed.has(body.action)) {
      return json(res, 423, { error: 'READ_ONLY', message: sys.message || defaultSystemMessage('read_only') });
    }

    const requestedModule = actionModule(body.action);
    if (requestedModule) {
      const ms=moduleState(cfg,requestedModule);
      if(!ms.online)return json(res,423,{error:'MODULE_OFFLINE',module:requestedModule,moduleLabel:MODULE_LABELS[requestedModule],message:ms.offlineMessage});
      if(currentUser.role!=='admin'&&!userCanSeeModule(cfg,requestedModule,currentUser))return json(res,403,{error:'MODULE_HIDDEN',module:requestedModule,moduleLabel:MODULE_LABELS[requestedModule],message:'Tento modul pro tebe není povolený.'});
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
      const season = String(body.season || ''), mileage = Number(body.mileage), splitDot=!!body.splitDot;
      const dotFront=splitDot?String(body.dotFront||''):'',dotRear=splitDot?String(body.dotRear||''):'';
      const dot=splitDot?dotFront:String(body.dot||'');
      const error = validateRecordFields(car, season, dot, mileage, splitDot, dotFront, dotRear);
      if (error) return json(res, 400, { error });
      const r = { ts: Date.now(), id: uid(), carId: car.id, season, dot, dotFront, dotRear, splitDot, mileage, userId: currentUser.id };
      await put(recordPath(r), '1', { access: 'private', addRandomSuffix: false, contentType: 'text/plain' });
      touchCar(car, currentUser, new Date(r.ts).toISOString());
      await writeConfig(cfg);
      const completedTask=await completeMatchingTireTask(cfg,r,currentUser,body.tireTaskId||null);
      await appendAudit(currentUser, 'record_add', `Přidán záznam ${car.plate} · ${season === 'summer' ? 'Letní' : 'Zimní'} · DOT ${recordDotSummary(r)} · ${mileage} km`, { ...r, tireTaskId:completedTask?.id||null });
      if(completedTask) await appendAudit(currentUser,'tiretask_auto_complete',`TIRETASK ${car.plate} automaticky označen jako hotový`,{taskId:completedTask.id,recordId:r.id});
      return json(res, 200, { ok: true, tireTaskCompleted:completedTask ? { id:completedTask.id } : null });
    }

    if (body.action === 'tireTaskCreateBatch') {
      const caps=tireTaskCapabilities(currentUser);
      if(!caps.create)return json(res,403,{error:'PERMISSION'});
      const date=normalizeTaskDate(body.date);
      const rawEntries=Array.isArray(body.entries)?body.entries:[];
      if(!rawEntries.length||rawEntries.length>6)return json(res,400,{error:'TIRETASK',message:'Denní plán musí obsahovat 1 až 6 vozidel.'});
      const entries=rawEntries.slice(0,6);
      const assignedToUserId=String(body.assignedToUserId||'').trim();
      const assignee=assignedToUserId?cfg.users.find((u)=>u.id===assignedToUserId&&u.active!==false):null;
      if(!date)return json(res,400,{error:'TIRETASK_DATE'});
      if(assignedToUserId&&!assignee)return json(res,404,{error:'USER'});
      const normalized=[];
      for(const entry of entries){
        const rawTime=String(entry?.time||'').trim(),time=rawTime?normalizeTaskTime(rawTime):'';
        if(rawTime&&!time)return json(res,400,{error:'TIRETASK_TIME'});
        const car=cfg.cars.find((x)=>x.id===String(entry?.carId||'')&&x.active!==false);
        if(!car)return json(res,404,{error:'CAR'});
        const category=normalizeTireTaskCategory(cfg,entry?.category)||normalizeTireTaskCategory(cfg,car.category);
        if(!category)return json(res,400,{error:'VEHICLE_CATEGORY'});
        const targetSeason=['summer','winter'].includes(entry?.targetSeason)?entry.targetSeason:'';
        if(!targetSeason)return json(res,400,{error:'SEASON'});
        normalized.push({time,car,category,targetSeason});
      }
      const now=new Date().toISOString(),batchId=uid('tb'),instructions=cleanText(body.instructions,700);
      const created=normalized.map((entry,index)=>({
        id:uid('tt'),batchId,batchIndex:index,date,time:entry.time,carId:entry.car.id,category:entry.category,targetSeason:entry.targetSeason,
        assignedToUserId:assignee?.id||null,instructions,status:'planned',
        createdAt:now,createdBy:currentUser.name,createdById:currentUser.id,
        updatedAt:now,updatedBy:currentUser.name,updatedById:currentUser.id,
        comments:[],activity:[{id:uid('ta'),type:'created',at:now,userId:currentUser.id,userName:currentUser.name,text:'Položka vytvořena v denním plánu '+(index+1)+'/'+normalized.length}],
        completedRecordId:null,completedRecordPath:null,completedDot:null,completedMileage:null,completedAt:null,completedBy:null,completedById:null,
        closedAt:null,closedBy:null,closedById:null,problemNote:''
      }));
      const rows=await getTireTasks();rows.push(...created);await writeTireTasks(rows);
      await appendAudit(currentUser,'tiretask_batch_create',`Vytvořen TIRETASK plán na ${date} · ${created.length} vozidel${assignee?' · '+assignee.name:''}`,{batchId,date,count:created.length,assignedToUserId:assignee?.id||null,taskIds:created.map((t)=>t.id)});
      return json(res,200,{ok:true,batchId,count:created.length,tasks:publicTireTasks(cfg,created)});
    }

    if (body.action === 'tireTaskCreate') {
      const caps=tireTaskCapabilities(currentUser);
      if(!caps.create)return json(res,403,{error:'PERMISSION'});
      const date=normalizeTaskDate(body.date),time=body.time?normalizeTaskTime(body.time):'';
      const car=cfg.cars.find((x)=>x.id===String(body.carId||'')&&x.active!==false);
      const requestedCategory=body.category===undefined?'':normalizeTireTaskCategory(cfg,body.category);
      if(body.category!==undefined&&!requestedCategory)return json(res,400,{error:'VEHICLE_CATEGORY'});
      const category=requestedCategory||normalizeTireTaskCategory(cfg,car?.category)||'POOL';
      const targetSeason=['summer','winter'].includes(body.targetSeason)?body.targetSeason:'';
      const assignedToUserId=String(body.assignedToUserId||'').trim();
      const assignee=assignedToUserId?cfg.users.find((u)=>u.id===assignedToUserId&&u.active!==false):null;
      if(!date)return json(res,400,{error:'TIRETASK_DATE'});
      if(body.time&&!time)return json(res,400,{error:'TIRETASK_TIME'});
      if(!car)return json(res,404,{error:'CAR'});
      if(!targetSeason)return json(res,400,{error:'SEASON'});
      if(assignedToUserId&&!assignee)return json(res,404,{error:'USER'});
      const now=new Date().toISOString();
      const task={
        id:uid('tt'),date,time,carId:car.id,category,targetSeason,
        assignedToUserId:assignee?.id||null,
        instructions:cleanText(body.instructions,700),status:'planned',
        createdAt:now,createdBy:currentUser.name,createdById:currentUser.id,
        updatedAt:now,updatedBy:currentUser.name,updatedById:currentUser.id,
        comments:[],activity:[{id:uid('ta'),type:'created',at:now,userId:currentUser.id,userName:currentUser.name,text:assignee?'Úkol vytvořen a přiřazen: '+assignee.name:'Úkol vytvořen'}],
        completedRecordId:null,completedRecordPath:null,completedDot:null,completedMileage:null,completedAt:null,completedBy:null,completedById:null,
        closedAt:null,closedBy:null,closedById:null,problemNote:''
      };
      const rows=await getTireTasks();rows.push(task);await writeTireTasks(rows);
      await appendAudit(currentUser,'tiretask_create',`Vytvořen TIRETASK ${car.plate} na ${date}${time?' '+time:''}${assignee?' · '+assignee.name:''}`,task);
      return json(res,200,{ok:true,task:publicTireTasks(cfg,[task])[0]});
    }

    if (body.action === 'tireTaskUpdate') {
      const caps=tireTaskCapabilities(currentUser);
      if(!caps.edit)return json(res,403,{error:'PERMISSION'});
      const rows=await getTireTasks(),task=rows.find((x)=>x.id===String(body.taskId||''));
      if(!task)return json(res,404,{error:'TIRETASK'});
      if(task.status==='closed')return json(res,409,{error:'TIRETASK_CLOSED'});
      if(task.status==='completed')return json(res,409,{error:'TIRETASK_COMPLETED',message:'Hotový úkol už nelze měnit; nejdřív je potřeba opravit navázaný PNEU/DOT záznam.'});
      const before={date:task.date,time:task.time,carId:task.carId,category:task.category,targetSeason:task.targetSeason,assignedToUserId:task.assignedToUserId||null,instructions:task.instructions};
      if(body.date!==undefined){const v=normalizeTaskDate(body.date);if(!v)return json(res,400,{error:'TIRETASK_DATE'});task.date=v}
      if(body.time!==undefined){const raw=String(body.time||'').trim();const v=raw?normalizeTaskTime(raw):'';if(raw&&!v)return json(res,400,{error:'TIRETASK_TIME'});task.time=v}
      if(body.carId!==undefined){const car=cfg.cars.find((x)=>x.id===String(body.carId)&&x.active!==false);if(!car)return json(res,404,{error:'CAR'});task.carId=car.id}
      if(body.category!==undefined){const category=normalizeTireTaskCategory(cfg,body.category);if(!category)return json(res,400,{error:'VEHICLE_CATEGORY'});task.category=category}
      if(body.targetSeason!==undefined&&['summer','winter'].includes(body.targetSeason))task.targetSeason=body.targetSeason;
      if(body.assignedToUserId!==undefined){
        const assignedId=String(body.assignedToUserId||'').trim();
        const assigned=assignedId?cfg.users.find((u)=>u.id===assignedId&&u.active!==false):null;
        if(assignedId&&!assigned)return json(res,404,{error:'USER'});
        task.assignedToUserId=assigned?.id||null;
      }
      if(body.instructions!==undefined)task.instructions=cleanText(body.instructions,700);
      const now=new Date().toISOString();task.updatedAt=now;task.updatedBy=currentUser.name;task.updatedById=currentUser.id;
      task.activity=Array.isArray(task.activity)?task.activity:[];task.activity.push({id:uid('ta'),type:'updated',at:now,userId:currentUser.id,userName:currentUser.name,text:'Plán úkolu upraven'});task.activity=task.activity.slice(-200);
      await writeTireTasks(rows);await appendAudit(currentUser,'tiretask_update','Upraven TIRETASK',{taskId:task.id,before,after:{date:task.date,time:task.time,carId:task.carId,category:task.category,targetSeason:task.targetSeason,assignedToUserId:task.assignedToUserId||null,instructions:task.instructions}});
      return json(res,200,{ok:true,task:publicTireTasks(cfg,[task])[0]});
    }

    if (body.action === 'tireTaskComment') {
      const caps=tireTaskCapabilities(currentUser);
      if(!caps.comment)return json(res,403,{error:'PERMISSION'});
      const textValue=cleanText(body.text,500);
      if(!textValue)return json(res,400,{error:'MESSAGE'});
      const rows=await getTireTasks(),task=rows.find((x)=>x.id===String(body.taskId||''));
      if(!task)return json(res,404,{error:'TIRETASK'});
      if(task.status==='closed')return json(res,409,{error:'TIRETASK_CLOSED'});
      const now=new Date().toISOString(),comment={id:uid('tc'),at:now,userId:currentUser.id,userName:currentUser.name,text:textValue};
      task.comments=Array.isArray(task.comments)?task.comments:[];task.comments.push(comment);task.comments=task.comments.slice(-100);
      task.updatedAt=now;task.updatedBy=currentUser.name;task.updatedById=currentUser.id;
      task.activity=Array.isArray(task.activity)?task.activity:[];task.activity.push({id:uid('ta'),type:'comment',at:now,userId:currentUser.id,userName:currentUser.name,text:'Přidána poznámka'});task.activity=task.activity.slice(-200);
      await writeTireTasks(rows);await appendAudit(currentUser,'tiretask_comment','Přidána poznámka k TIRETASK',{taskId:task.id,commentId:comment.id});
      return json(res,200,{ok:true,comment});
    }

    if (body.action === 'tireTaskSetStatus') {
      const caps=tireTaskCapabilities(currentUser);
      const rows=await getTireTasks(),task=rows.find((x)=>x.id===String(body.taskId||''));
      if(!task)return json(res,404,{error:'TIRETASK'});
      if(!caps.progress&&task.assignedToUserId!==currentUser.id)return json(res,403,{error:'PERMISSION'});
      if(task.status==='closed')return json(res,409,{error:'TIRETASK_CLOSED'});
      if(task.status==='completed')return json(res,409,{error:'TIRETASK_COMPLETED',message:'Hotový úkol už lze pouze okomentovat nebo uzavřít.'});
      const status=String(body.status||'');
      if(!['planned','in_progress','problem'].includes(status))return json(res,400,{error:'TIRETASK_STATUS'});
      const now=new Date().toISOString(),before=task.status;task.status=status;
      task.problemNote=status==='problem'?cleanText(body.problemNote,500):(status!=='problem'?'':task.problemNote||'');
      task.updatedAt=now;task.updatedBy=currentUser.name;task.updatedById=currentUser.id;
      task.activity=Array.isArray(task.activity)?task.activity:[];task.activity.push({id:uid('ta'),type:'status',at:now,userId:currentUser.id,userName:currentUser.name,text:status==='in_progress'?'Úkol rozpracován':status==='problem'?'Označeno jako problém':'Vráceno do plánovaných'});task.activity=task.activity.slice(-200);
      await writeTireTasks(rows);await appendAudit(currentUser,'tiretask_status',`TIRETASK stav ${before} → ${status}`,{taskId:task.id,problemNote:task.problemNote});
      return json(res,200,{ok:true,task:publicTireTasks(cfg,[task])[0]});
    }

    if (body.action === 'tireTaskClose') {
      const caps=tireTaskCapabilities(currentUser);
      const rows=await getTireTasks(),task=rows.find((x)=>x.id===String(body.taskId||''));
      if(!task)return json(res,404,{error:'TIRETASK'});
      if(!caps.close&&task.assignedToUserId!==currentUser.id)return json(res,403,{error:'PERMISSION'});
      if(task.status!=='completed')return json(res,409,{error:'TIRETASK_NOT_COMPLETED',message:'Úkol lze uzavřít až po propojeném PNEU/DOT zápisu.'});
      const now=new Date().toISOString();task.status='closed';task.closedAt=now;task.closedBy=currentUser.name;task.closedById=currentUser.id;task.updatedAt=now;task.updatedBy=currentUser.name;task.updatedById=currentUser.id;
      task.activity=Array.isArray(task.activity)?task.activity:[];task.activity.push({id:uid('ta'),type:'closed',at:now,userId:currentUser.id,userName:currentUser.name,text:'Úkol uzavřen jako dokončený'});task.activity=task.activity.slice(-200);
      await writeTireTasks(rows);await appendAudit(currentUser,'tiretask_close','TIRETASK uzavřen jako dokončený',{taskId:task.id});
      return json(res,200,{ok:true,task:publicTireTasks(cfg,[task])[0]});
    }

    if (body.action === 'tireTaskDelete') {
      const caps=tireTaskCapabilities(currentUser);
      if(!caps.delete)return json(res,403,{error:'PERMISSION'});
      const rows=await getTireTasks(),idx=rows.findIndex((x)=>x.id===String(body.taskId||''));
      if(idx<0)return json(res,404,{error:'TIRETASK'});
      const task=rows[idx],car=cfg.cars.find((x)=>x.id===task.carId);
      rows.splice(idx,1);
      await writeTireTasks(rows);
      await appendAudit(currentUser,'tiretask_delete','Smazán TIRETASK '+(car?.plate||task.carId||'')+' · '+(task.date||''),{task});
      return json(res,200,{ok:true,id:task.id});
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
      if (currentUser.role !== 'admin' && normalizeTransportConfig(cfg.transport).userSettingsVisible === false) return json(res,403,{error:'TRAFFIC_PREFS_HIDDEN',message:'Nastavení Dopravního reportu je administrátorem skryté.'});
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
        const sender=cfg.users.find((u)=>u.active&&u.id===n.byUserId&&u.id!==currentUser.id);
        const confirmationIds=sender?[sender.id]:cfg.users.filter((u)=>u.active&&u.role==='admin'&&u.id!==currentUser.id).map((u)=>u.id);
        if (confirmationIds.length) {
          await sendPushToUsers(cfg, confirmationIds, {
            title: 'Potvrzeno oznámení',
            body: currentUser.name + ': ' + (response === 'view_vehicle' ? 'Zobrazil vozidlo' : 'Rozumím') + ' – ' + n.title,
            tag: 'ack-' + n.id + '-' + currentUser.id,
            url: '/?module=notifications',
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

    if (body.action === 'notificationSeen') {
      const notificationId=String(body.notificationId||'');
      const notifications=await getNotificationLog(),n=notifications.find((x)=>x.id===notificationId);
      if(!n||!Array.isArray(n.recipientUserIds)||!n.recipientUserIds.includes(currentUser.id))return json(res,403,{error:'NOTIFICATION'});
      n.seen=Array.isArray(n.seen)?n.seen:[];
      if(!n.seen.some((x)=>x.userId===currentUser.id))n.seen.push({userId:currentUser.id,userName:currentUser.name,at:new Date().toISOString()});
      await writeNotificationLog(notifications);
      return json(res,200,{ok:true});
    }

    if (body.action === 'saveNotificationPrefs') {
      currentUser.notificationPrefs=normalizeUserNotificationPrefs(body.prefs);
      await writeConfig(cfg);
      await appendAudit(currentUser,'notification_prefs','Upraveno osobní nastavení oznámení',currentUser.notificationPrefs);
      return json(res,200,{ok:true,prefs:currentUser.notificationPrefs});
    }

    if (body.action === 'sendOperationalNotification') {
      if(!hasPermission(currentUser,'notificationsSendOperational'))return json(res,403,{error:'PERMISSION'});
      const title=cleanText(body.title,80),message=cleanText(body.message,500),recipient=String(body.recipient||'all');
      const severity=['info','important'].includes(body.severity)?body.severity:'info';
      const requiresAck=!!body.requiresAck,expiresAt=body.expiresAt?normalizeNotificationExpiry(body.expiresAt):null;
      if(!title||!message)return json(res,400,{error:'MESSAGE'});
      if(body.expiresAt&&!expiresAt)return json(res,400,{error:'MESSAGE',message:'Platnost oznámení musí být v budoucnu.'});
      let users=cfg.users.filter((u)=>u.active&&hasPermission(u,'notificationsReceive')&&userAllowsNotification(u,'operational',severity));
      if(recipient!=='all')users=users.filter((u)=>u.id===recipient);
      if(!users.length)return json(res,404,{error:'USER',message:'Žádný z vybraných uživatelů nemá povolená provozní oznámení.'});
      const n=await createNotification({type:'operational_manual',channel:'operational',severity,requiresAck,expiresAt,title,body:message,recipient,recipientUserIds:users.map((u)=>u.id),byUserId:currentUser.id,byUserName:currentUser.name});
      const result=await sendPushToUsers(cfg,users.map((u)=>u.id),{title:(severity==='important'?'⚠️ ':'🔔 ')+title,body:message,tag:'notification-'+n.id,url:'/?module=notifications&notification='+encodeURIComponent(n.id)});
      await patchNotification(n.id,result);
      await appendAudit(currentUser,'operational_notification_send','Odesláno provozní oznámení „'+title+'“ ('+result.sent+'/'+(result.devices||0)+')',{notificationId:n.id,recipient,severity,requiresAck,expiresAt,...result});
      return json(res,200,{ok:true,notificationId:n.id,...result});
    }

    if (body.action === 'editRecord') {
      if (!hasPermission(currentUser, 'dotEdit')) return json(res, 403, { error: 'PERMISSION' });
      const recs = await getRecords();
      const r = recs.find((x) => x.path === body.path || x.id === body.recordId);
      if (!r) return json(res, 404, { error: 'RECORD' });
      const car = cfg.cars.find((c) => c.id === (body.carId || r.carId));
      const season = String(body.season || r.season), mileage = Number(body.mileage);
      const splitDot=body.splitDot===undefined?!!(r.dotFront&&r.dotRear):!!body.splitDot;
      const dotFront=splitDot?String(body.dotFront!==undefined?body.dotFront:(r.dotFront||r.dot||'')):'';
      const dotRear=splitDot?String(body.dotRear!==undefined?body.dotRear:(r.dotRear||r.dot||'')):'';
      const dot=splitDot?dotFront:String(body.dot||r.dot);
      const error = validateRecordFields(car, season, dot, mileage, splitDot, dotFront, dotRear);
      if (error) return json(res, 400, { error });
      const before = { ...r };
      const after = { ...r, carId: car.id, season, dot, dotFront, dotRear, splitDot, mileage };
      const newPath = recordPath(after);
      await put(newPath, '1', { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain' });
      if (newPath !== r.path) await del(r.path);
      touchCar(car, currentUser);
      await writeConfig(cfg);
      await appendAudit(currentUser, 'record_edit', `Upraven záznam ${car.plate}: DOT ${recordDotSummary(before)} → ${recordDotSummary(after)}, km ${before.mileage} → ${mileage}`, { before, after: { ...after, path: newPath } });
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
      touchCar(car, currentUser);
      await writeConfig(cfg);
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
      touchCar(car, currentUser);
      await writeConfig(cfg);
      return json(res, 200, { ok: true });
    }

    if (body.action === 'vehicleAdd') {
      if (!hasPermission(currentUser,'vehicleAdd')) return json(res,403,{error:'PERMISSION'});
      const plate = cleanPlate(body.plate), name = cleanText(body.name,80), vin = cleanVin(body.vin), category = cleanVehicleCategory(body.category);
      if (!plate) return json(res,400,{error:'PLATE'});
      if (!category || !cfg.vehicleCategories.includes(category)) return json(res,400,{error:'VEHICLE_CATEGORY'});
      if (cfg.cars.some((c)=>c.plate===plate)) return json(res,409,{error:'DUPLICATE'});
      const now=new Date().toISOString();
      const car={id:uid('c'),plate,name,vin,category,active:true,createdAt:now,updatedAt:now,lastModifiedAt:now,lastModifiedBy:currentUser.name,lastModifiedById:currentUser.id};
      cfg.cars.push(car);await writeConfig(cfg);
      await appendAudit(currentUser,'car_add',`Přidáno auto ${plate} ${name}`,car);
      return json(res,200,{ok:true,car});
    }

    if (body.action === 'vehicleCategoryAdd') {
      if (!hasPermission(currentUser,'vehicleCategoryAdd')) return json(res,403,{error:'PERMISSION'});
      const category=cleanVehicleCategory(body.category);
      if (!category) return json(res,400,{error:'VEHICLE_CATEGORY'});
      if (cfg.vehicleCategories.includes(category)) return json(res,409,{error:'VEHICLE_CATEGORY_DUPLICATE'});
      cfg.vehicleCategories.push(category);await writeConfig(cfg);
      await appendAudit(currentUser,'vehicle_category_add',`Přidána kategorie vozidel ${category}`,{category});
      return json(res,200,{ok:true,vehicleCategories:cfg.vehicleCategories});
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
        if (Array.isArray(incoming[key].allowedUserIds)) {
          const validIds=new Set(cfg.users.filter((u)=>u.active!==false&&u.role!=='admin').map((u)=>u.id));
          next[key].allowedUserIds=[...new Set(incoming[key].allowedUserIds.map(String).filter((id)=>validIds.has(id)))].slice(0,200);
        }
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
        userSettingsVisible: s.userSettingsVisible !== false,
        cacheMinutes: s.cacheMinutes,
        pollMinutes: s.pollMinutes,
      });
      await writeConfig(cfg);
      await appendAudit(currentUser,'transport_settings','Upraveno nastavení Dopravního reportu',{enabled:cfg.transport.enabled,notificationsEnabled:cfg.transport.notificationsEnabled,userSettingsVisible:cfg.transport.userSettingsVisible,cacheMinutes:cfg.transport.cacheMinutes,pollMinutes:cfg.transport.pollMinutes});
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
      const plate = cleanPlate(body.plate), name = cleanText(body.name, 80), vin = cleanVin(body.vin), category = cleanVehicleCategory(body.category);
      if (!plate) return json(res, 400, { error: 'PLATE' });
      if (!category || !cfg.vehicleCategories.includes(category)) return json(res, 400, { error: 'VEHICLE_CATEGORY' });
      if (cfg.cars.some((c) => c.plate === plate)) return json(res, 409, { error: 'DUPLICATE' });
      const now = new Date().toISOString();
      const car = { id: uid('c'), plate, name, vin, category, active: true, createdAt: now, updatedAt: now, lastModifiedAt: now, lastModifiedBy: currentUser.name, lastModifiedById: currentUser.id };
      cfg.cars.push(car); await writeConfig(cfg);
      await appendAudit(currentUser, 'car_add', `Přidáno auto ${plate} ${name}`, car);
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminUpdateCar') {
      const car = cfg.cars.find((c) => c.id === body.carId);
      if (!car) return json(res, 404, { error: 'CAR' });
      const plate = cleanPlate(body.plate), name = cleanText(body.name, 80), vin = cleanVin(body.vin);
      const category = body.category === undefined ? (car.category || '') : cleanVehicleCategory(body.category);
      if (!plate) return json(res, 400, { error: 'PLATE' });
      if (category && !cfg.vehicleCategories.includes(category)) return json(res, 400, { error: 'VEHICLE_CATEGORY' });
      if (cfg.cars.some((c) => c.id !== car.id && c.plate === plate)) return json(res, 409, { error: 'DUPLICATE' });
      const before = { plate: car.plate, name: car.name, vin: car.vin || '', category: car.category || '' };
      car.plate = plate; car.name = name; car.vin = vin; car.category = category; car.updatedAt = new Date().toISOString(); touchCar(car, currentUser, car.updatedAt);
      await writeConfig(cfg);
      await appendAudit(currentUser, 'car_edit', `Upraveno auto ${before.plate} → ${plate}`, { carId: car.id, before, after: { carId: car.id, plate, name, vin, category } });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminSetCarCategory') {
      const car = cfg.cars.find((c) => c.id === body.carId);
      if (!car) return json(res, 404, { error: 'CAR' });
      const category = cleanVehicleCategory(body.category);
      if (!category || !cfg.vehicleCategories.includes(category)) return json(res, 400, { error: 'VEHICLE_CATEGORY' });
      const before = car.category || '';
      car.category = category; car.updatedAt = new Date().toISOString(); touchCar(car, currentUser, car.updatedAt);
      await writeConfig(cfg);
      await appendAudit(currentUser, 'car_category', `Kategorie vozidla ${car.plate}: ${before || 'bez kategorie'} → ${category}`, { carId:car.id, before, after:category });
      return json(res, 200, { ok:true, category });
    }

    if (body.action === 'adminAddVehicleCategory') {
      const category = cleanVehicleCategory(body.category);
      if (!category) return json(res, 400, { error:'VEHICLE_CATEGORY' });
      if (cfg.vehicleCategories.includes(category)) return json(res, 409, { error:'VEHICLE_CATEGORY_DUPLICATE' });
      cfg.vehicleCategories.push(category);
      await writeConfig(cfg);
      await appendAudit(currentUser, 'vehicle_category_add', `Přidána kategorie vozidel ${category}`, { category });
      return json(res, 200, { ok:true, vehicleCategories:cfg.vehicleCategories });
    }

    if (body.action === 'adminSetCarActive') {
      const car = cfg.cars.find((c) => c.id === body.carId);
      if (!car) return json(res, 404, { error: 'CAR' });
      car.active = !!body.active; car.updatedAt = new Date().toISOString(); touchCar(car, currentUser, car.updatedAt);
      await writeConfig(cfg);
      await appendAudit(currentUser, car.active ? 'car_restore' : 'car_archive', `${car.active ? 'Obnoveno' : 'Archivováno'} auto ${car.plate}`, { carId: car.id });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminBulkCars') {
      const ids = Array.isArray(body.carIds) ? body.carIds.slice(0, 500) : [];
      const active = !!body.active;
      let n = 0;
      for (const car of cfg.cars) if (ids.includes(car.id)) { car.active = active; car.updatedAt = new Date().toISOString(); touchCar(car, currentUser, car.updatedAt); n++; }
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
        const plate = cleanPlate(row?.plate), name = cleanText(row?.name, 80), vin = cleanVin(row?.vin);
        const requestedCategory = cleanVehicleCategory(row?.category);
        const category = requestedCategory && cfg.vehicleCategories.includes(requestedCategory) ? requestedCategory : '';
        if (!plate || existing.has(plate)) { skipped++; continue; }
        cfg.cars.push({ id: uid('c'), plate, name, vin, category, active: true, createdAt: now, updatedAt: now, lastModifiedAt: now, lastModifiedBy: currentUser.name, lastModifiedById: currentUser.id });
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
      touchCar(car, currentUser);
      await writeConfig(cfg);
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
      touchCar(car, currentUser);
      await writeConfig(cfg);
      await appendAudit(currentUser, 'record_delete', `Smazán záznam ${car?.plate || ''} ${r ? `DOT ${r.dot} · ${r.mileage} km` : ''}`.trim(), r || { path });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminAddUser') {
      const name = cleanText(body.name, 40), pin = String(body.pin || '');
      if (!name) return json(res, 400, { error: 'NAME' });
      if (!/^\d{4}$/.test(pin)) return json(res, 400, { error: 'PIN' });
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
      if (body.pin !== undefined && body.pin !== '') return json(res,400,{error:'PIN_SELF_SERVICE',message:'PIN uživatele mění pouze uživatel přes výzvu ke změně PINu.'});
      if (target.role !== 'admin') {
        if (NON_ADMIN_ROLES.includes(body.role)) target.role = body.role;
        if (body.permissions && typeof body.permissions === 'object') {
          target.permissions = {};
          for (const k of PERMISSION_KEYS) if (typeof body.permissions[k] === 'boolean') target.permissions[k] = body.permissions[k];
        }
        if (typeof body.active === 'boolean') target.active = body.active;
      }
      await writeConfig(cfg);
      await appendAudit(currentUser, 'user_edit', `Upraven uživatel ${target.name}`, { userId: target.id, before, after: { name: target.name, active: target.active, role: target.role, permissions: effectivePermissions(target) } });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminRequestPinReset') {
      const target=cfg.users.find((x)=>x.id===body.userId);
      if(!target)return json(res,404,{error:'USER'});
      if(target.role==='admin')return json(res,403,{error:'ADMIN_PIN_RESET',message:'Povinnou změnu PINu nelze tímto způsobem nastavit Admin účtu.'});
      if(target.active===false)return json(res,409,{error:'USER_BLOCKED',message:'Nejdřív účet aktivuj, aby se uživatel mohl přihlásit a změnu dokončit.'});
      const requireOldPin=body.requireOldPin!==false,now=new Date().toISOString();
      const wasLocked=!!target.loginLockedAt;
      target.pinChangeRequired={required:true,requireOldPin,requestedAt:now,requestedBy:currentUser.name,requestedById:currentUser.id};
      target.failedPinAttempts=0;
      target.lastFailedPinAt=null;
      target.loginLockedAt=null;
      await writeConfig(cfg);
      const push=await sendPushToUsers(cfg,[target.id],{title:'🔐 Nutná změna PINu',body:'Při příštím přihlášení bude nutné nastavit nový PIN.',tag:'pin-reset-'+target.id,url:'/'});
      await appendAudit(currentUser,'user_pin_reset_request',`Vyžádána změna PINu pro ${target.name}`,{userId:target.id,requireOldPin,unlockedAfterFailedAttempts:wasLocked,...push});
      return json(res,200,{ok:true,requireOldPin,...push});
    }

    if (body.action === 'adminGeneratePin') {
      return json(res,410,{error:'PIN_SELF_SERVICE',message:'Generování PINu administrátorem bylo nahrazeno výzvou k vlastní změně PINu.'});
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
      const title=cleanText(body.title,80),message=cleanText(body.message,500),recipient=String(body.recipient||'all');
      const severity=['info','important','critical'].includes(body.severity)?body.severity:'info';
      const requiresAck=severity==='critical'?true:!!body.requiresAck;
      const expiresAt=body.expiresAt?normalizeNotificationExpiry(body.expiresAt):null;
      if(!title||!message)return json(res,400,{error:'MESSAGE'});
      if(body.expiresAt&&!expiresAt)return json(res,400,{error:'MESSAGE',message:'Platnost oznámení musí být v budoucnu.'});
      let users=cfg.users.filter((u)=>u.active&&(severity!=='info'||(hasPermission(u,'notificationsReceive')&&userAllowsNotification(u,'admin',severity))));
      if(recipient!=='all')users=users.filter((u)=>u.id===recipient);
      if(!users.length)return json(res,404,{error:'USER',message:'Žádný příjemce pro toto oznámení.'});
      const carId=body.carId?String(body.carId):null,car=carId?cfg.cars.find((c)=>c.id===carId):null;
      if(carId&&!car)return json(res,404,{error:'CAR'});
      const n=await createNotification({type:'admin_manual',channel:'admin',severity,requiresAck,expiresAt,title,body:message,recipient,recipientUserIds:users.map((u)=>u.id),carId:car?.id||null,carPlate:car?.plate||'',byUserId:currentUser.id,byUserName:currentUser.name});
      const icon=severity==='critical'?'🚨 ':severity==='important'?'⚠️ ':'🛡️ ';
      const result=await sendPushToUsers(cfg,users.map((u)=>u.id),{title:icon+title,body:message,tag:'notification-'+n.id,url:'/?module=notifications&notification='+encodeURIComponent(n.id)});
      await patchNotification(n.id,result);
      await appendAudit(currentUser,'admin_notification_send','Odesláno Admin oznámení „'+title+'“ ('+result.sent+'/'+(result.devices||0)+')',{notificationId:n.id,recipient,severity,requiresAck,expiresAt,carId:car?.id||null,...result});
      return json(res,200,{ok:true,notificationId:n.id,...result});
    }

    if (body.action === 'adminBackup') {
      const [recs, audit, notifications] = await Promise.all([getRecords(), getAudit(), getNotificationLog()]);
      const safeUsers = cfg.users.map(({ pinHash, ...u }) => u);
      return json(res, 200, { version: 7, exportedAt: new Date().toISOString(), users: safeUsers, cars: cfg.cars, vehicleCategories: cfg.vehicleCategories, records: enrichRecords(cfg, recs), audit, notifications, notificationSettings: cfg.notificationSettings, system: systemState(cfg), transport: cfg.transport, modules: normalizeModules(cfg.modules) });
    }

    return json(res, 400, { error: 'ACTION' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'SERVER' });
  }
}
