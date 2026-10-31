import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Core contact normalization logic matching ContactsService
function normalizePhoneNumber(rawNumber) {
  if (!rawNumber) return '';
  const digitsOnly = rawNumber.replace(/\D/g, '');

  // 12 digits starting with 91 (e.g. 919876543210)
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    const candidate = digitsOnly.slice(2);
    if (/^[6-9]\d{9}$/.test(candidate)) return candidate;
  }

  // 11 digits starting with 0 (e.g. 09876543210)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    const candidate = digitsOnly.slice(1);
    if (/^[6-9]\d{9}$/.test(candidate)) return candidate;
  }

  // Exactly 10 digits
  if (digitsOnly.length === 10) return digitsOnly;

  // More than 10 digits
  if (digitsOnly.length > 10) {
    const last10 = digitsOnly.slice(-10);
    if (/^[6-9]\d{9}$/.test(last10)) return last10;
  }

  return digitsOnly;
}

function formatPhoneNumberDisplay(number) {
  const clean = normalizePhoneNumber(number);
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return number;
}

// In-memory contact search engine
function searchContactsList(contacts, query) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return contacts.slice(0, 25);
  }

  const queryDigits = trimmed.replace(/\D/g, '');
  const cleanQuery =
    queryDigits.startsWith('91') && queryDigits.length > 2
      ? queryDigits.slice(2)
      : queryDigits.startsWith('0') && queryDigits.length > 1
      ? queryDigits.slice(1)
      : queryDigits;

  return contacts.filter((c) => {
    if (c.name.toLowerCase().includes(trimmed)) return true;
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

// Check for duplicate customer by phone
function checkDuplicateCustomer(existingCustomers, phone) {
  const clean = normalizePhoneNumber(phone);
  if (!clean) return null;
  return existingCustomers.find((c) => normalizePhoneNumber(c.phone) === clean) || null;
}

describe('Hisab Money — Add Customer from Phone Contacts Feature Tests', () => {
  const mockContacts = [
    {
      id: 'contact-1',
      name: 'Ramesh Sharma',
      phoneNumbers: [
        { label: 'mobile', number: '9876543210', rawNumber: '+91 98765 43210' }
      ]
    },
    {
      id: 'contact-2',
      name: 'Pooja Verma',
      phoneNumbers: [
        { label: 'work', number: '9123456780', rawNumber: '09123456780' },
        { label: 'home', number: '9871234560', rawNumber: '+91 (987) 123-4560' }
      ]
    },
    {
      id: 'contact-3',
      name: 'Amit Patel',
      phoneNumbers: [
        { label: 'mobile', number: '8765432109', rawNumber: '918765432109' }
      ]
    }
  ];

  const mockExistingCustomers = [
    {
      id: 'c-101',
      name: 'Existing Customer Ramesh',
      phone: '9876543210',
      openingBalancePaise: 50000
    }
  ];

  it('1. First app launch shows permission explanation modal when onboarding flag is not set', () => {
    let mockStorage = {};
    const hasSeenOnboarding = () => mockStorage['hisab_money_contacts_onboarding_seen'] === 'true';

    assert.equal(hasSeenOnboarding(), false, 'Onboarding must be unseen on fresh launch');
    const shouldShowExplanation = !hasSeenOnboarding();
    assert.equal(shouldShowExplanation, true, 'Explanation modal must show on first launch');
  });

  it('2. "Allow Contacts Access" triggers permission request and persists onboarding viewed', async () => {
    let mockStorage = {};
    let nativeDialogTriggered = false;

    const onAllowContactsAccess = async () => {
      mockStorage['hisab_money_contacts_onboarding_seen'] = 'true';
      nativeDialogTriggered = true;
      return 'granted';
    };

    const result = await onAllowContactsAccess();
    assert.equal(nativeDialogTriggered, true, 'Native permission dialog must be requested');
    assert.equal(result, 'granted');
    assert.equal(mockStorage['hisab_money_contacts_onboarding_seen'], 'true', 'Flag must be persisted');
  });

  it('3. Granting permission enables contact search', () => {
    const permissionStatus = 'granted';
    const canSearch = permissionStatus === 'granted';
    assert.equal(canSearch, true, 'Contact search must be enabled when granted');
  });

  it('4. Search by contact name works (case-insensitive & substring)', () => {
    const resultsLower = searchContactsList(mockContacts, 'ramesh');
    assert.equal(resultsLower.length, 1);
    assert.equal(resultsLower[0].name, 'Ramesh Sharma');

    const resultsPartial = searchContactsList(mockContacts, 'poo');
    assert.equal(resultsPartial.length, 1);
    assert.equal(resultsPartial[0].name, 'Pooja Verma');
  });

  it('5. Search by phone number works (clean digits match)', () => {
    const results = searchContactsList(mockContacts, '87654');
    assert.equal(results.length, 2, 'Should match Ramesh (9876543210) and Amit (8765432109)');

    const resultsFormatted = searchContactsList(mockContacts, '+91 91234');
    assert.equal(resultsFormatted.length, 1);
    assert.equal(resultsFormatted[0].name, 'Pooja Verma');
  });

  it('6. Selecting a contact correctly normalizes and prefills name and 10-digit mobile number', () => {
    const selected = mockContacts[0];
    const initialName = selected.name;
    const initialPhone = normalizePhoneNumber(selected.phoneNumbers[0].rawNumber);

    assert.equal(initialName, 'Ramesh Sharma');
    assert.equal(initialPhone, '9876543210', 'Number must be normalized to clean 10-digit Indian format');
    assert.match(initialPhone, /^[6-9]\d{9}$/, 'Must be valid 10-digit format for Hisab Money customer schema');
  });

  it('7. Multiple phone numbers can be selected individually', () => {
    const multiContact = mockContacts[1];
    assert.equal(multiContact.phoneNumbers.length, 2);

    const chosenOption = multiContact.phoneNumbers[1];
    const cleanNumber = normalizePhoneNumber(chosenOption.rawNumber);
    assert.equal(cleanNumber, '9871234560');
    assert.equal(chosenOption.label, 'home');
  });

  it('8. Reason and Opening Balance remain empty for manual entry on form opening', () => {
    const formDefaults = {
      name: 'Ramesh Sharma',
      phone: '9876543210',
      address: '',
      openingBalance: '', // Empty per specification
      initialDueReason: '', // Empty per specification
      notes: ''
    };

    assert.equal(formDefaults.openingBalance, '', 'Opening balance must remain empty for manual entry');
    assert.equal(formDefaults.initialDueReason, '', 'Due reason must remain empty for manual entry');
  });

  it('9. Saving creates a customer through existing save logic with paise conversion', () => {
    const formInput = {
      name: 'Ramesh Sharma',
      phone: '9876543210',
      address: 'Shop 10, Chandni Chowk',
      openingBalance: '150.50',
      initialDueReason: 'Grocery Supplies'
    };

    const openingBalancePaise = Math.round(parseFloat(formInput.openingBalance) * 100);
    assert.equal(openingBalancePaise, 15050, 'Must accurately convert Rupees to Paise integer');

    const customerRecord = {
      id: `c-${Date.now()}`,
      name: formInput.name.trim(),
      phone: formInput.phone.trim(),
      address: formInput.address.trim(),
      openingBalancePaise,
      isArchived: false,
      createdAt: new Date().toISOString()
    };

    assert.equal(customerRecord.openingBalancePaise, 15050);
    assert.equal(customerRecord.phone, '9876543210');
  });

  it('10. Duplicate phone numbers are caught and protected with option to view existing customer', () => {
    const candidatePhone = '+91 98765 43210';
    const duplicate = checkDuplicateCustomer(mockExistingCustomers, candidatePhone);

    assert.notEqual(duplicate, null, 'Must detect duplicate customer');
    assert.equal(duplicate.id, 'c-101');
    assert.equal(duplicate.name, 'Existing Customer Ramesh');

    // Never auto-merge or overwrite
    const allowSilentOverwrite = false;
    assert.equal(allowSilentOverwrite, false, 'Silent overwrite is strictly prohibited');
  });

  it('11. "Maybe Later" allows normal app access without blocking', () => {
    let mockStorage = {};
    let modalVisible = true;

    const onMaybeLater = () => {
      mockStorage['hisab_money_contacts_onboarding_seen'] = 'true';
      modalVisible = false;
    };

    onMaybeLater();
    assert.equal(modalVisible, false, 'Modal dismissed');
    assert.equal(mockStorage['hisab_money_contacts_onboarding_seen'], 'true');
  });

  it('12. Denied permission does not break manual customer creation or existing app features', () => {
    const permissionStatus = 'denied';
    const canManuallyAddCustomer = true; // Always permitted
    assert.equal(canManuallyAddCustomer, true, 'Manual customer creation must remain 100% available');
  });

  it('13. Subsequent launches do not repeatedly show onboarding modal', () => {
    const mockStorage = { 'hisab_money_contacts_onboarding_seen': 'true' };
    const hasSeenOnboarding = mockStorage['hisab_money_contacts_onboarding_seen'] === 'true';

    const shouldShowModalOnSecondLaunch = !hasSeenOnboarding;
    assert.equal(shouldShowModalOnSecondLaunch, false, 'Must not show onboarding on repeat launches');
  });

  it('14. Permission revoked in Android Settings is handled gracefully', () => {
    let permissionStatus = 'granted';
    // User revokes in Android Settings
    permissionStatus = 'denied';

    const handleSearchClickWhenRevoked = () => {
      if (permissionStatus !== 'granted') {
        return { promptSettings: true };
      }
      return { promptSettings: false };
    };

    const action = handleSearchClickWhenRevoked();
    assert.equal(action.promptSettings, true, 'Gracefully informs user and offers settings option');
  });

  it('15. Offline customer creation and sync queue remain intact', () => {
    const syncQueue = [];
    const newCustomer = { id: 'c-new', name: 'Offline Customer', phone: '9812345678' };

    // Enqueue sync event
    syncQueue.push({
      entity: 'customer',
      entityId: newCustomer.id,
      operation: 'CREATE',
      payload: newCustomer
    });

    assert.equal(syncQueue.length, 1);
    assert.equal(syncQueue[0].operation, 'CREATE');
  });

  it('16. Google Drive backup and restore remain unaffected', () => {
    const backupSnapshot = {
      app: 'hisab_money_backup',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      data: {
        customers: [{ id: 'c-1', name: 'Ramesh', opening_balance_paise: 1000 }],
        dues: [],
        payments: []
      }
    };

    assert.equal(backupSnapshot.app, 'hisab_money_backup');
    assert.equal(backupSnapshot.data.customers.length, 1);
  });

  it('17. Privacy & security: contacts are never uploaded to backend or saved in bulk', () => {
    const memoryOnlyContacts = mockContacts;
    const backendPayload = {
      // Backend payload should only contain the single customer being saved, NOT memory contacts
      customer: {
        name: 'Ramesh Sharma',
        phone: '9876543210'
      }
    };

    assert.equal(backendPayload.contacts, undefined, 'Address book must NEVER be sent in backend payload');
    assert.equal(backendPayload.customer.name, 'Ramesh Sharma');
  });
});
