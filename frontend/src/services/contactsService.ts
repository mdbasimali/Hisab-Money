import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Contacts from 'expo-contacts/legacy';

const ONBOARDING_SEEN_KEY = 'hisab_money_contacts_onboarding_seen';

export interface PhoneContactNumber {
  label: string;
  number: string; // Cleaned 10-digit Indian number or sanitized number
  rawNumber: string; // Original number as stored in address book
}

export interface PhoneContact {
  id: string;
  name: string;
  phoneNumbers: PhoneContactNumber[];
}

export type ContactsPermissionStatus = 'granted' | 'denied' | 'undetermined';

export class ContactsService {
  private static cachedContacts: PhoneContact[] | null = null;
  private static cacheTimestamp = 0;
  private static CACHE_TTL_MS = 60000; // 1 minute in-memory cache

  /**
   * Normalize any Indian phone number representation:
   * +91 98765 43210 -> 9876543210
   * 09876543210 -> 9876543210
   * 919876543210 -> 9876543210
   * 9876543210 -> 9876543210
   */
  static normalizePhoneNumber(rawNumber: string): string {
    if (!rawNumber) return '';
    // Strip non-digits
    const digitsOnly = rawNumber.replace(/\D/g, '');

    // Case 1: 12 digits starting with 91 (e.g. 919876543210)
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      const candidate = digitsOnly.slice(2);
      if (/^[6-9]\d{9}$/.test(candidate)) {
        return candidate;
      }
    }

    // Case 2: 11 digits starting with 0 (e.g. 09876543210)
    if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      const candidate = digitsOnly.slice(1);
      if (/^[6-9]\d{9}$/.test(candidate)) {
        return candidate;
      }
    }

    // Case 3: Exactly 10 digits (e.g. 9876543210)
    if (digitsOnly.length === 10) {
      return digitsOnly;
    }

    // Case 4: More than 10 digits, extract last 10 if it looks like a mobile number
    if (digitsOnly.length > 10) {
      const last10 = digitsOnly.slice(-10);
      if (/^[6-9]\d{9}$/.test(last10)) {
        return last10;
      }
    }

    return digitsOnly;
  }

  /**
   * Format phone number cleanly for UI presentation
   */
  static formatPhoneNumberDisplay(number: string): string {
    const clean = this.normalizePhoneNumber(number);
    if (clean.length === 10) {
      return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
    }
    return number;
  }

  /**
   * Check whether onboarding explanation modal has already been seen
   */
  static async hasSeenOnboarding(): Promise<boolean> {
    try {
      if (Platform.OS === 'web' || !SecureStore?.getItemAsync) {
        return false;
      }
      const val = await SecureStore.getItemAsync(ONBOARDING_SEEN_KEY);
      return val === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Record that onboarding explanation modal has been viewed / handled
   */
  static async setOnboardingSeen(seen = true): Promise<void> {
    try {
      if (Platform.OS === 'web' || !SecureStore?.setItemAsync) {
        return;
      }
      if (seen) {
        await SecureStore.setItemAsync(ONBOARDING_SEEN_KEY, 'true');
      } else {
        await SecureStore.deleteItemAsync(ONBOARDING_SEEN_KEY);
      }
    } catch (e) {
      console.warn('[ContactsService] Failed to persist onboarding status:', e);
    }
  }

  /**
   * Check existing Contacts permission without prompting user
   */
  static async checkPermission(): Promise<ContactsPermissionStatus> {
    try {
      if (Platform.OS === 'web') return 'denied';
      const { status } = await Contacts.getPermissionsAsync();
      if (status === 'granted') return 'granted';
      if (status === 'denied') return 'denied';
      return 'undetermined';
    } catch (e) {
      console.warn('[ContactsService] checkPermission error:', e);
      return 'undetermined';
    }
  }

  /**
   * Request native Contacts permission dialog
   */
  static async requestPermission(): Promise<ContactsPermissionStatus> {
    try {
      if (Platform.OS === 'web') return 'denied';
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') return 'granted';
      if (status === 'denied') return 'denied';
      return 'undetermined';
    } catch (e) {
      console.warn('[ContactsService] requestPermission error:', e);
      return 'denied';
    }
  }

  /**
   * Invalidate in-memory cache
   */
  static clearCache(): void {
    this.cachedContacts = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Read contacts locally on device into memory.
   * STRICT PRIVACY GUARANTEE: Never written to database, disk, or network.
   */
  static async getLocalContacts(forceRefresh = false): Promise<PhoneContact[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedContacts && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cachedContacts;
    }

    try {
      const permission = await this.checkPermission();
      if (permission !== 'granted') {
        return [];
      }

      const response = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        sort: Contacts.SortTypes.FirstName,
      });

      if (!response || !response.data) {
        return [];
      }

      const parsed: PhoneContact[] = [];

      for (const item of response.data) {
        const contactName = (item.name || `${item.firstName || ''} ${item.lastName || ''}`).trim();
        if (!contactName) continue;

        if (!item.phoneNumbers || item.phoneNumbers.length === 0) continue;

        const numbers: PhoneContactNumber[] = [];
        const seenNumbers = new Set<string>();

        for (const p of item.phoneNumbers) {
          if (!p.number) continue;
          const clean = this.normalizePhoneNumber(p.number);
          if (!clean || seenNumbers.has(clean)) continue;

          seenNumbers.add(clean);
          numbers.push({
            label: p.label || 'mobile',
            number: clean,
            rawNumber: p.number,
          });
        }

        if (numbers.length > 0) {
          parsed.push({
            id: item.id || `c-${Math.random().toString(36).substring(2, 9)}`,
            name: contactName,
            phoneNumbers: numbers,
          });
        }
      }

      // Sort alphabetically by name
      parsed.sort((a, b) => a.name.localeCompare(b.name));

      this.cachedContacts = parsed;
      this.cacheTimestamp = now;

      return parsed;
    } catch (e) {
      console.warn('[ContactsService] getLocalContacts error:', e);
      return [];
    }
  }

  /**
   * Search contacts by name or phone number
   */
  static async searchContacts(query: string): Promise<PhoneContact[]> {
    const all = await this.getLocalContacts();
    const trimmed = query.trim().toLowerCase();

    if (!trimmed) {
      // Return top 25 recent / alphabetical contacts when search is opened without filter
      return all.slice(0, 25);
    }

    const queryDigits = trimmed.replace(/\D/g, '');
    const cleanQuery =
      queryDigits.startsWith('91') && queryDigits.length > 2
        ? queryDigits.slice(2)
        : queryDigits.startsWith('0') && queryDigits.length > 1
        ? queryDigits.slice(1)
        : queryDigits;

    return all.filter((c) => {
      // Name match
      if (c.name.toLowerCase().includes(trimmed)) {
        return true;
      }

      // Phone match
      if (queryDigits.length > 0) {
        for (const p of c.phoneNumbers) {
          const rawDigits = p.rawNumber.replace(/\D/g, '');
          if (
            p.number.includes(queryDigits) ||
            (cleanQuery.length > 0 && p.number.includes(cleanQuery)) ||
            rawDigits.includes(queryDigits)
          ) {
            return true;
          }
        }
      }

      return false;
    });
  }
}
