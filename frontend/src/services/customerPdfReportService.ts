import { Customer, Transaction } from '../types';
import { paiseToRupees } from '../utils/currency';
import { formatINR } from '../utils/formatters';

let Print: any = null;
let Sharing: any = null;

try {
  Print = require('expo-print');
} catch (e) {}

try {
  Sharing = require('expo-sharing');
} catch (e) {}

export type CustomerPdfDateFilter = 'all' | 'this_month' | 'custom';

export interface CustomerPdfOptions {
  filter: CustomerPdfDateFilter;
  customStartDate?: Date;
  customEndDate?: Date;
  businessName?: string;
}

export interface CustomerLedgerRow {
  index: number;
  dateStr: string;
  timeStr: string;
  typeLabel: string;
  isDue: boolean;
  description: string;
  paymentMethod?: string;
  amountPaise: number;
  runningBalancePaise: number;
}

export interface ProcessedCustomerLedger {
  customer: Customer;
  periodLabel: string;
  generatedDateStr: string;
  generatedTimeStr: string;
  periodOpeningPaise: number;
  periodDuesPaise: number;
  periodPaidPaise: number;
  closingBalancePaise: number;
  isCleared: boolean;
  rows: CustomerLedgerRow[];
}

export class CustomerPdfReportService {
  /**
   * Filter and compute running balance chronologically using integer paise
   */
  static processLedgerData(
    customer: Customer,
    transactions: Transaction[],
    options: CustomerPdfOptions
  ): ProcessedCustomerLedger {
    const now = new Date();

    // 1. Determine date filter boundaries
    let start: Date | null = null;
    let end: Date | null = null;
    let periodLabel = 'All Time';

    if (options.filter === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      const monthName = start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      periodLabel = `This Month (${monthName})`;
    } else if (options.filter === 'custom' && options.customStartDate && options.customEndDate) {
      start = new Date(
        options.customStartDate.getFullYear(),
        options.customStartDate.getMonth(),
        options.customStartDate.getDate(),
        0,
        0,
        0,
        0
      );
      end = new Date(
        options.customEndDate.getFullYear(),
        options.customEndDate.getMonth(),
        options.customEndDate.getDate(),
        23,
        59,
        59,
        999
      );
      const startStr = start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const endStr = end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      periodLabel = `${startStr} – ${endStr}`;
    }

    // 2. Sort all transactions chronologically ascending (oldest first)
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    let runningPaise = 0;
    let periodOpeningPaise = 0;
    let periodDuesPaise = 0;
    let periodPaidPaise = 0;
    const rows: CustomerLedgerRow[] = [];

    for (const t of sorted) {
      const tDate = new Date(t.createdAt);
      const tTime = tDate.getTime();
      const isDue = t.type === 'credit';
      const amountPaise = t.amountPaise ?? Math.round((t.amount || 0) * 100);

      // Prior to period start
      if (start && tTime < start.getTime()) {
        if (isDue) {
          runningPaise += amountPaise;
        } else {
          runningPaise -= amountPaise;
        }
        periodOpeningPaise = runningPaise;
        continue;
      }

      // After period end
      if (end && tTime > end.getTime()) {
        continue;
      }

      // Within period
      if (isDue) {
        runningPaise += amountPaise;
        periodDuesPaise += amountPaise;
      } else {
        runningPaise -= amountPaise;
        periodPaidPaise += amountPaise;
      }

      const dateStr = tDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const timeStr = tDate.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      let typeLabel = isDue ? 'Due' : 'Payment';
      if (t.subType === 'opening') {
        typeLabel = 'Opening Balance';
      } else if (isDue) {
        typeLabel = 'Due Added';
      } else {
        typeLabel = 'Payment Received';
      }

      rows.push({
        index: rows.length + 1,
        dateStr,
        timeStr,
        typeLabel,
        isDue,
        description: t.reason || t.notes || (isDue ? 'Due Transaction' : 'Payment'),
        paymentMethod: t.paymentMethod,
        amountPaise,
        runningBalancePaise: runningPaise,
      });
    }

    const closingBalancePaise = runningPaise;
    const isCleared = closingBalancePaise <= 0;

    return {
      customer,
      periodLabel,
      generatedDateStr: now.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      generatedTimeStr: now.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      periodOpeningPaise,
      periodDuesPaise,
      periodPaidPaise,
      closingBalancePaise,
      isCleared,
      rows,
    };
  }

  /**
   * Generates clean, professional print-ready HTML template
   */
  static generateCustomerReportHtml(
    data: ProcessedCustomerLedger,
    businessName: string = 'Hisab Money'
  ): string {
    const {
      customer,
      periodLabel,
      generatedDateStr,
      generatedTimeStr,
      periodOpeningPaise,
      periodDuesPaise,
      periodPaidPaise,
      closingBalancePaise,
      isCleared,
      rows,
    } = data;

    const openingRupees = paiseToRupees(periodOpeningPaise).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
    });
    const duesRupees = paiseToRupees(periodDuesPaise).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
    });
    const paidRupees = paiseToRupees(periodPaidPaise).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
    });
    const closingRupees = paiseToRupees(Math.abs(closingBalancePaise)).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
    });

    const rowsHtml = rows
      .map((r) => {
        const amtStr = paiseToRupees(r.amountPaise).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
        });
        const balStr = paiseToRupees(r.runningBalancePaise).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
        });
        const isBalZero = r.runningBalancePaise === 0;

        return `
          <tr>
            <td style="text-align: center; color: #64748b; font-size: 11px;">${r.index}</td>
            <td>
              <div style="font-weight: 600; color: #0f172a; font-size: 12px;">${r.dateStr}</div>
              <div style="font-size: 10px; color: #64748b;">${r.timeStr}</div>
            </td>
            <td>
              <span class="badge ${r.isDue ? 'badge-due' : 'badge-paid'}">${escapeHtml(r.typeLabel)}</span>
            </td>
            <td>
              <div style="font-size: 12px; font-weight: 500; color: #1e293b;">${escapeHtml(r.description)}</div>
              ${
                r.paymentMethod
                  ? `<span class="badge-method">${escapeHtml(r.paymentMethod.toUpperCase())}</span>`
                  : ''
              }
            </td>
            <td style="text-align: right; font-weight: 600; color: ${r.isDue ? '#ea580c' : '#16a34a'}; font-size: 12px;">
              ${r.isDue ? '+' : '-'}₹${amtStr}
            </td>
            <td style="text-align: right; font-weight: 700; color: ${isBalZero ? '#16a34a' : '#0f172a'}; font-size: 12px;">
              ₹${balStr}
            </td>
          </tr>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ledger Statement - ${escapeHtml(customer.name)}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 14mm 12mm 14mm 12mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Bengali', Helvetica, Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 0;
            background: #ffffff;
            font-size: 12px;
            line-height: 1.4;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #16a34a;
            padding-bottom: 12px;
            margin-bottom: 14px;
          }
          .brand-col {
            flex: 1;
          }
          .brand-title {
            font-size: 22px;
            font-weight: 800;
            color: #16a34a;
            letter-spacing: -0.5px;
          }
          .brand-subtitle {
            font-size: 11px;
            color: #64748b;
            font-weight: 500;
            margin-top: 2px;
          }
          .meta-col {
            text-align: right;
            font-size: 11px;
            color: #475569;
          }
          .period-badge {
            display: inline-block;
            background: #ecfdf5;
            color: #16a34a;
            border: 1px solid #a7f3d0;
            padding: 3px 8px;
            border-radius: 4px;
            font-weight: 600;
            font-size: 11px;
            margin-top: 4px;
          }
          .customer-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px 14px;
            margin-bottom: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .cust-title {
            font-size: 16px;
            font-weight: 700;
            color: #0f172a;
          }
          .cust-phone {
            font-size: 12px;
            color: #334155;
            font-weight: 600;
            margin-top: 2px;
          }
          .cust-meta {
            font-size: 11px;
            color: #64748b;
            margin-top: 3px;
          }
          .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 6px;
            font-weight: 700;
            font-size: 12px;
            text-align: center;
          }
          .status-cleared {
            background: #dcfce7;
            color: #15803d;
            border: 1px solid #86efac;
          }
          .status-pending {
            background: #fee2e2;
            color: #b91c1c;
            border: 1px solid #fca5a5;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 16px;
          }
          .kpi-card {
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 8px 10px;
          }
          .kpi-label {
            font-size: 9px;
            text-transform: uppercase;
            font-weight: 700;
            color: #64748b;
            letter-spacing: 0.5px;
          }
          .kpi-val {
            font-size: 15px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 2px;
          }
          .kpi-val.due { color: #ea580c; }
          .kpi-val.paid { color: #16a34a; }
          .kpi-val.outstanding { color: ${isCleared ? '#16a34a' : '#dc2626'}; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
          tr {
            page-break-inside: avoid;
          }
          th {
            background: #f1f5f9;
            color: #334155;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 8px 6px;
            border-bottom: 1.5px solid #cbd5e1;
            text-align: left;
          }
          td {
            padding: 8px 6px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: middle;
          }
          tr:nth-child(even) td {
            background-color: #fafbfc;
          }
          .badge {
            display: inline-block;
            font-size: 10px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
          }
          .badge-due {
            background: #ffedd5;
            color: #c2410c;
          }
          .badge-paid {
            background: #dcfce7;
            color: #15803d;
          }
          .badge-method {
            display: inline-block;
            font-size: 9px;
            font-weight: 600;
            color: #475569;
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            padding: 1px 4px;
            border-radius: 3px;
            margin-top: 2px;
          }
          .footer {
            margin-top: 24px;
            padding-top: 8px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #94a3b8;
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header">
          <div class="brand-col">
            <div class="brand-title">${escapeHtml(businessName)}</div>
            <div class="brand-subtitle">Customer Account Ledger & Payment History</div>
          </div>
          <div class="meta-col">
            <div><strong>Generated:</strong> ${generatedDateStr} at ${generatedTimeStr}</div>
            <div class="period-badge">Period: ${escapeHtml(periodLabel)}</div>
          </div>
        </div>

        <!-- Customer Profile Info -->
        <div class="customer-card">
          <div>
            <div class="cust-title">${escapeHtml(customer.name)}</div>
            <div class="cust-phone">${customer.phone ? `+91 ${escapeHtml(customer.phone)}` : 'No phone number'}</div>
            ${customer.address ? `<div class="cust-meta">📍 ${escapeHtml(customer.address)}</div>` : ''}
            ${customer.notes ? `<div class="cust-meta">📝 ${escapeHtml(customer.notes)}</div>` : ''}
          </div>
          <div>
            <div class="status-badge ${isCleared ? 'status-cleared' : 'status-pending'}">
              ${isCleared ? '✓ ALL CLEARED' : '⚠ DUE PENDING'}
            </div>
          </div>
        </div>

        <!-- Financial Summary Cards -->
        <div class="summary-grid">
          <div class="kpi-card">
            <div class="kpi-label">Opening Balance</div>
            <div class="kpi-val">₹${openingRupees}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Total New Dues</div>
            <div class="kpi-val due">+₹${duesRupees}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Total Payments</div>
            <div class="kpi-val paid">-₹${paidRupees}</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Outstanding Due</div>
            <div class="kpi-val outstanding">₹${closingRupees}</div>
          </div>
        </div>

        <!-- Ledger Table -->
        <table>
          <thead>
            <tr>
              <th style="width: 25px; text-align: center;">#</th>
              <th style="width: 90px;">Date & Time</th>
              <th style="width: 105px;">Type</th>
              <th>Description / Reason</th>
              <th style="text-align: right; width: 85px;">Amount</th>
              <th style="text-align: right; width: 95px;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${
              rowsHtml ||
              `<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 24px;">No transactions recorded for the selected period.</td></tr>`
            }
          </tbody>
          <tfoot>
            <tr style="background: #f1f5f9; font-weight: 700;">
              <td colspan="4" style="text-align: right; font-size: 11px; text-transform: uppercase;">
                Period Statement Totals:
              </td>
              <td style="text-align: right; font-size: 11px; color: ${isCleared ? '#16a34a' : '#ea580c'};">
                ${isCleared ? 'Cleared' : `+₹${duesRupees}`}
              </td>
              <td style="text-align: right; font-size: 12px; color: ${isCleared ? '#16a34a' : '#dc2626'};">
                ₹${closingRupees}
              </td>
            </tr>
          </tfoot>
        </table>

        <!-- Footer -->
        <div class="footer">
          <div>Hisab Money • Official Digital Account Statement • Offline-First Persistence</div>
          <div>Confidential • Personal Business Records</div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generates PDF file on device.
   * STRICT OFFLINE GUARANTEE: Never sends customer data over network.
   */
  static async generateCustomerPdf(
    customer: Customer,
    transactions: Transaction[],
    options: CustomerPdfOptions
  ): Promise<{ uri: string; base64?: string; numberOfPages?: number }> {
    if (!Print || typeof Print.printToFileAsync !== 'function') {
      throw new Error('PDF generation is not available in this environment.');
    }

    const data = this.processLedgerData(customer, transactions, options);
    const html = this.generateCustomerReportHtml(data, options.businessName || 'Hisab Money');

    const result = await Print.printToFileAsync({
      html,
      base64: false,
    });

    return {
      uri: result.uri,
      numberOfPages: result.numberOfPages,
    };
  }

  /**
   * Share/Save PDF using native Android share sheet
   */
  static async shareCustomerPdf(uri: string, customerName: string): Promise<void> {
    if (Sharing && typeof Sharing.isAvailableAsync === 'function') {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Hisab Money — Ledger Report (${customerName})`,
          UTI: 'com.adobe.pdf',
        });
        return;
      }
    }
    throw new Error('Sharing is not supported on this platform.');
  }

  /**
   * Print PDF directly using native print service
   */
  static async printCustomerPdf(uri: string): Promise<void> {
    if (Print && typeof Print.printAsync === 'function') {
      await Print.printAsync({ uri });
      return;
    }
    throw new Error('Printing is not supported on this platform.');
  }
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
