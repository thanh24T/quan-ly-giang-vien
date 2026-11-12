import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
const hashPattern = /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/;
const dummyHash = 'scrypt:' + '0'.repeat(32) + ':' + '0'.repeat(128);
const validator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['Username', 'PasswordHash', 'IsActive'],
    additionalProperties: false,
    properties: {
      _id: { bsonType: 'objectId' },
      Username: { bsonType: 'string', minLength: 1, maxLength: 120 },
      PasswordHash: { bsonType: 'string', pattern: hashPattern.source },
      IsActive: { bsonType: 'bool' },
    },
  },
};

export async function prepareAccounts(db, accounts) {
  if (await db.listCollections({ name: accounts.collectionName }).hasNext()) {
    await db.command({ collMod: accounts.collectionName, validator });
  } else {
    try {
      await db.createCollection(accounts.collectionName, { validator });
    } catch (error) {
      if (error.code !== 48) throw error;
      await db.command({ collMod: accounts.collectionName, validator });
    }
  }
  await accounts.createIndex({ Username: 1 }, { unique: true });
}

export function readAdminConfig() {
  const Username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!Username || Username.length > 120 || !password || password.length > 1024 ||
      password === 'replace-with-a-long-password') {
    throw new Error('Đặt ADMIN_USERNAME và ADMIN_PASSWORD hợp lệ trong server/.env.');
  }
  return { Username, password };
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, 64);
  return 'scrypt:' + salt.toString('hex') + ':' + key.toString('hex');
}

export async function verifyPassword(password, storedHash) {
  const validHash = typeof storedHash === 'string' && hashPattern.test(storedHash);
  const [, salt, key] = (validHash ? storedHash : dummyHash).split(':');
  const candidate = await deriveKey(password, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(candidate, Buffer.from(key, 'hex')) && validHash;
}

export async function bootstrapAdmin(accounts) {
  if (await accounts.estimatedDocumentCount()) return;
  const { Username, password } = readAdminConfig();
  const PasswordHash = await hashPassword(password);
  await accounts.updateOne(
    { Username },
    { $setOnInsert: { Username, PasswordHash, IsActive: true } },
    { upsert: true },
  );
}
