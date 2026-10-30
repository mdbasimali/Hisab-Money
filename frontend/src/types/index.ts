// ─────────────────────────────────────────────────────────────────────────────
// Core domain types for Hisab Money
// ─────────────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  businessName: string;
  avatarUrl?: string;
}

/**
 * Customer domain entity with amounts in both Indian paise and Rupees for display
 */
export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes?: string;
  creditLimit?: number; // in Rupees (deprecated)
  openingBalancePaise?: number; // in Paise
  totalNewDuesPaise?: number; // in Paise
  totalCreditPaise?: number; // in Paise (opening + new dues)
  totalPaidPaise?: number; // in Paise
  balancePaise?: number; // in Paise (totalCreditPaise - totalPaidPaise)
  
  // Convenient Rupee amounts computed for UI rendering
  openingBalance?: number; // in Rupees (initial opening balance entered at creation)
  totalNewDues?: number; // in Rupees
  totalCredit: number; // in Rupees (opening + new dues)
  totalPaid: number; // in Rupees
  balance: number; // in Rupees (outstanding amount)
  initialDueReason?: string;
  initialDueDate?: string;
  
  isArchived?: boolean;
  backendId?: string;
  syncStatus?: 'LOCAL' | 'PENDING' | 'SYNCED' | 'FAILED';
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
  lastTransactionAt?: string; // Latest transaction or update ISO timestamp
}

export type TransactionType = 'credit' | 'payment';

/**
 * Dedicated Due Transaction entity for multiple dues per customer
 */
export interface DueTransaction {
  id: string;
  customerId: string;
  customerName?: string;
  amountPaise: number;
  amount: number; // in Rupees
  reason: string;
  transactionDate: string; // ISO date string
  notes?: string;
  createdAt: string; // ISO date string
}

/**
 * Payment record entity
 */
export interface Payment {
  id: string;
  customerId: string;
  customerName?: string;
  amountPaise: number;
  amount: number; // in Rupees
  paymentMethod: string;
  notes?: string;
  paymentDate: string; // ISO date string
  createdAt: string; // ISO date string
}

/**
 * Unified ledger entry for transaction history views
 */
export interface Transaction {
  id: string;
  customerId: string;
  customerName: string;
  type: TransactionType;
  subType?: 'opening' | 'new_due' | 'payment';
  amountPaise?: number;
  amount: number; // in Rupees
  balanceAfterPaise?: number;
  balanceAfter: number; // in Rupees
  reason?: string;
  notes: string;
  paymentMethod?: string;
  paymentDate?: string;
  transactionDate?: string;
  createdAt: string; // ISO date string
}

export interface PaymentMethod {
  id: string;
  label: string;
  icon: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation types
// ─────────────────────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Login: undefined;
  MainTabs: { screen?: keyof MainTabParamList } | undefined;
  AddCustomer: undefined;
  EditCustomer: { customerId: string };
  CustomerDetails: { customerId: string };
  RecordPayment: { customerId: string };
  AddNewDue: { customerId: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Customers: undefined;
  History: undefined;
  Settings: undefined;
};

// ─────────────────────────────────────────────────────────────────────────────
// Form types
// ─────────────────────────────────────────────────────────────────────────────

export interface AddCustomerFormData {
  name: string;
  phone: string;
  address: string;
  openingBalance: string; // in Rupees, converted to paise
  initialDueReason?: string; // required if openingBalance > 0
  initialDueDate?: string; // YYYY-MM-DD
  notes?: string;
}

export interface EditCustomerFormData {
  name: string;
  phone: string;
  address: string;
  notes?: string;
}

export interface RecordPaymentFormData {
  amount: string; // in Rupees
  paymentMethod: string;
  notes: string;
}

export interface AddNewDueFormData {
  amount: string; // in Rupees
  reason: string;
  transactionDate: string; // YYYY-MM-DD
  notes?: string;
}

export interface AddCreditFormData {
  amount: string;
  notes: string;
}

export interface DashboardSummary {
  totalOutstanding: number; // in Rupees
  totalOutstandingPaise: number;
  totalCollected: number; // in Rupees
  totalCollectedPaise: number;
  totalCustomers: number;
  customersWithBalance: number;
  recentTransactions: Transaction[];
  totalCollectedToday: number;
}
