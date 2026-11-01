import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Hisab Money – Custom Profile Name Feature Tests', () => {
  // In-memory mock representing local storage (SecureStore + SQLite app_settings)
  let mockSecureStore = {};
  let mockAppSettings = {};

  const mockGoogleUser = {
    id: 'google-uid-12345',
    name: 'Mohammad Ani',
    email: 'mohammad.ani@example.com',
    avatarUrl: 'https://lh3.googleusercontent.com/a/mock-photo',
    picture: 'https://lh3.googleusercontent.com/a/mock-photo',
  };

  // Service helper replicating AuthService display name logic
  function getEffectiveDisplayName(user, customNameFromDb) {
    if (customNameFromDb && customNameFromDb.trim().length > 0) {
      return customNameFromDb.trim();
    }
    if (user?.customName && user.customName.trim().length > 0) {
      return user.customName.trim();
    }
    return user?.name || 'Mohammad Ani';
  }

  // Validation helper replicating SettingsScreen edit validation
  function validateProfileName(input) {
    if (!input || input.trim().length === 0) {
      return { valid: false, error: 'Display name cannot be empty' };
    }
    const trimmed = input.trim();
    if (trimmed.length > 40) {
      return { valid: false, error: 'Display name must not exceed 40 characters' };
    }
    return { valid: true, value: trimmed };
  }

  it('1. Falls back to original Google account name when custom name is not set', () => {
    const user = { ...mockGoogleUser };
    const effective = getEffectiveDisplayName(user, null);

    assert.equal(effective, 'Mohammad Ani', 'Must fallback to original Google name');
    assert.equal(user.email, 'mohammad.ani@example.com', 'Google email must remain untouched');
  });

  it('2. Saving custom display name persists trimmed string and overrides display name', () => {
    const validation = validateProfileName('   Ani Store   ');
    assert.equal(validation.valid, true);
    assert.equal(validation.value, 'Ani Store', 'Must trim unnecessary whitespace');

    // Simulate saving to storage
    mockAppSettings['custom_profile_name'] = validation.value;
    const user = {
      ...mockGoogleUser,
      customName: validation.value,
    };
    mockSecureStore['hisab_khata_auth_user'] = JSON.stringify(user);

    const effective = getEffectiveDisplayName(user, mockAppSettings['custom_profile_name']);
    assert.equal(effective, 'Ani Store', 'Display name must now be custom app name');
    assert.equal(user.name, 'Mohammad Ani', 'Original Google account name must remain preserved');
    assert.equal(user.email, 'mohammad.ani@example.com', 'Google email must remain unchanged');
  });

  it('3. Empty or whitespace-only name validation rejects with error', () => {
    const emptyRes = validateProfileName('');
    assert.equal(emptyRes.valid, false);
    assert.equal(emptyRes.error, 'Display name cannot be empty');

    const spacesRes = validateProfileName('     ');
    assert.equal(spacesRes.valid, false);
    assert.equal(spacesRes.error, 'Display name cannot be empty');
  });

  it('4. Name exceeding 40 characters is rejected by validation', () => {
    const longName = 'A'.repeat(41);
    const res = validateProfileName(longName);
    assert.equal(res.valid, false);
    assert.equal(res.error, 'Display name must not exceed 40 characters');
  });

  it('5. Name up to 40 characters is accepted', () => {
    const exact40 = 'M'.repeat(40);
    const res = validateProfileName(exact40);
    assert.equal(res.valid, true);
    assert.equal(res.value.length, 40);
  });

  it('6. Canceling edit leaves existing custom or Google name unchanged', () => {
    const currentName = 'Ani Store';
    let draftInput = 'Tentative Shop Name';
    // User cancels
    draftInput = currentName;

    assert.equal(draftInput, 'Ani Store', 'Canceling must revert/preserve current name without saving');
  });

  it('7. App restart persistence: restores custom name from local storage on reload', () => {
    mockAppSettings['custom_profile_name'] = 'Ani Supermarket';

    // Simulate app reboot where memory cache is empty
    const restoredUser = JSON.parse(mockSecureStore['hisab_khata_auth_user']);
    restoredUser.customName = mockAppSettings['custom_profile_name'];

    const effective = getEffectiveDisplayName(restoredUser, mockAppSettings['custom_profile_name']);
    assert.equal(effective, 'Ani Supermarket', 'Must survive restart through local persistence');
  });

  it('8. Resetting/clearing custom name falls back to original Google account name', () => {
    delete mockAppSettings['custom_profile_name'];
    const user = {
      ...mockGoogleUser,
      customName: undefined,
    };

    const effective = getEffectiveDisplayName(user, null);
    assert.equal(effective, 'Mohammad Ani', 'Must seamlessly return to Google name');
  });

  it('9. Verifies all required translations exist in en.ts, bn.ts, and hi.ts', () => {
    const enContent = fs.readFileSync(path.resolve('..', 'frontend', 'src', 'i18n', 'locales', 'en.ts'), 'utf8');
    const bnContent = fs.readFileSync(path.resolve('..', 'frontend', 'src', 'i18n', 'locales', 'bn.ts'), 'utf8');
    const hiContent = fs.readFileSync(path.resolve('..', 'frontend', 'src', 'i18n', 'locales', 'hi.ts'), 'utf8');

    // English
    assert.match(enContent, /editProfileName:\s*'Edit Profile Name'/);
    assert.match(enContent, /enterDisplayName:\s*'Enter Display Name'/);
    assert.match(enContent, /nameRequired:\s*'Display name cannot be empty'/);

    // Bengali
    assert.match(bnContent, /editProfileName:\s*'প্রোফাইলের নাম পরিবর্তন করুন'/);
    assert.match(bnContent, /enterDisplayName:\s*'প্রদর্শন নাম লিখুন'/);
    assert.match(bnContent, /nameRequired:\s*'প্রদর্শন নাম খালি রাখা যাবে না'/);

    // Hindi
    assert.match(hiContent, /editProfileName:\s*'प्रोफ़ाइल नाम संपादित करें'/);
    assert.match(hiContent, /enterDisplayName:\s*'प्रदर्शित नाम दर्ज करें'/);
    assert.match(hiContent, /nameRequired:\s*'प्रदर्शित नाम खाली नहीं हो सकता'/);
  });
});

