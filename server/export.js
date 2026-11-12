import { writeFile } from 'node:fs/promises';
import { database } from './db.js';

const { client, lecturers } = database();
try {
  const rows = await lecturers.find({}, {
    projection: { _id: 0, IDGV: 1, Fullname: 1, Image: 1, SumClass: 1 },
  }).sort({ _id: 1 }).toArray();
  const destination = new URL('../GiangVien.json', import.meta.url);
  await writeFile(destination, JSON.stringify(rows, null, 2) + '\n', 'utf8');
  console.log(`Đã xuất ${rows.length} giảng viên từ MongoDB vào GiangVien.json.`);
} finally {
  await client.close();
}
