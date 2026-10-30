import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'hisab_khata.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Migration definitions for Hisab Khata database
 */
interface Migration {
  version: number;
  up: (db: SQLite.SQLiteDatabase) => Promise<void>;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: async (db: SQLite.SQLiteDatabase) => {
      // 1. Customers Table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS customers (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          phone TEXT,
          address TEXT,
          notes TEXT,
          credit_limit INTEGER NOT NULL DEFAULT 5000,
          opening_balance_paise INTEGER NOT NULL DEFAULT 0,
          is_archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_customers_is_archived ON customers(is_archived);
        CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
        CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
      `);

      // 2. Payments Table
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS payments (
          id TEXT PRIMARY KEY NOT NULL,
          customer_id TEXT NOT NULL,
          amount_paise INTEGER NOT NULL,
          payment_method TEXT NOT NULL DEFAULT 'cash',
          payment_date TEXT NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
        CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
      `);
    },
  },
  {
    version: 2,
    up: async (db: SQLite.SQLiteDatabase) => {
      // 3. Due Transactions Table (for multiple dues per customer)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS due_transactions (
          id TEXT PRIMARY KEY NOT NULL,
          customer_id TEXT NOT NULL,
          amount_paise INTEGER NOT NULL,
          reason TEXT NOT NULL,
          transaction_date TEXT NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_due_tx_customer_id ON due_transactions(customer_id);
        CREATE INDEX IF NOT EXISTS idx_due_tx_date ON due_transactions(transaction_date);
      `);
    },
  },
  {
    version: 3,
    up: async (db: SQLite.SQLiteDatabase) => {
      // Migration to fix Customer Opening Balance vs New Dues:
      // In prior versions, initial dues were inserted into due_transactions with id starting with 'due-init-'
      // while customers.opening_balance_paise was set to 0.
      // This migration copies the initial due amount back to customers.opening_balance_paise and cleans
      // up the initial due record from due_transactions so it is not double-counted or treated as a "new due".
      await db.execAsync(`
        UPDATE customers
        SET opening_balance_paise = (
          SELECT amount_paise FROM due_transactions
          WHERE due_transactions.customer_id = customers.id AND due_transactions.id LIKE 'due-init-%'
          LIMIT 1
        )
        WHERE id IN (
          SELECT customer_id FROM due_transactions WHERE id LIKE 'due-init-%'
        ) AND opening_balance_paise = 0;

        DELETE FROM due_transactions WHERE id LIKE 'due-init-%';
      `);
    },
  },
  {
    version: 4,
    up: async (db: SQLite.SQLiteDatabase) => {
      // 4. App Settings Table for local offline persistence (e.g., user selected language)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 5,
    up: async (db: SQLite.SQLiteDatabase) => {
      // 5. Offline Sync Queue and Backend ID columns
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_created ON sync_queue(created_at);
      `);

      // Add backend_id column to customers, due_transactions, and payments if not already existing
      try {
        await db.execAsync('ALTER TABLE customers ADD COLUMN backend_id TEXT;');
      } catch (e) {
        // Column may already exist
      }
      try {
        await db.execAsync('ALTER TABLE due_transactions ADD COLUMN backend_id TEXT;');
      } catch (e) {
        // Column may already exist
      }
      try {
        await db.execAsync('ALTER TABLE payments ADD COLUMN backend_id TEXT;');
      } catch (e) {
        // Column may already exist
      }
    },
  },
  {
    version: 6,
    up: async (db: SQLite.SQLiteDatabase) => {
      // Ensure user_id column and indices exist
      try {
        await db.execAsync('ALTER TABLE customers ADD COLUMN user_id TEXT;');
      } catch (e) {}
      try {
        await db.execAsync('ALTER TABLE due_transactions ADD COLUMN user_id TEXT;');
      } catch (e) {}
      try {
        await db.execAsync('ALTER TABLE payments ADD COLUMN user_id TEXT;');
      } catch (e) {}
      try {
        await db.execAsync('ALTER TABLE sync_queue ADD COLUMN user_id TEXT;');
      } catch (e) {}

      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
        CREATE INDEX IF NOT EXISTS idx_due_tx_user_id ON due_transactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_user_id ON sync_queue(user_id);
      `);

      // Clean up legacy hardcoded demo records ('c-1', 'c-2', 'c-3') so they never pollute any user's khata
      await db.execAsync(`
        DELETE FROM sync_queue WHERE entity_id IN ('c-1', 'c-2', 'c-3', 'p-1', 'p-2', 'p-3');
        DELETE FROM payments WHERE customer_id IN ('c-1', 'c-2', 'c-3') OR id IN ('p-1', 'p-2', 'p-3');
        DELETE FROM due_transactions WHERE customer_id IN ('c-1', 'c-2', 'c-3');
        DELETE FROM customers WHERE id IN ('c-1', 'c-2', 'c-3');
      `);
    },
  },
  {
    version: 7,
    up: async (db: SQLite.SQLiteDatabase) => {
      // 7. Performance Optimization Indexes:
      // Speeds up customer list joins, dashboard aggregations, and sync queue lookups
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_sync_queue_entity_created ON sync_queue(entity_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_payments_date_amount ON payments(payment_date, amount_paise);
        CREATE INDEX IF NOT EXISTS idx_due_tx_date_amount ON due_transactions(transaction_date, amount_paise);
        CREATE INDEX IF NOT EXISTS idx_customers_updated ON customers(updated_at DESC);
      `);
    },
  },
];

/**
 * Runs pending database migrations in a transactional, versioned approach
 */
async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  // Create schema_migrations table if not exists
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  // Fetch already applied migrations
  const rows = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC;'
  );
  const appliedVersions = new Set(rows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      console.log(`[DB] Applying migration version ${migration.version}...`);
      await migration.up(db);
      await db.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);',
        [migration.version, new Date().toISOString()]
      );
      console.log(`[DB] Migration version ${migration.version} applied successfully.`);
    }
  }
}

/**
 * Initializes and returns the singleton SQLite database connection.
 * Enables foreign keys and PRAGMA journal_mode = WAL for performance & reliability.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      
      // Enable foreign key constraints
      await db.execAsync('PRAGMA foreign_keys = ON;');
      await db.execAsync('PRAGMA journal_mode = WAL;');

      // Run migrations
      await runMigrations(db);

      dbInstance = db;
      return db;
    } catch (error) {
      console.error('[DB] Failed to initialize SQLite database:', error);
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}
