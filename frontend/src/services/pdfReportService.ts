import { BackupSnapshot } from './backupService';
import { calculateBalances, paiseToRupees } from '../utils/currency';

let Print: any = null;
let Sharing: any = null;

try {
  Print = require('expo-print');
} catch (e) {}

try {
  Sharing = require('expo-sharing');
} catch (e) {}

try {
  FileSystem = require('expo-file-system');
} catch (e) {}

export interface ReportGenerationResult {
  uri: string;
  base64?: string;
  numberOfPages?: number;
}

export class PdfReportService {
  /**
   * Generates clean HTML template for Hisab Money Backup Report
   */
  static generateReportHtml(snapshot: BackupSnapshot): string {
    const creationDate = new Date(snapshot.createdAt);
    const formattedDate = creationDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const formattedTime = creationDate.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const customers = snapshot.data.customers || [];
    const dues = snapshot.data.dues || [];
    const payments = snapshot.data.payments || [];

    // Calculate customer summaries & aggregate totals
    let grandTotalOpeningPaise = 0;
    let grandTotalDuesPaise = 0;
    let grandTotalPaidPaise = 0;
    let grandTotalOutstandingPaise = 0;

    const customerRows = customers.map((c, index) => {
      const custDues = dues.filter((d) => d.customer_id === c.id);
      const custPayments = payments.filter((p) => p.customer_id === c.id);

      const totalDuesPaise = custDues.reduce((sum, d) => sum + (d.amount_paise || 0), 0);
      const totalPaidPaise = custPayments.reduce((sum, p) => sum + (p.amount_paise || 0), 0);
      const balance = calculateBalances(c.opening_balance_paise, totalPaidPaise, totalDuesPaise);

      grandTotalOpeningPaise += c.opening_balance_paise || 0;
      grandTotalDuesPaise += totalDuesPaise;
      grandTotalPaidPaise += totalPaidPaise;
      grandTotalOutstandingPaise += balance.remainingBalancePaise;

      return `
        <tr>
          <td style="text-align: center; color: #64748b; font-size: 11px;">${index + 1}</td>
          <td>
            <div style="font-weight: 600; color: #0f172a; font-size: 13px;">${escapeHtml(c.name)}</div>
            ${c.address ? `<div style="font-size: 10px; color: #64748b;">${escapeHtml(c.address)}</div>` : ''}
          </td>
          <td style="font-family: monospace; font-size: 11px; color: #334155;">${c.phone ? escapeHtml(c.phone) : '—'}</td>
          <td style="text-align: right; font-size: 12px; color: #475569;">₹${paiseToRupees(c.opening_balance_paise).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td style="text-align: right; font-size: 12px; color: #ea580c; font-weight: 500;">+₹${paiseToRupees(totalDuesPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td style="text-align: right; font-size: 12px; color: #16a34a; font-weight: 500;">-₹${paiseToRupees(totalPaidPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td style="text-align: right; font-size: 13px; font-weight: 700; color: ${balance.remainingBalancePaise > 0 ? '#dc2626' : '#16a34a'};">
            ₹${balance.remainingBalanceRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </td>
        </tr>
      `;
    }).join('');

    // Recent Transactions (up to 50 latest)
    const combinedTxns = [
      ...dues.map((d) => ({
        id: d.id,
        date: d.transaction_date || d.created_at,
        type: 'DUE',
        amount: d.amount_paise,
        customerId: d.customer_id,
        desc: d.reason || 'Due Transaction',
      })),
      ...payments.map((p) => ({
        id: p.id,
        date: p.payment_date || p.created_at,
        type: 'PAYMENT',
        amount: p.amount_paise,
        customerId: p.customer_id,
        desc: `Payment (${p.payment_method || 'Cash'})`,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const customerMap = new Map<string, string>();
    customers.forEach((c) => customerMap.set(c.id, c.name));

    const txnRows = combinedTxns.slice(0, 50).map((txn) => {
      const custName = customerMap.get(txn.customerId) || 'Unknown Customer';
      const isDue = txn.type === 'DUE';
      const d = new Date(txn.date);
      const isDateOnly = typeof txn.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(txn.date.trim());
      const txnDate = isNaN(d.getTime())
        ? txn.date
        : isDateOnly
        ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
      return `
        <tr>
          <td style="font-size: 11px; color: #64748b;">${txnDate}</td>
          <td style="font-size: 12px; font-weight: 500; color: #0f172a;">${escapeHtml(custName)}</td>
          <td style="font-size: 11px; color: #475569;">${escapeHtml(txn.desc)}</td>
          <td style="text-align: right; font-size: 12px; font-weight: 600; color: ${isDue ? '#ea580c' : '#16a34a'};">
            ${isDue ? '+' : '-'}₹${paiseToRupees(txn.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Hisab Money — Backup Report</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 15mm 12mm 15mm 12mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
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
            align-items: center;
            border-bottom: 2px solid #16a34a;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .brand-title {
            font-size: 24px;
            font-weight: 800;
            color: #16a34a;
            letter-spacing: -0.5px;
          }
          .brand-subtitle {
            font-size: 12px;
            color: #64748b;
            font-weight: 500;
          }
          .report-meta {
            text-align: right;
            font-size: 11px;
            color: #475569;
          }
          .meta-badge {
            display: inline-block;
            background: #f1f5f9;
            color: #334155;
            padding: 3px 8px;
            border-radius: 4px;
            font-weight: 600;
            margin-top: 4px;
            border: 1px solid #e2e8f0;
          }
          .summary-cards {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 20px;
          }
          .card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px 12px;
          }
          .card-label {
            font-size: 10px;
            text-transform: uppercase;
            font-weight: 600;
            color: #64748b;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .card-value {
            font-size: 16px;
            font-weight: 700;
            color: #0f172a;
          }
          .card-value.highlight {
            color: #dc2626;
          }
          .card-value.success {
            color: #16a34a;
          }
          .section-title {
            font-size: 14px;
            font-weight: 700;
            color: #1e293b;
            margin: 20px 0 8px 0;
            display: flex;
            justify-content: space-between;
            align-items: baseline;
          }
          .section-count {
            font-size: 11px;
            color: #64748b;
            font-weight: normal;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
          }
          th {
            background: #f1f5f9;
            color: #334155;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 8px 6px;
            border-bottom: 1px solid #cbd5e1;
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
          .footer {
            margin-top: 30px;
            padding-top: 10px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #94a3b8;
          }
          .page-break {
            page-break-before: always;
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header">
          <div>
            <div class="brand-title">Hisab Money</div>
            <div class="brand-subtitle">Business Ledger & Financial Backup Report</div>
          </div>
          <div class="report-meta">
            <div><strong>Generated:</strong> ${formattedDate} at ${formattedTime}</div>
            <div class="meta-badge">Verified Official Ledger Report</div>
          </div>
        </div>

        <!-- Summary KPIs -->
        <div class="summary-cards">
          <div class="card">
            <div class="card-label">Total Customers</div>
            <div class="card-value">${customers.length}</div>
          </div>
          <div class="card">
            <div class="card-label">Total Dues Recorded</div>
            <div class="card-value">₹${paiseToRupees(grandTotalDuesPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="card">
            <div class="card-label">Total Payments Received</div>
            <div class="card-value success">₹${paiseToRupees(grandTotalPaidPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="card">
            <div class="card-label">Total Outstanding Balance</div>
            <div class="card-value highlight">₹${paiseToRupees(grandTotalOutstandingPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <!-- Customer Balances Table -->
        <div class="section-title">
          <span>Customer Ledger Summary</span>
          <span class="section-count">${customers.length} Active Accounts</span>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 25px; text-align: center;">#</th>
              <th>Customer Name</th>
              <th style="width: 85px;">Phone</th>
              <th style="text-align: right; width: 75px;">Opening</th>
              <th style="text-align: right; width: 75px;">New Dues</th>
              <th style="text-align: right; width: 75px;">Paid</th>
              <th style="text-align: right; width: 90px;">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            ${customerRows || '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">No customers found in ledger.</td></tr>'}
          </tbody>
          <tfoot>
            <tr style="background: #f1f5f9; font-weight: 700;">
              <td colspan="3" style="text-align: right; font-size: 11px; text-transform: uppercase;">Ledger Totals:</td>
              <td style="text-align: right; font-size: 11px;">₹${paiseToRupees(grandTotalOpeningPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              <td style="text-align: right; font-size: 11px; color: #ea580c;">₹${paiseToRupees(grandTotalDuesPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              <td style="text-align: right; font-size: 11px; color: #16a34a;">₹${paiseToRupees(grandTotalPaidPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              <td style="text-align: right; font-size: 12px; color: #dc2626;">₹${paiseToRupees(grandTotalOutstandingPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>

        <!-- Recent Transactions Table -->
        ${combinedTxns.length > 0 ? `
          <div class="section-title" style="margin-top: 24px;">
            <span>Recent Activity Journal</span>
            <span class="section-count">${Math.min(combinedTxns.length, 50)} Most Recent Transactions</span>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 70px;">Date</th>
                <th style="width: 140px;">Customer</th>
                <th>Description</th>
                <th style="text-align: right; width: 90px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${txnRows}
            </tbody>
          </table>
        ` : ''}

        <!-- Footer -->
        <div class="footer">
          <div>Hisab Money • Safe Offline-First Digital Ledger with Google Cloud Backup</div>
          <div>Confidential • Personal Financial Records</div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generates a PDF file from a BackupSnapshot.
   * Returns file URI and base64 data for upload.
   */
  static async generateReportPdf(snapshot: BackupSnapshot): Promise<ReportGenerationResult> {
    if (!Print || typeof Print.printToFileAsync !== 'function') {
      throw new Error('PDF export is not supported in this environment.');
    }

    const html = this.generateReportHtml(snapshot);
    const result = await Print.printToFileAsync({
      html,
      base64: true,
    });

    return {
      uri: result.uri,
      base64: result.base64,
      numberOfPages: result.numberOfPages,
    };
  }

  /**
   * Opens the native Android share / print sheet to view or print the generated PDF
   */
  static async shareOrViewPdf(uri: string): Promise<void> {
    if (Sharing && typeof Sharing.isAvailableAsync === 'function') {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Hisab Money — Backup Report',
          UTI: 'com.adobe.pdf',
        });
        return;
      }
    }
    throw new Error('Sharing is not supported on this platform.');
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
