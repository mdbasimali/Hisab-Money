import { CustomerRepository } from '../repositories/customerRepository';
import { PaymentRepository } from '../repositories/paymentRepository';
import { DueRepository } from '../repositories/dueRepository';
import { SyncService } from './syncService';
import { paiseToRupees } from '../utils/currency';
import type { Customer, DashboardSummary, DueTransaction, Payment, Transaction, User } from '../types';

import { AuthService } from './authService';
import { BackupQueueService } from './backupQueueService';

const FALLBACK_USER: User = {
  id: 'guest',
  name: 'Hisab Money',
  email: '',
  phone: '',
  businessName: 'My Ledger',
};

export class AppDataService {
  static getUser(): User {
    const authUser = AuthService.getCachedUser();
    if (authUser) {
      return {
        id: authUser.id,
        name: authUser.name,
        email: authUser.email,
        phone: authUser.phone || '',
        businessName: authUser.name || 'Hisab Money',
      };
    }
    return FALLBACK_USER;
  }

  // ─── Customers ─────────────────────────────────────────────────────────────

  static async getCustomers(options?: { includeArchived?: boolean }): Promise<Customer[]> {
    return CustomerRepository.getCustomers(options);
  }

  static async searchCustomers(query: string): Promise<Customer[]> {
    return CustomerRepository.searchCustomers(query);
  }

  static async getCustomerById(id: string): Promise<Customer | null> {
    return CustomerRepository.getCustomerById(id);
  }

  static async addCustomer(params: {
    name: string;
    phone?: string;
    address?: string;
    notes?: string;
    creditLimit?: number;
    openingBalancePaise: number;
    initialDueReason?: string;
    initialDueDate?: string;
  }): Promise<Customer> {
    const customer = await CustomerRepository.createCustomer(params);

    // Enqueue for background synchronization with backend MongoDB
    SyncService.enqueue('customer', customer.id, 'CREATE', {
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      notes: customer.notes,
      openingBalancePaise: customer.openingBalancePaise,
      initialDueReason: params.initialDueReason,
      initialDueDate: params.initialDueDate,
    });

    // Trigger always-on automatic cloud backup queue
    BackupQueueService.triggerAutoBackup('customer_created');

    return customer;
  }

  static async updateCustomer(params: {
    id: string;
    name: string;
    phone?: string;
    address?: string;
    notes?: string;
    creditLimit?: number;
  }): Promise<Customer> {
    const customer = await CustomerRepository.updateCustomer(params);

    SyncService.enqueue('customer', customer.id, 'UPDATE', {
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      notes: customer.notes,
    });

    // Trigger always-on automatic cloud backup queue
    BackupQueueService.triggerAutoBackup('customer_updated');

    return customer;
  }

  static async archiveCustomer(id: string, isArchived = true): Promise<void> {
    await CustomerRepository.setArchived(id, isArchived);

    SyncService.enqueue('customer', id, 'UPDATE', {
      isArchived,
    });

    // Trigger always-on automatic cloud backup queue
    BackupQueueService.triggerAutoBackup('customer_archived');
  }

  // ─── Due Transactions (Multiple Dues per Customer) ─────────────────────────

  static async addNewDue(params: {
    customerId: string;
    amountPaise: number;
    reason: string;
    transactionDate?: string;
    notes?: string;
  }): Promise<DueTransaction> {
    const due = await DueRepository.createDue(params);

    SyncService.enqueue('due', due.id, 'CREATE', {
      customerId: due.customerId,
      clientTransactionId: due.id,
      amountPaise: due.amountPaise,
      reason: due.reason,
      transactionDate: due.transactionDate,
      notes: due.notes,
    });

    // Trigger always-on automatic cloud backup queue
    BackupQueueService.triggerAutoBackup('due_added');

    return due;
  }

  static async getDuesByCustomer(customerId: string): Promise<DueTransaction[]> {
    return DueRepository.getDuesByCustomer(customerId);
  }

  // ─── Payments & Ledger ─────────────────────────────────────────────────────

  static async recordPayment(params: {
    customerId: string;
    amountPaise: number;
    paymentMethod: string;
    notes?: string;
  }): Promise<Payment> {
    const payment = await PaymentRepository.recordPayment(params);

    SyncService.enqueue('payment', payment.id, 'CREATE', {
      customerId: payment.customerId,
      clientTransactionId: payment.id,
      amountPaise: payment.amountPaise,
      paymentMethod: payment.paymentMethod,
      paymentDate: payment.paymentDate,
      notes: payment.notes,
    });

    // Trigger always-on automatic cloud backup queue
    BackupQueueService.triggerAutoBackup('payment_recorded');

    return payment;
  }

  static async getTransactionsByCustomer(customerId: string): Promise<Transaction[]> {
    const customer = await CustomerRepository.getCustomerById(customerId);
    const payments = await PaymentRepository.getPaymentsByCustomer(customerId);
    const dues = await DueRepository.getDuesByCustomer(customerId);

    const transactions: Transaction[] = [];

    // 1. Opening balance entry if opening balance > 0
    if (customer && (customer.openingBalancePaise ?? 0) > 0) {
      const obPaise = customer.openingBalancePaise ?? 0;
      transactions.push({
        id: `opening-${customer.id}`,
        customerId: customer.id,
        customerName: customer.name,
        type: 'credit',
        subType: 'opening',
        amountPaise: obPaise,
        amount: paiseToRupees(obPaise),
        balanceAfterPaise: obPaise,
        balanceAfter: paiseToRupees(obPaise),
        reason: 'Opening Balance',
        notes: customer.notes ? `Opening Balance: ${customer.notes}` : 'Opening Balance',
        createdAt: customer.createdAt,
      });
    }

    // 2. New Due transactions
    dues.forEach((d) => {
      transactions.push({
        id: d.id,
        customerId: d.customerId,
        customerName: d.customerName || customer?.name || 'Customer',
        type: 'credit',
        subType: 'new_due',
        amountPaise: d.amountPaise,
        amount: d.amount,
        balanceAfterPaise: 0,
        balanceAfter: 0,
        reason: d.reason,
        notes: d.notes || d.reason,
        createdAt:
          d.transactionDate && d.transactionDate.includes('T12:00:00') && d.createdAt
            ? d.createdAt
            : d.transactionDate || d.createdAt,
      });
    });

    // 3. Payment entries
    payments.forEach((p) => {
      transactions.push({
        id: p.id,
        customerId: p.customerId,
        customerName: p.customerName || customer?.name || 'Customer',
        type: 'payment',
        subType: 'payment',
        amountPaise: p.amountPaise,
        amount: p.amount,
        balanceAfterPaise: 0,
        balanceAfter: 0,
        reason: `Payment via ${p.paymentMethod.toUpperCase()}`,
        notes: p.notes || `Payment via ${p.paymentMethod.toUpperCase()}`,
        paymentMethod: p.paymentMethod,
        paymentDate: p.paymentDate,
        createdAt: p.paymentDate || p.createdAt,
      });
    });

    // Sort descending by date
    return transactions.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  static async getTransactions(): Promise<Transaction[]> {
    const customers = await CustomerRepository.getCustomers({ includeArchived: true });
    const payments = await PaymentRepository.getAllTransactions();

    const openingEntries: Transaction[] = customers
      .filter((c) => (c.openingBalancePaise ?? 0) > 0)
      .map((c) => ({
        id: `opening-${c.id}`,
        customerId: c.id,
        customerName: c.name,
        type: 'credit',
        subType: 'opening',
        amountPaise: c.openingBalancePaise ?? 0,
        amount: paiseToRupees(c.openingBalancePaise ?? 0),
        balanceAfterPaise: c.balancePaise ?? 0,
        balanceAfter: c.balance,
        reason: 'Opening Balance',
        notes: c.notes ? `Opening Balance: ${c.notes}` : 'Opening Balance',
        createdAt: c.createdAt,
      }));

    // Fetch all new due transactions across all customers in a single fast query (solves N+1 query bottleneck)
    const { getAllDueTransactions } = require('../repositories/dueQueryHelper');
    const cDues: DueTransaction[] = await getAllDueTransactions();
    const allDues: Transaction[] = cDues.map((d) => ({
      id: d.id,
      customerId: d.customerId,
      customerName: d.customerName || 'Customer',
      type: 'credit',
      subType: 'new_due',
      amountPaise: d.amountPaise,
      amount: d.amount,
      balanceAfterPaise: 0,
      balanceAfter: 0,
      reason: d.reason,
      notes: d.notes || d.reason,
      createdAt: d.transactionDate || d.createdAt,
    }));

    return [...payments, ...openingEntries, ...allDues].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // ─── Dashboard Summary (Optimized with parallel SQL aggregate queries) ──────
  static async getDashboardSummary(): Promise<DashboardSummary> {
    const [customers, totalCollectedPaise, totalCollectedTodayPaise, recentTransactions] =
      await Promise.all([
        CustomerRepository.getCustomers(),
        PaymentRepository.getTotalCollectedPaise(),
        PaymentRepository.getTotalCollectedTodayPaise(),
        PaymentRepository.getRecentUnifiedTransactions(5),
      ]);

    const totalOutstandingPaise = customers.reduce((sum, c) => sum + (c.balancePaise ?? 0), 0);
    const totalCustomers = customers.length;
    const customersWithBalance = customers.filter((c) => (c.balancePaise ?? 0) > 0).length;

    return {
      totalOutstanding: paiseToRupees(totalOutstandingPaise),
      totalOutstandingPaise,
      totalCollected: paiseToRupees(totalCollectedPaise),
      totalCollectedPaise,
      totalCustomers,
      customersWithBalance,
      recentTransactions,
      totalCollectedToday: paiseToRupees(totalCollectedTodayPaise),
    };
  }
}

/**
 * Backwards compatibility export to support components smoothly
 */
export const MockService = AppDataService;
