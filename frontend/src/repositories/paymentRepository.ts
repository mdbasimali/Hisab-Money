import { getDatabase } from '../database/db';
import { paiseToRupees } from '../utils/currency';
import type { Payment, Transaction } from '../types';

export interface PaymentRow {
  id: string;
  customer_id: string;
  amount_paise: number;
  payment_method: string;
  payment_date: string;
  notes: string | null;
  created_at: string;
  customer_name?: string;
}

export interface RecordPaymentParams {
  customerId: string;
  amountPaise: number;
  paymentMethod: string;
  notes?: string;
  paymentDate?: string;
}

export class PaymentRepository {
  /**
   * Record a payment within a database transaction, verifying:
   * 1. Customer exists & is not archived
   * 2. Payment amount does not exceed remaining balance
   * 3. Prevents duplicate payments
   */
  static async recordPayment(params: RecordPaymentParams): Promise<Payment> {
    const db = await getDatabase();
    const amountPaise = Math.round(params.amountPaise);

    if (amountPaise <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    const paymentId = `p-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const paymentDate = params.paymentDate || now;

    // Execute in a database transaction
    await db.withTransactionAsync(async () => {
      // 1. Fetch customer with current total paid and total new dues
      const queryCustomer = `
        SELECT 
          c.id, c.name, c.opening_balance_paise, c.is_archived,
          COALESCE(p.total_paid_paise, 0) AS total_paid_paise,
          COALESCE(d.total_new_dues_paise, 0) AS total_new_dues_paise
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
      const customer = await db.getFirstAsync<{
        id: string;
        name: string;
        opening_balance_paise: number;
        is_archived: number;
        total_paid_paise: number;
        total_new_dues_paise: number;
      }>(queryCustomer, [params.customerId, params.customerId, params.customerId]);

      if (!customer) {
        throw new Error('Customer not found');
      }

      if (customer.is_archived === 1) {
        throw new Error('Cannot record payment for an archived customer');
      }

      const totalDuePaise = customer.opening_balance_paise + customer.total_new_dues_paise;
      const currentRemainingPaise = Math.max(
        0,
        totalDuePaise - customer.total_paid_paise
      );

      if (amountPaise > currentRemainingPaise) {
        const remainingRupees = (currentRemainingPaise / 100).toFixed(2);
        throw new Error(
          `Payment amount exceeds remaining balance of ₹${remainingRupees}`
        );
      }

      // Check for rapid duplicate in-flight submission within the last 2 seconds using timestamp delta
      const recentPayment = await db.getFirstAsync<{ created_at: string }>(
        `SELECT created_at FROM payments 
         WHERE customer_id = ? AND amount_paise = ? 
         ORDER BY created_at DESC LIMIT 1;`,
        [params.customerId, amountPaise]
      );

      if (recentPayment) {
        const lastTime = new Date(recentPayment.created_at).getTime();
        const currentTime = new Date(now).getTime();
        // If submitted within 1.5 seconds, reject as an accidental double-tap
        if (!isNaN(lastTime) && !isNaN(currentTime) && currentTime - lastTime < 1500) {
          throw new Error('Duplicate payment detected. Please wait a moment before trying again.');
        }
      }

      let userId: string | null = null;
      try {
        const { AuthService } = require('../services/authService');
        const user = await AuthService.getUser();
        if (user?.id) userId = user.id;
      } catch {}

      // Insert payment record
      await db.runAsync(
        `INSERT INTO payments (
          id, customer_id, amount_paise, payment_method, payment_date, notes, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          paymentId,
          params.customerId,
          amountPaise,
          params.paymentMethod || 'cash',
          paymentDate,
          params.notes?.trim() || null,
          userId,
          now,
        ]
      );

      // Touch customer updated_at
      await db.runAsync(
        'UPDATE customers SET updated_at = ? WHERE id = ?;',
        [now, params.customerId]
      );
    });

    const inserted = await this.getPaymentById(paymentId);
    if (!inserted) {
      throw new Error('Failed to retrieve recorded payment');
    }
    return inserted;
  }

  static async getPaymentById(id: string): Promise<Payment | null> {
    const db = await getDatabase();
    const query = `
      SELECT p.*, c.name AS customer_name
      FROM payments p
      LEFT JOIN customers c ON c.id = p.customer_id
      WHERE p.id = ?;
    `;
    const row = await db.getFirstAsync<PaymentRow>(query, [id]);
    if (!row) return null;

    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name || 'Customer',
      amountPaise: row.amount_paise,
      amount: paiseToRupees(row.amount_paise),
      paymentMethod: row.payment_method,
      notes: row.notes || '',
      paymentDate: row.payment_date,
      createdAt: row.created_at,
    };
  }

  /**
   * Update payment notes while strictly preserving the original payment_date and created_at timestamps.
   */
  static async updatePaymentNotes(id: string, notes: string): Promise<Payment | null> {
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE payments SET notes = ? WHERE id = ?;`,
      [notes?.trim() || null, id]
    );
    return this.getPaymentById(id);
  }

  /**
   * Get all payments for a given customer
   */
  static async getPaymentsByCustomer(customerId: string): Promise<Payment[]> {
    const db = await getDatabase();
    const query = `
      SELECT p.*, c.name AS customer_name
      FROM payments p
      LEFT JOIN customers c ON c.id = p.customer_id
      WHERE p.customer_id = ?
      ORDER BY p.payment_date DESC;
    `;
    const rows = await db.getAllAsync<PaymentRow>(query, [customerId]);
    return rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name || 'Customer',
      amountPaise: row.amount_paise,
      amount: paiseToRupees(row.amount_paise),
      paymentMethod: row.payment_method,
      notes: row.notes || '',
      paymentDate: row.payment_date,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get all payments formatted as unified Transactions for current user
   */
  static async getAllTransactions(): Promise<Transaction[]> {
    const db = await getDatabase();
    let userFilter = '1=1';
    let params: any[] = [];
    try {
      const { AuthService } = require('../services/authService');
      const user = await AuthService.getUser();
      if (user?.id) {
        userFilter = '(p.user_id = ? OR p.user_id IS NULL)';
        params.push(user.id);
      }
    } catch {}

    const query = `
      SELECT 
        p.id,
        p.customer_id,
        c.name AS customer_name,
        p.amount_paise,
        p.payment_method,
        p.notes,
        p.payment_date,
        p.created_at,
        c.opening_balance_paise
      FROM payments p
      LEFT JOIN customers c ON c.id = p.customer_id
      WHERE ${userFilter}
      ORDER BY p.payment_date DESC;
    `;

    const rows = await db.getAllAsync<PaymentRow & { opening_balance_paise: number }>(query, params);

    return rows.map((r) => {
      const amount = paiseToRupees(r.amount_paise);
      return {
        id: r.id,
        customerId: r.customer_id,
        customerName: r.customer_name || 'Customer',
        type: 'payment',
        amountPaise: r.amount_paise,
        amount,
        balanceAfterPaise: 0,
        balanceAfter: 0,
        notes: r.notes || `Payment via ${r.payment_method.toUpperCase()}`,
        paymentMethod: r.payment_method,
        paymentDate: r.payment_date,
        createdAt: r.payment_date || r.created_at,
      };
    });
  }

  /**
   * Get total amount collected across all payments in paise for current user
   */
  static async getTotalCollectedPaise(): Promise<number> {
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
      `SELECT SUM(amount_paise) as total FROM payments WHERE ${userFilter};`,
      params
    );
    return row?.total ?? 0;
  }

  /**
   * Get total amount collected today in paise for current user
   */
  static async getTotalCollectedTodayPaise(): Promise<number> {
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

    const todayStr = new Date().toISOString().split('T')[0];
    const row = await db.getFirstAsync<{ total: number | null }>(
      `SELECT SUM(amount_paise) as total FROM payments WHERE (payment_date LIKE ? OR created_at LIKE ?) AND ${userFilter};`,
      [`${todayStr}%`, `${todayStr}%`, ...params]
    );
    return row?.total ?? 0;
  }

  /**
   * Fast query for top recent unified transactions (payments + dues) without loading the whole DB
   */
  static async getRecentUnifiedTransactions(limit: number = 5): Promise<Transaction[]> {
    const db = await getDatabase();
    let userFilterP = '1=1';
    let userFilterD = '1=1';
    let params: any[] = [];
    try {
      const { AuthService } = require('../services/authService');
      const user = await AuthService.getUser();
      if (user?.id) {
        userFilterP = '(p.user_id = ? OR p.user_id IS NULL)';
        userFilterD = '(d.user_id = ? OR d.user_id IS NULL)';
        params.push(user.id, user.id);
      }
    } catch {}

    const query = `
      SELECT * FROM (
        SELECT 
          p.id,
          p.customer_id,
          c.name AS customer_name,
          'payment' AS type,
          p.amount_paise,
          p.payment_method,
          p.notes,
          p.payment_date AS created_at
        FROM payments p
        LEFT JOIN customers c ON c.id = p.customer_id
        WHERE ${userFilterP}
        UNION ALL
        SELECT 
          d.id,
          d.customer_id,
          c.name AS customer_name,
          'credit' AS type,
          d.amount_paise,
          'due' AS payment_method,
          d.reason AS notes,
          d.transaction_date AS created_at
        FROM due_transactions d
        LEFT JOIN customers c ON c.id = d.customer_id
        WHERE ${userFilterD}
      )
      ORDER BY created_at DESC
      LIMIT ${limit};
    `;

    const rows = await db.getAllAsync<any>(query, params);
    return rows.map((r) => ({
      id: r.id,
      customerId: r.customer_id,
      customerName: r.customer_name || 'Customer',
      type: r.type,
      subType: r.type === 'credit' ? 'new_due' : undefined,
      amountPaise: r.amount_paise,
      amount: paiseToRupees(r.amount_paise),
      balanceAfterPaise: 0,
      balanceAfter: 0,
      reason: r.type === 'credit' ? r.notes : undefined,
      notes: r.notes,
      paymentMethod: r.payment_method,
      createdAt: r.created_at,
    }));
  }
}
