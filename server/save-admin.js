import { database } from './db.js';
import { hashPassword, prepareAccounts, readAdminConfig } from './accounts.js';

const { Username, password } = readAdminConfig();
const { client, db, accounts } = database();
try {
  await client.connect();
  await prepareAccounts(db, accounts);
  const PasswordHash = await hashPassword(password);
  await accounts.updateOne(
    { Username },
    { $set: { PasswordHash }, $setOnInsert: { Username, IsActive: true } },
    { upsert: true },
  );
  console.log('Đã lưu tài khoản quản trị vào MongoDB.');
} finally {
  await client.close();
}
