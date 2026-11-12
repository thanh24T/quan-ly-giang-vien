import { createHash, randomBytes } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import { ObjectId } from 'mongodb';
import { database, lecturerSchema } from './db.js';

import { bootstrapAdmin, prepareAccounts, verifyPassword } from './accounts.js';

const { client, db, lecturers, accounts } = database();
await client.connect();
if (await db.listCollections({ name: 'GiangVien' }).hasNext()) {
  await db.command({ collMod: 'GiangVien', validator: lecturerSchema });
} else {
  await db.createCollection('GiangVien', { validator: lecturerSchema });
}

await lecturers.createIndex({ IDGV: 1 }, { unique: true });
await prepareAccounts(db, accounts);
await bootstrapAdmin(accounts);

const app = express();
const sessions = new Map();
const downloadTickets = new Map();
const downloadTicketDuration = 90_000;
const maxCsvBytes = 1024 * 1024;
const sessionDuration = 8 * 60 * 60 * 1000;
const pruneSessions = setInterval(() => {
  for (const [token, session] of sessions) {
    if (session.expiresAt <= Date.now()) sessions.delete(token);
  }
  for (const [ticket, entry] of downloadTickets) {
    if (entry.expiresAt <= Date.now() || !sessions.has(entry.token)) downloadTickets.delete(ticket);
  }
}, 60_000);
pruneSessions.unref();

app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://localhost:8081' }));
const standardJson = express.json({ limit: '2mb' });
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/lecturers/import') return next();
  return standardJson(req, res, next);
});

app.get('/api/health', async (_req, res) => {
  await db.command({ ping: 1 });
  res.json({ database: 'MongoDB', status: 'ok' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  const Username = typeof username === 'string' ? username.trim() : '';
  if (!Username || Username.length > 120 || typeof password !== 'string' ||
      !password || password.length > 1024) {
    return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
  }

  const account = await accounts.findOne({ Username, IsActive: true });

  if (!await verifyPassword(password, account?.PasswordHash)) {
    return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
  }

  const token = randomBytes(32).toString('hex');
  sessions.set(token, {
    accountId: account._id,
    passwordHash: account.PasswordHash,
    expiresAt: Date.now() + sessionDuration,
  });
  res.json({ token });
});

async function isActiveSession(token) {
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(token);
    return false;
  }

  const account = await accounts.findOne(
    { _id: session.accountId, PasswordHash: session.passwordHash, IsActive: true },
    { projection: { _id: 1 } },
  );
  if (!account) sessions.delete(token);
  return !!account;
}

// A short-lived ticket lets the Android browser download without an Authorization header.
app.get('/api/exports/:format/:ticket', async (req, res) => {
  const entry = downloadTickets.get(req.params.ticket);
  if (!entry || entry.format !== req.params.format || entry.expiresAt <= Date.now() ||
      !await isActiveSession(entry.token)) {
    return res.status(404).type('text').send('Liên kết đã hết hạn. Hãy tải lại tệp từ ứng dụng.');
  }
  const isJson = entry.format === 'json';
  const filename = isJson ? 'GiangVien.json' : 'TongHopGiangVien.csv';
  res.set({
    'Cache-Control': 'no-store',
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="' + filename + '"',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (req.method === 'HEAD') return res.end();
  if (!isJson) return res.send(entry.content);

  const rows = await lecturers.find({}, {
    projection: { _id: 0, IDGV: 1, Fullname: 1, Image: 1, SumClass: 1 },
  }).sort({ _id: -1 }).toArray();
  res.send(JSON.stringify(rows, null, 2) + '\n');
});

app.use('/api', async (req, res, next) => {
  const token = req.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!await isActiveSession(token)) {
    return res.status(401).json({ message: 'Vui lòng đăng nhập lại.' });
  }
  req.token = token;
  next();
});

function issueDownload(req, res, format, content) {
  for (const [ticket, entry] of downloadTickets) {
    if ((entry.token === req.token && entry.format === format) || entry.expiresAt <= Date.now()) {
      downloadTickets.delete(ticket);
    }
  }
  if (downloadTickets.size >= 64) {
    return res.status(503).json({ message: 'Chức năng tải tệp đang bận. Vui lòng thử lại.' });
  }

  const ticket = randomBytes(32).toString('hex');
  downloadTickets.set(ticket, { token: req.token, format, content, expiresAt: Date.now() + downloadTicketDuration });
  return res.set('Cache-Control', 'no-store').status(201).json({ path: '/api/exports/' + format + '/' + ticket });
}

app.post('/api/exports/csv', (req, res) => {
  const { content } = req.body ?? {};
  if (typeof content !== 'string' || !content.startsWith('\uFEFF') ||
      Buffer.byteLength(content, 'utf8') > maxCsvBytes) {
    return res.status(400).json({ message: 'Nội dung CSV không hợp lệ hoặc vượt quá 1 MB.' });
  }
  return issueDownload(req, res, 'csv', content);
});

app.post('/api/exports/json', (req, res) => issueDownload(req, res, 'json'));

app.post('/api/logout', (req, res) => {
  sessions.delete(req.token);
  res.sendStatus(204);
});

function validateLecturer(body) {
  const { IDGV, Fullname, Image, SumClass } = body ?? {};
  const code = typeof IDGV === 'string' ? IDGV.trim().toUpperCase() : '';
  if (!/^[A-Z0-9_-]{1,32}$/.test(code) ||
      typeof Fullname !== 'string' || !Fullname.trim() || Fullname.trim().length > 120 ||
      !Number.isSafeInteger(SumClass) || SumClass < 0 ||
      typeof Image !== 'string' || Image.length > 1500000 ||
      !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(Image) ||
      Object.keys(body).length !== 4) {
    return null;
  }
  return { IDGV: code, Fullname: Fullname.trim(), Image, SumClass };
}

app.param('id', (req, res, next, id) => {
  if (!/^[a-f0-9]{24}$/i.test(id)) {
    return res.status(400).json({ message: 'Mã giảng viên không hợp lệ.' });
  }
  req.lecturerId = new ObjectId(id);
  next();
});

app.get('/api/lecturers', async (_req, res) => {
  res.json(await lecturers.find().sort({ _id: -1 }).toArray());
});

function snapshot({ IDGV, Fullname, Image, SumClass }) {
  return { IDGV, Fullname, Image, SumClass };
}

function revision(lecturer) {
  return createHash('sha256').update(JSON.stringify(snapshot(lecturer))).digest('hex');
}

app.post('/api/lecturers/import', express.json({ limit: '34mb' }), async (req, res) => {
  const { rows, commit, updates = [] } = req.body ?? {};
  if (!Array.isArray(rows) || typeof commit !== 'boolean' || !Array.isArray(updates) ||
      updates.some(item => typeof item?.id !== 'string' || typeof item?.version !== 'string')) {
    return res.status(400).json({ message: 'Dữ liệu nhập JSON không hợp lệ.' });
  }

  const seen = new Map();
  const issues = [];
  let invalid = 0;
  let duplicates = 0;
  rows.forEach((row, index) => {
    const lecturer = validateLecturer(row);
    if (!lecturer) {
      invalid++;
      if (issues.length < 12) issues.push(index + 1);
    } else if (seen.has(lecturer.IDGV)) {
      duplicates++;
    } else {
      seen.set(lecturer.IDGV, lecturer);
    }
  });

  const existing = new Map();
  for await (const lecturer of lecturers.find()) {
    if (seen.has(lecturer.IDGV)) existing.set(lecturer.IDGV, lecturer);
  }

  const pending = [];
  const conflicts = [];
  const decisions = new Map(updates.map(item => [item.id, item.version]));
  const changes = [];
  for (const lecturer of seen.values()) {
    const current = existing.get(lecturer.IDGV);
    if (!current) {
      pending.push(lecturer);
      continue;
    }
    duplicates++;
    const version = revision(current);
    if (version === revision(lecturer)) continue;
    conflicts.push({
      id: lecturer.IDGV, version,
      before: { Fullname: current.Fullname, SumClass: current.SumClass },
      after: { Fullname: lecturer.Fullname, SumClass: lecturer.SumClass },
      imageChanged: current.Image !== lecturer.Image,
    });
    if (decisions.get(lecturer.IDGV) === version) changes.push({ current, lecturer });
  }

  if (commit && changes.length !== decisions.size) {
    return res.status(409).json({ message: 'Hồ sơ đã thay đổi kể từ lúc xem trước. Hãy chọn lại tệp để đối chiếu.' });
  }

  let inserted = 0;
  let updated = 0;
  if (commit && pending.length) {
    const result = await lecturers.bulkWrite(pending.map(lecturer => ({
      updateOne: { filter: { IDGV: lecturer.IDGV }, update: { $setOnInsert: lecturer }, upsert: true },
    })), { ordered: false });
    inserted = result.upsertedCount;
    duplicates += pending.length - inserted;
  }

  if (commit && changes.length) {
    const result = await lecturers.bulkWrite(changes.map(({ current, lecturer }) => ({
      updateOne: { filter: { _id: current._id, ...snapshot(current) }, update: { $set: lecturer } },
    })), { ordered: false });
    updated = result.modifiedCount;
  }

  res.json({
    total: rows.length, valid: pending.length, invalid, duplicates, inserted, updated,
    stale: commit ? changes.length - updated : 0, issues, conflicts,
  });
});

app.post('/api/lecturers', async (req, res) => {
  const lecturer = validateLecturer(req.body);
  if (!lecturer) return res.status(400).json({ message: 'Kiểm tra mã giảng viên, họ và tên, ảnh và tổng số lớp.' });
  const { insertedId } = await lecturers.insertOne(lecturer);
  res.status(201).json({ ...lecturer, _id: insertedId });
});

app.put('/api/lecturers/:id', async (req, res) => {
  const lecturer = validateLecturer(req.body);
  if (!lecturer) return res.status(400).json({ message: 'Kiểm tra mã giảng viên, họ và tên, ảnh và tổng số lớp.' });
  const result = await lecturers.replaceOne({ _id: req.lecturerId }, lecturer);
  if (!result.matchedCount) return res.status(404).json({ message: 'Giảng viên đã bị xóa.' });
  res.json({ ...lecturer, _id: req.lecturerId });
});

app.delete('/api/lecturers/:id', async (req, res) => {
  const result = await lecturers.deleteOne({ _id: req.lecturerId });
  if (!result.deletedCount) return res.status(404).json({ message: 'Giảng viên đã bị xóa.' });
  res.sendStatus(204);
});

app.use((error, _req, res, _next) => {
  if (error.code === 11000) return res.status(409).json({ message: 'Mã giảng viên đã tồn tại.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Dữ liệu gửi lên vượt giới hạn dung lượng.' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON không hợp lệ.' });
  console.error(error);
  res.status(500).json({ message: 'Máy chủ không thể xử lý yêu cầu.' });
});

const host = process.env.API_HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4000);
app.listen(port, host, () => console.log(`API http://${host}:${port} | MongoDB ${db.databaseName}.GiangVien`));
