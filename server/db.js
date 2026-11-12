import { MongoClient } from 'mongodb';

export function database() {
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017', {
    serverSelectionTimeoutMS: 5000,
  });
  const db = client.db(process.env.MONGODB_DATABASE || 'QLHocPhan');
  return { client, db, lecturers: db.collection('GiangVien'), accounts: db.collection('TaiKhoan') };
}

export const lecturerSchema = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['IDGV', 'Fullname', 'Image', 'SumClass'],
    additionalProperties: false,
    properties: {
      _id: { bsonType: 'objectId' },
      IDGV: { bsonType: 'string', pattern: '^[A-Z0-9_-]{1,32}$' },
      Fullname: { bsonType: 'string', minLength: 1, maxLength: 120 },
      Image: { bsonType: 'string', minLength: 1, maxLength: 1500000 },
      SumClass: { bsonType: ['int', 'long', 'double'], minimum: 0, multipleOf: 1 },
    },
  },
};
