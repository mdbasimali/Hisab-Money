let Linking: any = null;
let Platform: any = { OS: 'android' };
try {
  const RN = require('react-native');
  Linking = RN.Linking;
  Platform = RN.Platform;
} catch (e) {
  Linking = {
    openURL: async () => {},
    canOpenURL: async () => true,
  };
}

let ExpoSMS: any = null;
try {
  ExpoSMS = require('expo-sms');
} catch (e) {}

export type SmsTemplateType = 'REMINDER' | 'PAYMENT_RECEIVED' | 'DUE_ADDED' | 'CUSTOM';

export interface SmsMessageParams {
  type: SmsTemplateType;
  customerName: string;
  phoneNumber?: string | null;
  outstandingBalanceRupees: number;
  transactionAmountRupees?: number;
  customMessage?: string;
}

export class SmsService {
  /**
   * Check if native SMS is available on this device
   */
  static async isAvailableAsync(): Promise<boolean> {
    try {
      if (ExpoSMS && typeof ExpoSMS.isAvailableAsync === 'function') {
        return await ExpoSMS.isAvailableAsync();
      }
      return Platform.OS === 'android' || Platform.OS === 'ios';
    } catch {
      return false;
    }
  }

  /**
   * Formats a clean Indian mobile number, removing non-digits and validating length
   */
  static sanitizePhoneNumber(phone: string | null | undefined): { valid: boolean; formatted: string; error?: string } {
    if (!phone || !phone.trim()) {
      return { valid: false, formatted: '', error: 'Customer has no phone number saved.' };
    }

    const digitsOnly = phone.replace(/[^0-9+]/g, '').trim();
    if (digitsOnly.length < 10) {
      return { valid: false, formatted: digitsOnly, error: 'Phone number must have at least 10 digits.' };
    }

    return { valid: true, formatted: digitsOnly };
  }

  /**
   * Build pre-filled text for each template type with real customer & balance data
   */
  static buildMessage(params: SmsMessageParams): string {
    const formattedBalance = `₹${params.outstandingBalanceRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    const formattedTxn = params.transactionAmountRupees
      ? `₹${params.transactionAmountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      : '₹0.00';

    switch (params.type) {
      case 'REMINDER':
        return `Hello ${params.customerName}, your outstanding balance is ${formattedBalance}. Please clear your dues at your convenience. Thank you. — Hisab Money`;

      case 'PAYMENT_RECEIVED':
        return `Hello ${params.customerName}, we received your payment of ${formattedTxn}. Your updated outstanding balance is ${formattedBalance}. Thank you. — Hisab Money`;

      case 'DUE_ADDED':
        return `Hello ${params.customerName}, ${formattedTxn} has been added to your account. Your current outstanding balance is ${formattedBalance}. Please contact us if you have any questions. — Hisab Money`;

      case 'CUSTOM':
        return params.customMessage?.trim() || `Hello ${params.customerName}, regarding your account at Hisab Money...`;

      default:
        return `Hello ${params.customerName}, your balance is ${formattedBalance}. Thank you. — Hisab Money`;
    }
  }

  /**
   * Build automatic message for ANY transaction dynamically.
   * Automatically detects transaction type (Payment vs Due/Credit/Opening/Other),
   * populates customer name, selected transaction amount, and latest outstanding balance.
   */
  static buildMessageForTransaction(params: {
    customerName: string;
    outstandingBalanceRupees: number;
    transaction?: any | null;
  }): string {
    if (!params.transaction) {
      return this.buildMessage({
        type: 'REMINDER',
        customerName: params.customerName,
        outstandingBalanceRupees: params.outstandingBalanceRupees,
      });
    }

    const tx = params.transaction;
    const amountRupees =
      tx.amount !== undefined
        ? tx.amount
        : tx.amountPaise !== undefined
        ? tx.amountPaise / 100
        : 0;

    if (tx.type === 'payment') {
      return this.buildMessage({
        type: 'PAYMENT_RECEIVED',
        customerName: params.customerName,
        outstandingBalanceRupees: params.outstandingBalanceRupees,
        transactionAmountRupees: amountRupees,
      });
    }

    // Default for credit, new_due, opening balance, or any other transaction
    return this.buildMessage({
      type: 'DUE_ADDED',
      customerName: params.customerName,
      outstandingBalanceRupees: params.outstandingBalanceRupees,
      transactionAmountRupees: amountRupees,
    });
  }

  /**
   * Opens native Android SMS composer with prefilled recipient and message.
   * Gives shop owner full control to review before sending.
   */
  static async openSmsComposer(
    phoneNumber: string,
    message: string
  ): Promise<{ success: boolean; result?: string; error?: string }> {
    const phoneCheck = this.sanitizePhoneNumber(phoneNumber);
    if (!phoneCheck.valid) {
      return { success: false, error: phoneCheck.error };
    }

    try {
      if (ExpoSMS && typeof ExpoSMS.sendSMSAsync === 'function') {
        const isAvail = await ExpoSMS.isAvailableAsync();
        if (isAvail) {
          const res = await ExpoSMS.sendSMSAsync([phoneCheck.formatted], message);
          return { success: true, result: res.result };
        }
      }

      // Fallback via standard tel/sms uri protocol
      const separator = Platform.OS === 'ios' ? '&' : '?';
      const url = `sms:${phoneCheck.formatted}${separator}body=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return { success: true, result: 'opened_via_uri' };
      }

      return {
        success: false,
        error: 'Unable to open SMS application on this device. Please check phone permissions.',
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to open SMS composer.',
      };
    }
  }
}
