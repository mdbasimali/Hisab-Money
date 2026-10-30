import { getDatabase } from '../database/db';
import { paiseToRupees } from '../utils/currency';
import type { DueTransaction } from '../types';

export interface DueTransactionRow {
  id: string;
  customer_id: string;
  amount_paise: number;
  reason: string;
  transaction_date: string;
  notes: string | null;
  created_at: string;
  customer_name?: string;
}

export interface CreateDueParams {
  customerId: string;
  amountPaise: number;
  reason: string;
  transactionDate?: string;
  notes?: string;
}

export class DueRepository {
  /**
   * Record a new due linked to a customer in a SQLite transaction.
   * Prevents rapid accidental double-taps.
   */
  static async createDue(params: CreateDueParams): Promise<DueTransaction> {
    const db = await getDatabase();
    const amountPaise = Math.round(params.amountPaise);

    if (amountPaise <= 0) {
      throw new Error('Due amount must be greater than zero');
    }

    if (!params.reason || !params.reason.trim()) {
      throw new Error('Reason / description is required');
    }

    const dueId = `due-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const transactionDate = params.transactionDate || now;

    await db.withTransactionAsync(async () => {
      // 1. Verify customer exists and is not archived
      const customer = await db.getFirstAsync<{ id: string; name: string; is_archived: number }>(
        'SELECT id, name, is_archived FROM customers WHERE id = ?;',
        [params.customerId]
      );

      if (!customer) {
        throw new Error('Customer not found');
      }

      if (customer.is_archived === 1) {
        throw new Error('Cannot add new due for an archived customer');
      }

      // 2. Double-tap duplicate check within 1.5 seconds
      const recentDue = await db.getFirstAsync<{ created_at: string }>(
        `SELECT created_at FROM due_transactions
         WHERE customer_id = ? AND amount_paise = ? AND reason = ?
         ORDER BY created_at DESC LIMIT 1;`,
        [params.customerId, amountPaise, params.reason.trim()]
      );

      if (recentDue) {
        const lastTime = new Date(recentDue.created_at).getTime();
        const currentTime = new Date(now).getTime();
        if (!isNaN(lastTime) && !isNaN(currentTime) && currentTime - lastTime < 1500) {
          throw new Error('Duplicate due entry detected. Please wait a moment before trying again.');
        }
      }

      let userId: string | null = null;
      try {
        const { AuthService } = require('../services/authService');
        const user = await AuthService.getUser();
        if (user?.id) userId = user.id;
      } catch {}

      // 3. Insert into due_transactions table
      await db.runAsync(
        `INSERT INTO due_transactions (
          id, customer_id, amount_paise, reason, transaction_date, notes, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          dueId,
          params.customerId,
          amountPaise,
          params.reason.trim(),
          transactionDate,
          params.notes?.trim() || null,
          userId,
          now,
        ]
      );

      // 4. Update customer updated_at timestamp
      await db.runAsync('UPDATE customers SET updated_at = ? WHERE id = ?;', [now, params.customerId]);
    });

    const created = await this.getDueById(dueId);
    if (!created) {
      throw new Error('Failed to retrieve created due transaction');
    }
    return created;
  }

  static async getDueById(id: string): Promise<DueTransaction | null> {
    const db = await getDatabase();
    const query = `
      SELECT d.*, c.name AS customer_name
      FROM due_transactions d
      LEFT JOIN customers c ON c.id = d.customer_id
      WHERE d.id = ?;
    `;
    const row = await db.getFirstAsync<DueTransactionRow>(query, [id]);
    if (!row) return null;

    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name || 'Customer',
      amountPaise: row.amount_paise,
      amount: paiseToRupees(row.amount_paise),
      reason: row.reason,
      transactionDate: row.transaction_date,
      notes: row.notes || '',
      createdAt: row.created_at,
    };
  }

  /**
   * Get all due transactions for a customer
   */
  static async getDuesByCustomer(customerId: string): Promise<DueTransaction[]> {
    const db = await getDatabase();
    const query = `
      SELECT d.*, c.name AS customer_name
      FROM due_transactions d
      LEFT JOIN customers c ON c.id = d.customer_id
      WHERE d.customer_id = ?
      ORDER BY d.transaction_date DESC;
    `;
    const rows = await db.getAllAsync<DueTransactionRow>(query, [customerId]);
    return rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name || 'Customer',
      amountPaise: row.amount_paise,
      amount: paiseToRupees(row.amount_paise),
      reason: row.reason,
      transactionDate: row.transaction_date,
      notes: row.notes || '',
      createdAt: row.created_at,
    }));
  }

  /**
   * Get total sum of new dues in paise across all customers for current user
   */
  static async getTotalNewDuesPaise(): Promise<number> {
    const db = await getDatabase();
    let userFilter = '1=1';
    let params: any[] = [];
    try {
      const { AuthService } = require('../services/authService');
      const user = await AuthService.getUser();
      if (user?.id) {
        userFilter = '(user_id = ? OR user_id IS NULL)';
        params.push(user.id);
      }
    } catch {}

    const row = await db.getFirstAsync<{ total: number | null }>(
      `SELECT SUM(amount_paise) as total FROM due_transactions WHERE ${userFilter};`,
      params
    );
    return row?.total ?? 0;
  }
}
