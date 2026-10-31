import { getDatabase } from '../database/db';
import { calculateBalances } from '../utils/currency';
import type { Customer } from '../types';

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  credit_limit: number;
  opening_balance_paise: number;
  is_archived: number;
  backend_id?: string | null;
  sync_status?: string | null;
  created_at: string;
  updated_at: string;
  total_paid_paise?: number;
  total_new_dues_paise?: number;
  last_transaction_at?: string | null;
}

export interface CreateCustomerParams {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  creditLimit?: number;
  openingBalancePaise: number;
  initialDueReason?: string;
  initialDueDate?: string;
}

export interface UpdateCustomerParams {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  creditLimit?: number;
}

export class CustomerRepository {
  /**
   * Helper to map a raw database row into our domain Customer model
   */
  private static mapRowToCustomer(row: CustomerRow): Customer {
    const totalPaidPaise = row.total_paid_paise || 0;
    const totalNewDuesPaise = row.total_new_dues_paise || 0;
    const calc = calculateBalances(row.opening_balance_paise, totalPaidPaise, totalNewDuesPaise);

    let syncStatus: 'LOCAL' | 'PENDING' | 'SYNCED' | 'FAILED' = 'LOCAL';
    if (row.backend_id) {
      syncStatus = 'SYNCED';
    } else if (row.sync_status === 'PENDING') {
      syncStatus = 'PENDING';
    } else if (row.sync_status === 'FAILED') {
      syncStatus = 'FAILED';
    }

    return {
      id: row.id,
      name: row.name,
      phone: row.phone || '',
      address: row.address || '',
      notes: row.notes || '',
      creditLimit: row.credit_limit,
      openingBalancePaise: row.opening_balance_paise,
      openingBalance: calc.openingBalanceRupees,
      totalNewDuesPaise: calc.totalNewDuesPaise,
      totalCreditPaise: calc.totalDuePaise,
      totalPaidPaise: calc.totalPaidPaise,
      balancePaise: calc.remainingBalancePaise,
      totalNewDues: calc.totalNewDuesRupees,
      totalCredit: calc.totalDueRupees,
      totalPaid: calc.totalPaidRupees,
      balance: calc.remainingBalanceRupees,
      isArchived: row.is_archived === 1,
      backendId: row.backend_id || undefined,
      syncStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastTransactionAt: row.last_transaction_at || row.updated_at || row.created_at,
    };
  }

  /**
   * List all active (or archived) customers with their computed total_paid_paise and total_new_dues_paise
   */
  static async getCustomers(options?: { includeArchived?: boolean }): Promise<Customer[]> {
    const db = await getDatabase();
    const includeArchived = options?.includeArchived ?? false;

    // Isolate by logged-in user
    let userFilter = '1=1';
    let params: any[] = [];
    try {
      const { AuthService } = require('../services/authService');
      const user = await AuthService.getUser();
      if (user?.id) {
        // Automatically claim any unassigned local customer records (from restore or offline creation)
        await db.runAsync('UPDATE customers SET user_id = ? WHERE user_id IS NULL OR user_id = "";', [user.id]).catch(() => {});
        userFilter = '(c.user_id = ? OR c.user_id IS NULL)';
        params.push(user.id);
      }
    } catch {}

    const query = `
      SELECT 
        c.*,
        COALESCE(p.total_paid_paise, 0) AS total_paid_paise,
        COALESCE(d.total_new_dues_paise, 0) AS total_new_dues_paise,
        (
          SELECT status FROM sync_queue 
          WHERE entity_id = c.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) AS sync_status,
        (
          SELECT MAX(COALESCE(txn_date, created_at))
          FROM (
            SELECT payment_date AS txn_date, created_at FROM payments WHERE customer_id = c.id
            UNION ALL
            SELECT 
              CASE 
                WHEN transaction_date LIKE '%T12:00:00%' THEN created_at 
                ELSE COALESCE(transaction_date, created_at) 
              END AS txn_date, 
              created_at 
            FROM due_transactions WHERE customer_id = c.id
          )
        ) AS last_transaction_at
      FROM customers c
      LEFT JOIN (
        SELECT customer_id, SUM(amount_paise) AS total_paid_paise
        FROM payments
        GROUP BY customer_id
      ) p ON p.customer_id = c.id
      LEFT JOIN (
        SELECT customer_id, SUM(amount_paise) AS total_new_dues_paise
        FROM due_transactions
        GROUP BY customer_id
      ) d ON d.customer_id = c.id
      WHERE (${includeArchived ? '1=1' : 'c.is_archived = 0'}) AND ${userFilter}
      ORDER BY c.updated_at DESC;
    `;

    const rows = await db.getAllAsync<CustomerRow>(query, params);
    return rows.map(this.mapRowToCustomer);
  }

  /**
   * Search customers by name or phone
   */
  static async searchCustomers(queryText: string): Promise<Customer[]> {
    const db = await getDatabase();
    const trimmed = queryText.trim();
    if (!trimmed) {
      return this.getCustomers();
    }

    let userFilter = '1=1';
    let userParams: any[] = [];
    try {
      const { AuthService } = require('../services/authService');
      const user = await AuthService.getUser();
      if (user?.id) {
        userFilter = '(c.user_id = ? OR c.user_id IS NULL)';
        userParams.push(user.id);
      }
    } catch {}

    const pattern = `%${trimmed}%`;
    const query = `
      SELECT 
        c.*,
        COALESCE(p.total_paid_paise, 0) AS total_paid_paise,
        COALESCE(d.total_new_dues_paise, 0) AS total_new_dues_paise,
        (
          SELECT status FROM sync_queue 
          WHERE entity_id = c.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) AS sync_status,
        (
          SELECT MAX(COALESCE(txn_date, created_at))
          FROM (
            SELECT payment_date AS txn_date, created_at FROM payments WHERE customer_id = c.id
            UNION ALL
            SELECT 
              CASE 
                WHEN transaction_date LIKE '%T12:00:00%' THEN created_at 
                ELSE COALESCE(transaction_date, created_at) 
              END AS txn_date, 
              created_at 
            FROM due_transactions WHERE customer_id = c.id
          )
        ) AS last_transaction_at
      FROM customers c
      LEFT JOIN (
        SELECT customer_id, SUM(amount_paise) AS total_paid_paise
        FROM payments
        GROUP BY customer_id
      ) p ON p.customer_id = c.id
      LEFT JOIN (
        SELECT customer_id, SUM(amount_paise) AS total_new_dues_paise
        FROM due_transactions
        GROUP BY customer_id
      ) d ON d.customer_id = c.id
      WHERE c.is_archived = 0 AND (c.name LIKE ? OR c.phone LIKE ?) AND ${userFilter}
      ORDER BY c.updated_at DESC;
    `;

    const rows = await db.getAllAsync<CustomerRow>(query, [pattern, pattern, ...userParams]);
    return rows.map(this.mapRowToCustomer);
  }

  /**
   * Get single customer by id with computed balances (opening balance + new dues - payments)
   */
  static async getCustomerById(id: string): Promise<Customer | null> {
    const db = await getDatabase();
    const query = `
      SELECT 
        c.*,
        COALESCE(p.total_paid_paise, 0) AS total_paid_paise,
        COALESCE(d.total_new_dues_paise, 0) AS total_new_dues_paise,
        (
          SELECT status FROM sync_queue 
          WHERE entity_id = c.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) AS sync_status,
        (
          SELECT MAX(COALESCE(txn_date, created_at))
          FROM (
            SELECT payment_date AS txn_date, created_at FROM payments WHERE customer_id = c.id
            UNION ALL
            SELECT 
              CASE 
                WHEN transaction_date LIKE '%T12:00:00%' THEN created_at 
                ELSE COALESCE(transaction_date, created_at) 
              END AS txn_date, 
              created_at 
            FROM due_transactions WHERE customer_id = c.id
          )
        ) AS last_transaction_at
      FROM customers c
      LEFT JOIN (
        SELECT customer_id, SUM(amount_paise) AS total_paid_paise
        FROM payments
        WHERE customer_id = ?
      ) p ON p.customer_id = c.id
      LEFT JOIN (
        SELECT customer_id, SUM(amount_paise) AS total_new_dues_paise
        FROM due_transactions
        WHERE customer_id = ?
      ) d ON d.customer_id = c.id
      WHERE c.id = ?;
    `;

    const row = await db.getFirstAsync<CustomerRow>(query, [id, id, id]);
    if (!row) return null;
    return this.mapRowToCustomer(row);
  }

  /**
   * Find an active customer by phone number (checks last 10 digits and full string)
   */
  static async getCustomerByPhone(phone: string): Promise<Customer | null> {
    const db = await getDatabase();
    const trimmed = phone.trim();
    if (!trimmed) return null;

    const digitsOnly = trimmed.replace(/\D/g, '');
    const last10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
    if (!last10) return null;

    let userFilter = '1=1';
    let userParams: any[] = [];
    try {
      const { AuthService } = require('../services/authService');
      const user = await AuthService.getUser();
      if (user?.id) {
        userFilter = '(c.user_id = ? OR c.user_id IS NULL)';
        userParams.push(user.id);
      }
    } catch {}

    const query = `
      SELECT 
        c.*,
        COALESCE(p.total_paid_paise, 0) AS total_paid_paise,
        COALESCE(d.total_new_dues_paise, 0) AS total_new_dues_paise,
        (
          SELECT status FROM sync_queue 
          WHERE entity_id = c.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) AS sync_status,
        (
          SELECT MAX(COALESCE(txn_date, created_at))
          FROM (
            SELECT payment_date AS txn_date, created_at FROM payments WHERE customer_id = c.id
            UNION ALL
            SELECT 
              CASE 
                WHEN transaction_date LIKE '%T12:00:00%' THEN created_at 
                ELSE COALESCE(transaction_date, created_at) 
              END AS txn_date, 
              created_at 
            FROM due_transactions WHERE customer_id = c.id
          )
        ) AS last_transaction_at
      FROM customers c
      LEFT JOIN (
        SELECT customer_id, SUM(amount_paise) AS total_paid_paise
        FROM payments
        GROUP BY customer_id
      ) p ON p.customer_id = c.id
      LEFT JOIN (
        SELECT customer_id, SUM(amount_paise) AS total_new_dues_paise
        FROM due_transactions
        GROUP BY customer_id
      ) d ON d.customer_id = c.id
      WHERE c.is_archived = 0 AND (c.phone = ? OR c.phone LIKE ? OR c.phone LIKE ?) AND ${userFilter}
      LIMIT 1;
    `;

    const row = await db.getFirstAsync<CustomerRow>(query, [trimmed, `%${last10}`, `%${last10}%`, ...userParams]);
    if (!row) return null;
    return this.mapRowToCustomer(row);
  }

  /**
   * Insert a new customer record.
   * Stores openingBalancePaise directly in customers.opening_balance_paise.
   * New dues in due_transactions represent only subsequent borrow transactions.
   */
  static async createCustomer(params: CreateCustomerParams): Promise<Customer> {
    const db = await getDatabase();
    const id = `c-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const openingBalancePaise = Math.max(0, Math.round(params.openingBalancePaise || 0));

    let userId: string | null = null;
    try {
      const { AuthService } = require('../services/authService');
      const user = await AuthService.getUser();
      if (user?.id) userId = user.id;
    } catch {}

    // Combine any initial due reason with customer notes if reason was provided
    let combinedNotes = params.notes?.trim() || null;
    if (openingBalancePaise > 0 && params.initialDueReason?.trim()) {
      const reasonText = `Reason: ${params.initialDueReason.trim()}`;
      combinedNotes = combinedNotes ? `${combinedNotes} • ${reasonText}` : reasonText;
    }

    await db.runAsync(
      `INSERT INTO customers (
        id, name, phone, address, notes, credit_limit, opening_balance_paise, is_archived, user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?);`,
      [
        id,
        params.name.trim(),
        params.phone?.trim() || null,
        params.address?.trim() || null,
        combinedNotes,
        params.creditLimit || 5000,
        openingBalancePaise,
        userId,
        now,
        now,
      ]
    );

    const created = await this.getCustomerById(id);
    if (!created) {
      throw new Error('Failed to create customer in SQLite');
    }
    return created;
  }

  /**
   * Update customer profile details
   */
  static async updateCustomer(params: UpdateCustomerParams): Promise<Customer> {
    const db = await getDatabase();
    const now = new Date().toISOString();

    await db.runAsync(
      `UPDATE customers
       SET name = ?, phone = ?, address = ?, notes = ?, credit_limit = COALESCE(?, credit_limit, 5000), updated_at = ?
       WHERE id = ?;`,
      [
        params.name.trim(),
        params.phone?.trim() || null,
        params.address?.trim() || null,
        params.notes?.trim() || null,
        params.creditLimit ?? null,
        now,
        params.id,
      ]
    );

    const updated = await this.getCustomerById(params.id);
    if (!updated) {
      throw new Error(`Customer with id ${params.id} not found`);
    }
    return updated;
  }

  /**
   * Archive or unarchive a customer without deleting payment/due history
   */
  static async setArchived(id: string, isArchived: boolean): Promise<void> {
    const db = await getDatabase();
    const now = new Date().toISOString();
    await db.runAsync(
      'UPDATE customers SET is_archived = ?, updated_at = ? WHERE id = ?;',
      [isArchived ? 1 : 0, now, id]
    );
  }
}
