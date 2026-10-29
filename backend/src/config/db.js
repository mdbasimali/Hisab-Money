import mongoose from 'mongoose';

/**
 * Connect to MongoDB database
 * Ensures strict query mode and robust error handlers
 */
export async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  try {
    mongoose.set('strictQuery', true);
    
    const isProduction = process.env.NODE_ENV === 'production';
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10', 10),
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '2', 10),
      autoIndex: !isProduction, // Disable automatic index builds in production to prevent startup stalls
    });

    console.log(`[MongoDB] Connected to database: ${conn.connection.name} @ ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error(`[MongoDB] Connection error: ${err.message}`);
    throw err;
  }
}

/**
 * Graceful disconnect helper
 */
export async function disconnectDB() {
  try {
    await mongoose.connection.close();
    console.log('[MongoDB] Connection closed.');
  } catch (err) {
    console.error(`[MongoDB] Error closing connection: ${err.message}`);
  }
}
