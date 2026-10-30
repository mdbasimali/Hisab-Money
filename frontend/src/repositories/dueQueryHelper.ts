import { getDatabase } from '../database/db';
import { paiseToRupees } from '../utils/currency';
import type { DueTransaction } from '../types';
import { DueTransactionRow } from './dueRepository';

// Extension to fetch all dues in a single query instead of N+1
export async function getAllDueTransactions(): Promise<DueTransaction[]> {
  const db = await getDatabase();
  let userFilter = '1=1';
  let params: any[] = [];
  try {
    const { AuthService } = require('../services/authService');
    const user = await AuthService.getUser();
    if (user?.id) {
      userFilter = '(d.user_id = ? OR d.user_id IS NULL)';
      params.push(user.id);
    }
  } catch {}

  const query = `
    SELECT d.*, c.name AS customer_name
    FROM due_transactions d
    LEFT JOIN customers c ON c.id = d.customer_id
    WHERE ${userFilter}
    ORDER BY d.transaction_date DESC;
  `;
  const rows = await db.getAllAsync<DueTransactionRow>(query, params);
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
