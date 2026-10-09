import crypto from 'node:crypto';
import { get, put } from '@vercel/blob';
import webpush from 'web-push';
import { mutateBlobJsonArray } from './blob-json.js';

export const SCHEDULE_PATH = 'notification-schedules.json';
const ACTIVE = new Set(['scheduled', 'processing']);
export class NoticeError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const text = (value, max) => String(value || '').trim().slice(0, max);
const stamp = now => new Date(now).toISOString();
export async function readNoticeJson(path, fallback) {
  const result = await get(path, { access: 'private', useCache: false });
  return result?.statusCode === 200 ? JSON.parse(await new Response(result.stream).text()) : fallback;
}
export async function touchNoticeSync() {
  await put('sync-version.json', JSON.stringify({ version: crypto.randomUUID(), updatedAt: stamp(Date.now()) }), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
  });
}
export async function noticeAudit(actor, action, summary, details) {
  const row = { id: 'a' + crypto.randomUUID(), ts: Date.now(), createdAt: stamp(Date.now()),
    actorId: actor?.id || 'system', actorName: actor?.name || 'Systém', action, summary, details };
  await mutateBlobJsonArray('audit.json', rows => ({ rows: [row, ...rows].slice(0, 500), changed: true }));
}

// datetime-local has no timezone. Interpret it explicitly in Prague even when
// the browser or the server uses UTC. Validate DST gaps and calendar dates.
export function pragueLocalToIso(value) {
  const raw = String(value || '');
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(raw)) throw new NoticeError('NOTICE_TIME', 'Vyber platné datum a čas.');
  const base = Date.parse(raw + ':00Z');
  const format = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const local = ts => format.format(new Date(ts)).replace(' ', 'T');
  const candidates = [base - 7200000, base - 3600000].filter(ts => Number.isFinite(ts) && local(ts) === raw);
  if (!candidates.length) throw new NoticeError('NOTICE_TIME', 'Tento datum a čas v Praze neexistuje. Zkontroluj také změnu letního času.');
  // At the autumn change, the first occurrence is the daylight-saving time.
  return stamp(candidates[0]);
}
function parseTime(body, localKey, isoKey) {
  if (body[localKey]) return pragueLocalToIso(body[localKey]);
  if (!body[isoKey]) return null;
  const raw = String(body[isoKey]);
  const ts = /(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? Date.parse(raw) : NaN;
  if (!Number.isFinite(ts)) throw new NoticeError('NOTICE_TIME', 'Vyber platné datum a čas.');
  return stamp(ts);
}
export function canSendNotice(user, channel) {
  return !!user && user.active !== false && (channel === 'admin' ? user.role === 'admin' : user.role === 'admin' || user.permissions?.notificationsSendOperational === true);
}
export function canManageSchedule(row, user) {
  return user?.role === 'admin' || (row.byUserId === user?.id && canSendNotice(user, row.channel));
}
export function noticeRecipients(cfg, draft) {
  return (cfg.users || []).filter(user => {
    if (user.active === false || (draft.recipient !== 'all' && !draft.recipientUserIds.includes(user.id))) return false;
    if (draft.channel === 'admin' && draft.severity !== 'info') return true;
    if (user.role !== 'admin' && (user.role === 'test' ? user.permissions?.notificationsReceive !== true : user.permissions?.notificationsReceive === false)) return false;
    if (draft.severity === 'important') return true;
    return user.notificationPrefs?.[draft.channel === 'admin' ? 'adminInfo' : 'operational'] !== false;
  });
}
export function noticeDraft(cfg, actor, channel, body, { now = Date.now(), scheduled = false } = {}) {
  if (!canSendNotice(actor, channel)) throw new NoticeError('PERMISSION', 'Nemáš oprávnění odeslat toto oznámení.', 403);
  if (body.deliveryMode && !['now','scheduled'].includes(body.deliveryMode)) throw new NoticeError('NOTICE_TIME', 'Vyber způsob odeslání.');
  const title = text(body.title, 80), message = text(body.message, 500);
  if (!title || !message) throw new NoticeError('MESSAGE', 'Doplň nadpis a text oznámení.');
  const severities = channel === 'admin' ? ['info', 'important', 'critical'] : ['info', 'important'];
  const severity = severities.includes(body.severity) ? body.severity : 'info';
  let recipient = String(body.recipient || 'all'), recipientUserIds = [];
  if (recipient === 'selected' || recipient === 'users') {
    if (!Array.isArray(body.recipientUserIds) || body.recipientUserIds.length > 200) throw new NoticeError('USER', 'Vyber příjemce oznámení.');
    recipientUserIds = [...new Set(body.recipientUserIds.map(String).filter(Boolean))];
    recipient = 'selected';
  } else if (recipient !== 'all') {
    // Older clients can still send to one user by ID.
    recipientUserIds = [recipient]; recipient = 'selected';
  }
  if (recipient !== 'all' && (!recipientUserIds.length || recipientUserIds.some(id => !(cfg.users || []).some(u => u.id === id && u.active !== false)))) {
    throw new NoticeError('USER', 'Vyber alespoň jednoho aktivního příjemce.');
  }
  const scheduledAt = scheduled ? parseTime(body, 'scheduledLocal', 'scheduledAt') : null;
  if (scheduled && (!scheduledAt || Date.parse(scheduledAt) <= now)) throw new NoticeError('NOTICE_TIME', 'Čas odeslání musí být v budoucnu.');
  const expiresAt = parseTime(body, 'expiresLocal', 'expiresAt');
  if (expiresAt && Date.parse(expiresAt) <= (scheduledAt ? Date.parse(scheduledAt) : now)) throw new NoticeError('NOTICE_EXPIRY', 'Platnost oznámení musí končit až po jeho odeslání.');
  const carId = channel === 'admin' && body.carId ? String(body.carId) : null;
  const car = carId ? (cfg.cars || []).find(c => c.id === carId && c.active !== false) : null;
  if (carId && !car) throw new NoticeError('CAR', 'Vybrané vozidlo není aktivní.', 404);
  const draft = { channel, type: channel === 'admin' ? 'admin_manual' : 'operational_manual', title, body: message,
    recipient, recipientUserIds, severity, requiresAck: severity === 'critical' || !!body.requiresAck,
    scheduledAt, expiresAt, carId, carPlate: car?.plate || '', timeZone: 'Europe/Prague' };
  if (!noticeRecipients(cfg, draft).length) throw new NoticeError('USER', 'Žádný z příjemců nemá toto oznámení povolené.', 404);
  return draft;
}
export async function scheduledNoticeData(cfg, user) {
  const rows = await readNoticeJson(SCHEDULE_PATH, []);
  const users = new Map((cfg.users || []).map(u => [u.id, u]));
  return rows.filter(row => canManageSchedule(row, user)).sort((a, b) => {
    const active = Number(ACTIVE.has(b.status)) - Number(ACTIVE.has(a.status));
    return active || (ACTIVE.has(a.status) ? Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) : Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }).slice(0, 500).map(row => {
    const { claimId, leaseUntil, requestId, requestSignature, ...safe } = row;
    return { ...safe, recipients: (row.recipientUserIds || []).map(id => ({ id, name: users.get(id)?.name || 'Neaktivní uživatel', active: users.get(id)?.active !== false && users.has(id) })),
      editable: row.status === 'scheduled' && Date.parse(row.scheduledAt) > Date.now() };
  });
}
function trimSchedules(rows) {
  return [...rows.filter(row => ACTIVE.has(row.status)), ...rows.filter(row => !ACTIVE.has(row.status)).slice(0, 200)];
}
export async function createSchedule(cfg, actor, channel, body) {
  const draft = noticeDraft(cfg, actor, channel, body, { scheduled: true });
  const requestId = text(body.requestId, 120), requestSignature = JSON.stringify(draft);
  const now = stamp(Date.now());
  const row = { ...draft, id: 'ns' + crypto.randomUUID(), status: 'scheduled', version: 1, createdAt: now, updatedAt: now,
    byUserId: actor.id, byUserName: actor.name, byUserRole: actor.role, requestId, requestSignature };
  const out = await mutateBlobJsonArray(SCHEDULE_PATH, rows => {
    const existing = requestId && rows.find(n => n.byUserId === actor.id && n.requestId === requestId);
    if (existing) {
      if (existing.requestSignature !== requestSignature) throw new NoticeError('NOTICE_CONFLICT', 'Tento požadavek byl už použit. Obnov formulář.', 409);
      return { rows, changed: false, row: existing };
    }
    if (rows.filter(n => ACTIVE.has(n.status)).length >= 500) throw new NoticeError('NOTICE_LIMIT', 'Je naplánováno příliš mnoho oznámení. Nejdřív některá zruš.', 409);
    return { rows: trimSchedules([row, ...rows]), changed: true, row };
  });
  if (out.changed) {
    await touchNoticeSync();
    await noticeAudit(actor, 'notification_schedule_create', 'Naplánováno oznámení „' + draft.title + '“', { scheduleId: row.id, scheduledAt: row.scheduledAt, recipient: row.recipient, recipientUserIds: row.recipientUserIds, channel });
  }
  return out.row;
}
export async function changeSchedule(cfg, actor, body, cancel = false) {
  const out = await mutateBlobJsonArray(SCHEDULE_PATH, rows => {
    const row = rows.find(n => n.id === String(body.scheduleId || ''));
    if (!row) throw new NoticeError('NOTICE_NOT_FOUND', 'Plánované oznámení nebylo nalezeno.', 404);
    if (!canManageSchedule(row, actor)) throw new NoticeError('PERMISSION', 'Toto oznámení nemůžeš upravit.', 403);
    if (row.status !== 'scheduled' || Date.parse(row.scheduledAt) <= Date.now() || Number(body.version) !== row.version) throw new NoticeError('NOTICE_CONFLICT', 'Oznámení se změnilo nebo už začalo odesílání. Obnov přehled.', 409);
    if (cancel) { row.status = 'cancelled'; row.cancelledAt = stamp(Date.now()); }
    else {
      const draft = noticeDraft(cfg, actor, row.channel, body, { scheduled: true });
      Object.assign(row, draft);
      // The last editor is accountable for the eventual delivery permission.
      row.byUserId = actor.id; row.byUserName = actor.name; row.byUserRole = actor.role;
    }
    row.updatedAt = stamp(Date.now()); row.updatedBy = actor.name; row.version++;
    return { rows, changed: true, row: { ...row } };
  });
  await touchNoticeSync();
  await noticeAudit(actor, cancel ? 'notification_schedule_cancel' : 'notification_schedule_edit', (cancel ? 'Zrušeno' : 'Upraveno') + ' plánované oznámení „' + out.row.title + '“', { scheduleId: out.row.id, scheduledAt: out.row.scheduledAt });
  return out.row;
}

async function pushNotice(ids, row) {
  const publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return { sent: 0, failed: 0, devices: 0, reason: 'PUSH_NOT_CONFIGURED' };
  webpush.setVapidDetails('https://dotbase-shared.vercel.app', publicKey, privateKey);
  const targets = (await readNoticeJson('push.json', [])).filter(p => ids.includes(p.userId));
  const priority = row.severity === 'critical' ? ' · KRITICKÉ' : row.severity === 'important' ? ' · DŮLEŽITÉ' : '';
  const roles = { dispatch: 'DISPATCH', technician: 'TECHNIK', driver: 'DRIVER', test: 'TEST' };
  const label = row.channel === 'admin' ? '🚨 ADMIN' : '🔵 ' + (roles[row.byUserRole] || 'PROVOZ');
  const payload = { title: label + priority + ' · ' + row.title, body: row.body, tag: 'notification-' + row.id, url: '/?module=notifications&notification=' + encodeURIComponent(row.id) };
  const ttl = row.expiresAt ? Math.max(0, Math.min(86400, Math.floor((Date.parse(row.expiresAt) - Date.now()) / 1000))) : 86400;
  let sent = 0, failed = 0; const dead = new Set();
  for (const target of targets) {
    try { await webpush.sendNotification(target.subscription, JSON.stringify(payload), { TTL: ttl, timeout: 5000 }); sent++; }
    catch (error) { failed++; if ([404, 410].includes(error?.statusCode)) dead.add(target.id); else console.error('notice push failed', error?.statusCode || 'network'); }
  }
  if (dead.size) await mutateBlobJsonArray('push.json', rows => ({ rows: rows.filter(p => !dead.has(p.id)), changed: rows.some(p => dead.has(p.id)) }));
  return { sent, failed, devices: targets.length };
}
export async function deliverNotice(cfg, actor, draft, { id = 'n' + crypto.randomUUID(), scheduledId = null, push = pushNotice } = {}) {
  const users = noticeRecipients(cfg, draft);
  if (!users.length) throw new NoticeError('USER', 'Žádný aktivní příjemce nemá oznámení povolené.', 404);
  const now = Date.now();
  const fields = Object.fromEntries(['channel','type','title','body','recipient','severity','requiresAck','scheduledAt','expiresAt','carId','carPlate','timeZone'].map(key => [key, draft[key]]));
  const notice = { ...fields, id, ts: now, createdAt: stamp(now), scheduledId,
    recipientUserIds: users.map(u => u.id), byUserId: actor.id, byUserName: actor.name, byUserRole: actor.role, acks: [], seen: [] };
  const added = await mutateBlobJsonArray('notifications.json', rows => {
    const existing = rows.find(n => n.id === id);
    return existing ? { rows, changed: false, notice: existing } : { rows: [notice, ...rows].slice(0, 500), changed: true, notice };
  });
  if (added.changed) await touchNoticeSync();
  const saved = added.notice;
  // Retrying a finished run must not create another inbox row or push.
  if (saved.pushFinishedAt) return { notificationId: id, recipientCount: saved.recipientUserIds.length, sent: saved.sent || 0, failed: saved.failed || 0, devices: saved.devices || 0 };
  const eligible = new Set(users.map(u=>u.id));
  const result = await push(saved.recipientUserIds.filter(id=>eligible.has(id)), saved);
  await mutateBlobJsonArray('notifications.json', rows => {
    const n = rows.find(n => n.id === id);
    if (n) Object.assign(n, result, { pushFinishedAt: stamp(Date.now()) });
    return { rows, changed: !!n };
  });
  return { notificationId: id, recipientCount: saved.recipientUserIds.length, ...result };
}

function senderBlocked(cfg, actor, row) {
  if (!canSendNotice(actor, row.channel)) return 'Odesílatel už nemá potřebné oprávnění nebo je neaktivní.';
  if (actor.role === 'admin') return '';
  const module = cfg.modules?.notifications || {};
  if ((actor.role === 'test' || module.visible === false) && !module.allowedUserIds?.includes(actor.id)) return 'Odesílatel už nemá přístup k modulu OZNÁMENÍ.';
  if (cfg.system?.mode === 'read_only') return 'Odesílatel nemůže zapisovat v režimu pouze pro čtení.';
  if (cfg.system?.mode === 'hibernation' && !cfg.system.hibernationAllowedUserIds?.includes(actor.id)) return 'Odesílatel nemá přístup během sezónního spánku.';
  return '';
}
export async function processScheduledNotices({ now = Date.now(), push, limit = 20 } = {}) {
  const pending = await readNoticeJson(SCHEDULE_PATH, []);
  const due = pending.filter(row => (row.status === 'scheduled' && Date.parse(row.scheduledAt) <= now) || (row.status === 'processing' && Date.parse(row.leaseUntil) <= now))
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)).slice(0, limit);
  if (!due.length) return { ok: true, processed: 0, sent: 0, failed: 0 };
  const cfg = await readNoticeJson('config.json', {});
  if (cfg.system?.mode === 'maintenance' || cfg.modules?.notifications?.online === false) return { ok: true, processed: 0, skipped: 'paused' };
  let sent = 0, failed = 0, processed = 0;
  for (const candidate of due) {
    const claimId = crypto.randomUUID();
    const claim = await mutateBlobJsonArray(SCHEDULE_PATH, rows => {
      const row = rows.find(n => n.id === candidate.id);
      if (!row || !((row.status === 'scheduled' && Date.parse(row.scheduledAt) <= now) || (row.status === 'processing' && Date.parse(row.leaseUntil) <= now))) return { rows, changed: false };
      row.status = 'processing'; row.claimId = claimId; row.leaseUntil = stamp(now + 300000); row.version++; row.updatedAt = stamp(now);
      return { rows, changed: true, row: { ...row } };
    });
    if (!claim.row) continue;
    const row = claim.row, actor = (cfg.users || []).find(u => u.id === row.byUserId);
    let result, error = senderBlocked(cfg, actor, row);
    if (!error && row.expiresAt && Date.parse(row.expiresAt) <= now) error = 'Platnost oznámení skončila před odesláním.';
    if (!error && row.carId && !(cfg.cars || []).some(c => c.id === row.carId && c.active !== false)) error = 'Vozidlo už není aktivní.';
    if (!error) {
      try { result = await deliverNotice(cfg, actor, row, { id: 'scheduled-' + row.id, scheduledId: row.id, ...(push ? { push } : {}) }); }
      catch (err) {
        if (err instanceof NoticeError) error = err.message;
        else {
          // Leave a recoverable lease after storage/runtime failures. A later
          // cron retries the same deterministic notification ID.
          console.error('scheduled notice transient failure', row.id, err?.name || 'Error');
          continue;
        }
      }
    }
    await mutateBlobJsonArray(SCHEDULE_PATH, rows => {
      const n = rows.find(n => n.id === row.id);
      if (!n || n.claimId !== claimId) return { rows, changed: false };
      Object.assign(n, { status: error ? 'failed' : 'sent', error: error || '', updatedAt: stamp(Date.now()), ...(result || {}), ...(error ? {} : { sentAt: stamp(Date.now()) }) });
      delete n.claimId; delete n.leaseUntil; n.version++;
      return { rows: trimSchedules(rows), changed: true };
    });
    await touchNoticeSync(); processed++; if (error) failed++; else sent++;
    await noticeAudit(actor, error ? 'notification_schedule_failed' : 'notification_schedule_sent', (error ? 'Neodesláno' : 'Odesláno') + ' plánované oznámení „' + row.title + '“', { scheduleId: row.id, error: error || null, ...(result || {}) });
  }
  return { ok: true, processed, sent, failed };
}
