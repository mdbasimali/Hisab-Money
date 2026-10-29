import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { Customer, DueTransaction, Payment, User } from '../src/models/index.js';

async function verifyMongoDB() {
  console.log('Connecting to MongoDB Atlas with configured MONGODB_URI...');
  const conn = await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB:', conn.connection.name);

  const users = await User.find().lean();
  console.log('Users in Atlas:', users.length);
  users.forEach((u) => console.log(`  - User: ${u.name} (devIdentifier: ${u.devIdentifier}, _id: ${u._id})`));

  const customers = await Customer.find().lean();
  console.log('Customers in Atlas:', customers.length);
  customers.forEach((c) => console.log(`  - Customer: ${c.name} (localId: ${c.localId}, openingBalancePaise: ${c.openingBalancePaise}, _id: ${c._id})`));

  await mongoose.disconnect();
  console.log('Disconnected.');
}

verifyMongoDB().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
