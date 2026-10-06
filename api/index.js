import { put, get, list, del } from '@vercel/blob';
import crypto from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || 'missing-secret';
const attempts = globalThis.__dotAttempts || (globalThis.__dotAttempts = new Map());

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function pinHash(pin) {
  return crypto.createHmac('sha256', SECRET).update(String(pin)).digest('hex');
}
function safeEqualHex(a, b) {
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
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
  } catch {
    return null;
  }
}
function auth(req) {
  const h = String(req.headers.authorization || '');
  return verify(h.startsWith('Bearer ') ? h.slice(7) : '');
}
function ip(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}
async function writeConfig(cfg) {
  await put('config.json', JSON.stringify(cfg), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}
async function readConfig() {
  const r = await get('config.json', { access: 'private', useCache: false });
  if (r?.statusCode === 200) {
    const text = await new Response(r.stream).text();
    return JSON.parse(text);
  }
  const cfg = {
    version: 1,
    users: [
      { id: 'u1', name: 'Admin', role: 'admin', pinHash: pinHash('11'), active: true },
      { id: 'u2', name: 'Pracovník 1', role: 'user', pinHash: pinHash('22'), active: true },
      { id: 'u3', name: 'Pracovník 2', role: 'user', pinHash: pinHash('33'), active: true },
      { id: 'u4', name: 'Pracovník 3', role: 'user', pinHash: pinHash('44'), active: true },
    ],
    cars: [],
  };
  await writeConfig(cfg);
  return cfg;
}
async function getRecords() {
  let blobs = [];
  let cursor;
  do {
    const r = await list({ prefix: 'records/', limit: 1000, cursor });
    blobs.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor && blobs.length < 5000);

  return blobs
    .map((b) => {
      const file = b.pathname.split('/').pop().replace(/\.rec$/, '');
      const p = file.split('_');
      if (p.length < 7) return null;
      const [ts, id, carId, season, dot, mileage, userId] = p;
      const n = Number(ts);
      if (!Number.isFinite(n)) return null;
      return {
        path: b.pathname,
        ts: n,
        id,
        carId,
        season,
        dot,
        mileage: Number(mileage),
        userId,
        createdAt: new Date(n).toISOString(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts);
}
function publicState(cfg, recs, session) {
  const users = cfg.users.map((u) => ({ id: u.id, name: u.name, role: u.role, active: u.active }));
  const cars = cfg.cars.filter((c) => c.active !== false);
  const byUser = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const byCar = Object.fromEntries(cfg.cars.map((c) => [c.id, c]));
  const records = recs.map((r) => ({
    ...r,
    userName: byUser[r.userId] || 'Neznámý',
    plate: byCar[r.carId]?.plate || 'Archiv',
    vehicle: byCar[r.carId]?.name || '',
  }));
  return {
    me: users.find((u) => u.id === session.uid),
    users: session.role === 'admin' ? users : undefined,
    cars,
    records,
  };
}
function cleanPlate(v) {
  return String(v || '').toUpperCase().replace(/\s+/g, '').trim().slice(0, 16);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body ||= {};

  try {
    if (body.action === 'login') {
      const key = ip(req);
      const a = attempts.get(key) || { n: 0, blocked: 0 };
      if (a.blocked > Date.now()) {
        return json(res, 429, { error: 'LOCKED', seconds: Math.ceil((a.blocked - Date.now()) / 1000) });
      }
      const pin = String(body.pin || '');
      if (!/^\d{2}$/.test(pin)) return json(res, 400, { error: 'PIN' });
      const cfg = await readConfig();
      const h = pinHash(pin);
      const u = cfg.users.find((x) => x.active && safeEqualHex(x.pinHash, h));
      if (!u) {
        a.n += 1;
        if (a.n >= 5) {
          a.blocked = Date.now() + 10 * 60 * 1000;
          a.n = 0;
        }
        attempts.set(key, a);
        await new Promise((r) => setTimeout(r, 450));
        return json(res, 401, { error: 'BAD_PIN' });
      }
      attempts.delete(key);
      const token = sign({ uid: u.id, role: u.role, exp: Date.now() + 12 * 60 * 60 * 1000 });
      return json(res, 200, { token, user: { id: u.id, name: u.name, role: u.role } });
    }

    const session = auth(req);
    if (!session) return json(res, 401, { error: 'AUTH' });
    const cfg = await readConfig();
    const currentUser = cfg.users.find((x) => x.id === session.uid && x.active);
    if (!currentUser) return json(res, 401, { error: 'AUTH' });

    if (body.action === 'state') {
      return json(res, 200, publicState(cfg, await getRecords(), session));
    }

    if (body.action === 'addRecord') {
      const car = cfg.cars.find((c) => c.id === body.carId && c.active !== false);
      const season = String(body.season || '');
      const dot = String(body.dot || '');
      const mileage = Number(body.mileage);
      if (!car) return json(res, 400, { error: 'CAR' });
      if (!['summer', 'winter'].includes(season)) return json(res, 400, { error: 'SEASON' });
      if (!/^\d{4}$/.test(dot) || Number(dot.slice(0, 2)) < 1 || Number(dot.slice(0, 2)) > 53) {
        return json(res, 400, { error: 'DOT' });
      }
      if (!Number.isInteger(mileage) || mileage < 0 || mileage > 9_999_999) {
        return json(res, 400, { error: 'MILEAGE' });
      }
      const ts = Date.now();
      const id = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
      const path = `records/${[ts, id, car.id, season, dot, mileage, currentUser.id].join('_')}.rec`;
      await put(path, '', { access: 'private', addRandomSuffix: false, contentType: 'text/plain' });
      return json(res, 200, { ok: true });
    }

    if (session.role !== 'admin') return json(res, 403, { error: 'ADMIN' });

    if (body.action === 'adminAddCar') {
      const plate = cleanPlate(body.plate);
      const name = String(body.name || '').trim().slice(0, 80);
      if (!plate) return json(res, 400, { error: 'PLATE' });
      if (cfg.cars.some((c) => c.active !== false && c.plate === plate)) {
        return json(res, 409, { error: 'DUPLICATE' });
      }
      cfg.cars.push({
        id: `c${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
        plate,
        name,
        active: true,
      });
      await writeConfig(cfg);
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminArchiveCar') {
      const c = cfg.cars.find((x) => x.id === body.carId);
      if (!c) return json(res, 404, { error: 'CAR' });
      c.active = false;
      await writeConfig(cfg);
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminDeleteRecord') {
      const path = String(body.path || '');
      if (!path.startsWith('records/')) return json(res, 400, { error: 'PATH' });
      await del(path);
      return json(res, 200, { ok: true });
    }

    if (body.action === 'adminUpdateUser') {
      const target = cfg.users.find((x) => x.id === body.userId);
      if (!target) return json(res, 404, { error: 'USER' });
      const name = String(body.name || '').trim().slice(0, 40);
      if (name) target.name = name;
      if (body.pin !== undefined && body.pin !== '') {
        const p = String(body.pin);
        if (!/^\d{2}$/.test(p)) return json(res, 400, { error: 'PIN' });
        const h = pinHash(p);
        if (cfg.users.some((x) => x.id !== target.id && x.active && safeEqualHex(x.pinHash, h))) {
          return json(res, 409, { error: 'PIN_USED' });
        }
        target.pinHash = h;
      }
      if (typeof body.active === 'boolean' && target.role !== 'admin') target.active = body.active;
      await writeConfig(cfg);
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'ACTION' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: 'SERVER' });
  }
}
