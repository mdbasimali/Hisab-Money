import { Platform, NativeModules } from 'react-native';
import { AuthService } from './authService';

/**
 * Extracts the host IP from React Native's Metro packager bundle URL
 * This allows physical devices connected to Metro to automatically connect to the backend
 * without manual configuration changes when DHCP assigns a new local IP.
 */
export function getDevServerHost(): string | null {
  try {
    const scriptURL = (NativeModules as any)?.SourceCode?.scriptURL;
    if (typeof scriptURL === 'string') {
      const match = scriptURL.match(/^https?:\/\/([^:/]+)/i);
      if (match && match[1] && match[1] !== 'localhost' && match[1] !== '127.0.0.1') {
        return match[1];
      }
    }
  } catch {
    // Ignore error
  }
  return null;
}

/**
 * Resolves the Hisab Khata backend API base URL
 * Configuration priority:
 * 1. process.env.EXPO_PUBLIC_API_URL (with automatic host IP adaptation in dev)
 * 2. Active Metro dev server host (if on physical device)
 * 3. Default fallback based on platform (Android emulator uses 10.0.2.2, iOS / Web uses localhost)
 */
export function getApiBaseUrl(): string {
  // Production override
  if (process.env.NODE_ENV === 'production') {
    return 'https://hisab-money.onrender.com';
  }
  const devHost = getDevServerHost();

  if (process.env.EXPO_PUBLIC_API_URL) {
    const configuredUrl = process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
    // If running in development and devHost is detected, check if configured URL uses a local LAN IP
    if (devHost && configuredUrl.includes('://')) {
      try {
        const match = configuredUrl.match(/^(https?:\/\/)([^:/]+)(.*)$/i);
        if (match) {
          const proto = match[1];
          const host = match[2];
          const rest = match[3];
          // If the configured URL is a local LAN IP (e.g. 192.168.x.x, 10.x.x.x), align with active Metro host
          if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) {
            return `${proto}${devHost}${rest}`;
          }
        }
      } catch {
        // Fall back to configuredUrl
      }
    }
    return configuredUrl;
  }

  if (devHost) {
    return `http://${devHost}:5000`;
  }

  // Development defaults:
  // Android Emulator maps host machine's 127.0.0.1 to 10.0.2.2
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000';
  }

  // Local development fallback
  return 'http://localhost:5000';
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  details?: any;
}

export class ApiService {
  /**
   * Universal fetch wrapper with timeout, JWT attachment, and error handling
   */
  private static async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = 10000
  ): Promise<ApiResponse<T>> {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Retrieve active JWT from secure storage
    const token = await AuthService.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : { 'x-dev-user-id': 'dev-user-1' }),
      ...((options.headers as Record<string, string>) || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers,
      });

      clearTimeout(timeout);

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const body = await response.json();
        return body;
      }

      return {
        success: response.ok,
        message: await response.text(),
      };
    } catch (err: any) {
      clearTimeout(timeout);
      return {
        success: false,
        error: err.name === 'AbortError' ? 'NETWORK_TIMEOUT' : 'NETWORK_ERROR',
        message: err.message || 'Network request failed',
      };
    }
  }

  // ─── Authentication ────────────────────────────────────────────────────────

  static async googleLogin(idToken: string): Promise<ApiResponse<{ token: string; user: any }>> {
    return this.request('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
  }

  static async getMe(): Promise<ApiResponse<any>> {
    return this.request('/api/auth/me', { method: 'GET' });
  }

  // ─── Health & Status ───────────────────────────────────────────────────────

  static async checkHealth(): Promise<boolean> {
    try {
      const res = await this.request<any>('/api/health', { method: 'GET' }, 4000);
      if (res.success === true || (res as any).status === 'healthy') {
        return true;
      }
    } catch {
      // Continue to devHost fallback
    }

    // Direct fallback to devHost if available
    const devHost = getDevServerHost();
    if (devHost) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(`http://${devHost}:5000/api/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const body = await res.json();
          return body?.status === 'healthy' || body?.success === true;
        }
      } catch {
        // Fallback failed
      }
    }

    return false;
  }

  static async getSyncStatus(): Promise<ApiResponse<any>> {
    return this.request('/api/sync/status', { method: 'GET' });
  }

  // ─── Customers ─────────────────────────────────────────────────────────────

  static async getCustomers(includeArchived = false): Promise<ApiResponse<any[]>> {
    return this.request(`/api/customers?includeArchived=${includeArchived}`, { method: 'GET' });
  }

  static async getCustomerById(id: string): Promise<ApiResponse<any>> {
    return this.request(`/api/customers/${id}`, { method: 'GET' });
  }

  static async createCustomer(payload: {
    localId?: string;
    name: string;
    phone?: string;
    address?: string;
    notes?: string;
    openingBalancePaise?: number;
    initialDueReason?: string;
    initialDueDate?: string;
  }): Promise<ApiResponse<any>> {
    return this.request('/api/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async updateCustomer(
    id: string,
    payload: {
      name?: string;
      phone?: string;
      address?: string;
      notes?: string;
      isArchived?: boolean;
    }
  ): Promise<ApiResponse<any>> {
    return this.request(`/api/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  // ─── Dues & Payments ───────────────────────────────────────────────────────

  static async createDue(
    customerId: string,
    payload: {
      clientTransactionId?: string;
      amountPaise: number;
      reason: string;
      transactionDate?: string;
      notes?: string;
    }
  ): Promise<ApiResponse<any>> {
    return this.request(`/api/customers/${customerId}/dues`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async createPayment(
    customerId: string,
    payload: {
      clientTransactionId?: string;
      amountPaise: number;
      paymentMethod?: string;
      paymentDate?: string;
      notes?: string;
    }
  ): Promise<ApiResponse<any>> {
    return this.request(`/api/customers/${customerId}/payments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async getCustomerTransactions(customerId: string): Promise<ApiResponse<any[]>> {
    return this.request(`/api/customers/${customerId}/transactions`, { method: 'GET' });
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  static async getDashboardSummary(): Promise<ApiResponse<any>> {
    return this.request('/api/dashboard/summary', { method: 'GET' });
  }

  // ─── Batch Sync ────────────────────────────────────────────────────────────

  static async syncBatch(items: any[]): Promise<ApiResponse<any>> {
    return this.request('/api/sync/batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  }
}
