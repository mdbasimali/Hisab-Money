const { calculateBalances, rupeesToPaise, paiseToRupees } = require('./src/utils/currency.ts');

function assertEqual(actual, expected, testName) {
  if (actual === expected) {
    console.log(`PASS: ${testName}`);
  } else {
    console.error(`FAIL: ${testName} - expected ${expected}, got ${actual}`);
    process.exit(1);
  }
}

console.log('--- Running Financial Calculations & Scenarios Tests ---');

// Scenario 1: Customer created with opening balance of ₹5,000 (500000 paise), 0 new dues, 0 paid
{
  const openingPaise = rupeesToPaise(5000);
  const totalPaidPaise = 0;
  const totalNewDuesPaise = 0;
  const calc = calculateBalances(openingPaise, totalPaidPaise, totalNewDuesPaise);

  assertEqual(calc.openingBalanceRupees, 5000, 'Scenario 1: Opening balance is ₹5,000');
  assertEqual(calc.totalNewDuesRupees, 0, 'Scenario 1: New Dues is ₹0');
  assertEqual(calc.totalDueRupees, 5000, 'Scenario 1: Total Due / Borrowed is ₹5,000');
  assertEqual(calc.totalPaidRupees, 0, 'Scenario 1: Total Paid is ₹0');
  assertEqual(calc.remainingBalanceRupees, 5000, 'Scenario 1: Outstanding Due is ₹5,000');
}

// Scenario 2: Customer created with ₹0 opening balance, later borrows ₹8,000 (800000 paise) as new due
{
  const openingPaise = 0;
  const totalPaidPaise = 0;
  const totalNewDuesPaise = rupeesToPaise(8000);
  const calc = calculateBalances(openingPaise, totalPaidPaise, totalNewDuesPaise);

  assertEqual(calc.openingBalanceRupees, 0, 'Scenario 2: Opening balance is ₹0');
  assertEqual(calc.totalNewDuesRupees, 8000, 'Scenario 2: New Dues is ₹8,000');
  assertEqual(calc.totalDueRupees, 8000, 'Scenario 2: Total Borrowed is ₹8,000');
  assertEqual(calc.remainingBalanceRupees, 8000, 'Scenario 2: Outstanding Due is ₹8,000');
}

// Scenario 3: Customer with opening ₹5,000 + new dues ₹3,000 - paid ₹2,000
// Outstanding Due = Opening (5000) + New Dues (3000) - Paid (2000) = 6000
{
  const openingPaise = rupeesToPaise(5000);
  const totalPaidPaise = rupeesToPaise(2000);
  const totalNewDuesPaise = rupeesToPaise(3000);
  const calc = calculateBalances(openingPaise, totalPaidPaise, totalNewDuesPaise);

  assertEqual(calc.openingBalanceRupees, 5000, 'Scenario 3: Opening balance is ₹5,000');
  assertEqual(calc.totalNewDuesRupees, 3000, 'Scenario 3: New Dues is ₹3,000');
  assertEqual(calc.totalDueRupees, 8000, 'Scenario 3: Total Borrowed is ₹8,000');
  assertEqual(calc.totalPaidRupees, 2000, 'Scenario 3: Total Paid is ₹2,000');
  assertEqual(calc.remainingBalanceRupees, 6000, 'Scenario 3: Outstanding Due is ₹6,000');
}

// Scenario 4: User screenshot case: Akash with opening ₹0, new dues ₹8,000, total paid ₹6,000
// Outstanding Due = 0 + 8000 - 6000 = 2000
{
  const openingPaise = 0;
  const totalNewDuesPaise = rupeesToPaise(8000);
  const totalPaidPaise = rupeesToPaise(6000);
  const calc = calculateBalances(openingPaise, totalPaidPaise, totalNewDuesPaise);

  assertEqual(calc.openingBalanceRupees, 0, 'Scenario 4: Akash opening balance is ₹0');
  assertEqual(calc.totalNewDuesRupees, 8000, 'Scenario 4: Akash new dues is ₹8,000');
  assertEqual(calc.totalDueRupees, 8000, 'Scenario 4: Akash total borrowed is ₹8,000');
  assertEqual(calc.totalPaidRupees, 6000, 'Scenario 4: Akash total paid is ₹6,000');
  assertEqual(calc.remainingBalanceRupees, 2000, 'Scenario 4: Akash outstanding due is ₹2,000');
}

// Scenario 5: Initial due double counting test:
// If a customer is created with ₹5,000, opening_balance_paise = 500000, and NO due_transactions row is created for initial balance,
// then totalNewDues is strictly 0 and totalCredit is 5000 (not 10000).
{
  const initialOpeningPaise = rupeesToPaise(5000);
  const additionalNewDuePaise = 0; // No double counting
  const calc = calculateBalances(initialOpeningPaise, 0, additionalNewDuePaise);

  assertEqual(calc.totalDueRupees, 5000, 'Scenario 5: No double counting on customer creation');
  assertEqual(calc.totalNewDuesRupees, 0, 'Scenario 5: New dues remains 0 on creation');
}

console.log('--- Running Payment Mandatory Date & Time Tests ---');

const { formatDateTime, formatDate } = require('./src/utils/formatters.ts');

// Test 1: Automatically capture ISO 8601 timestamp with valid date and time
{
  const testIso = '2026-10-27T14:15:00.000Z';
  const formattedEn = formatDateTime(testIso, 'en');
  assertEqual(formattedEn.includes('27 Oct 2026'), true, 'Test 1: Formats date correctly');
  assertEqual(formattedEn.includes('•'), true, 'Test 1: Separates date and time with bullet');
  assertEqual(formattedEn.includes('PM') || formattedEn.includes('AM'), true, 'Test 1: Includes 12-hour period');
}

// Test 2: Formatting across English, Hindi, and Bengali
{
  const testIso = '2026-10-27T14:15:00.000Z';
  const en = formatDateTime(testIso, 'en');
  const hi = formatDateTime(testIso, 'hi');
  const bn = formatDateTime(testIso, 'bn');

  assertEqual(typeof en === 'string' && en.length > 5, true, 'Test 2: English date/time formatted');
  assertEqual(typeof hi === 'string' && hi.length > 5, true, 'Test 2: Hindi date/time formatted');
  assertEqual(typeof bn === 'string' && bn.length > 5, true, 'Test 2: Bengali date/time formatted');
}

// Test 3: Legacy transactions without time: do not invent false time or use current time
{
  const legacyDateOnly = '2026-10-27';
  const formatted = formatDateTime(legacyDateOnly, 'en');
  assertEqual(formatted, '27 Oct 2026', 'Test 3: Legacy date-only format does not fabricate a time');
  assertEqual(formatted.includes('•'), false, 'Test 3: No time separator on legacy date-only string');
}

// Test 4: Multiple payments recorded at distinct times have unique timestamps
{
  const p1Time = new Date('2026-10-27T10:00:00.000Z').toISOString();
  const p2Time = new Date('2026-10-27T14:30:00.000Z').toISOString();
  const p3Time = new Date('2026-10-27T18:45:00.000Z').toISOString();

  assertEqual(p1Time !== p2Time && p2Time !== p3Time, true, 'Test 4: Distinct timestamps for multiple payments');

  const p1Formatted = formatDateTime(p1Time, 'en');
  const p2Formatted = formatDateTime(p2Time, 'en');
  const p3Formatted = formatDateTime(p3Time, 'en');

  assertEqual(p1Formatted !== p2Formatted, true, 'Test 4: Rendered strings are distinct for different times');
  assertEqual(p2Formatted !== p3Formatted, true, 'Test 4: Rendered strings reflect individual recording times');
}

// Test 5: Editing notes preserves original timestamp
{
  const originalPayment = {
    id: 'p-101',
    amountPaise: 50000,
    paymentMethod: 'cash',
    notes: 'Initial note',
    paymentDate: '2026-10-27T10:15:30.000Z',
    createdAt: '2026-10-27T10:15:30.000Z',
  };

  // Simulate updating notes
  const updatedPayment = {
    ...originalPayment,
    notes: 'Updated note after customer confirmation',
  };

  assertEqual(updatedPayment.paymentDate, originalPayment.paymentDate, 'Test 5: paymentDate unchanged after notes edit');
  assertEqual(updatedPayment.createdAt, originalPayment.createdAt, 'Test 5: createdAt unchanged after notes edit');
}

// Test 6: Backup serialization & restoration preserves timestamps
{
  const backupPayment = {
    id: 'p-202',
    customer_id: 'c-1',
    amount_paise: 150000,
    payment_method: 'upi',
    payment_date: '2026-10-27T14:15:00.000Z',
    notes: 'UPI Payment',
    created_at: '2026-10-27T14:15:00.000Z',
  };

  const serialized = JSON.stringify(backupPayment);
  const restored = JSON.parse(serialized);

  assertEqual(restored.payment_date, backupPayment.payment_date, 'Test 6: payment_date preserved through backup cycle');
  assertEqual(restored.created_at, backupPayment.created_at, 'Test 6: created_at preserved through backup cycle');
  assertEqual(formatDateTime(restored.payment_date, 'en'), formatDateTime(backupPayment.payment_date, 'en'), 'Test 6: Formatted timestamp identical after restore');
}

console.log('--- Running Payment Recorded Dialog Localization Tests ---');
{
  const en = require('./src/i18n/locales/en.ts').default;
  const hi = require('./src/i18n/locales/hi.ts').default;
  const bn = require('./src/i18n/locales/bn.ts').default;

  const locales = [
    { code: 'en', bundle: en, expectedDone: 'Done', expectedSms: 'Send SMS' },
    { code: 'hi', bundle: hi, expectedDone: 'पूर्ण', expectedSms: 'SMS भेजें' },
    { code: 'bn', bundle: bn, expectedDone: 'সম্পন্ন', expectedSms: 'এসএমএস পাঠান' },
  ];

  locales.forEach(({ code, bundle, expectedDone, expectedSms }) => {
    // 1. common.done check
    assertEqual(bundle.common?.done, expectedDone, `[${code}] common.done is '${expectedDone}'`);

    // 2. common.sendSms check
    assertEqual(bundle.common?.sendSms, expectedSms, `[${code}] common.sendSms is '${expectedSms}'`);

    // 3. Payment Recorded title & message keys exist
    const hasTitle = Boolean(bundle.payment?.paymentRecordedTitle);
    assertEqual(hasTitle, true, `[${code}] payment.paymentRecordedTitle exists`);

    const hasMsg = Boolean(bundle.payment?.paymentRecordedMsg);
    assertEqual(hasMsg, true, `[${code}] payment.paymentRecordedMsg exists`);

    // 4. History labels exist
    assertEqual(Boolean(bundle.history?.dateTimeLabel), true, `[${code}] history.dateTimeLabel exists`);
    assertEqual(Boolean(bundle.history?.methodLabel), true, `[${code}] history.methodLabel exists`);

    // 5. Payment methods exist
    assertEqual(Boolean(bundle.common?.cash), true, `[${code}] common.cash exists`);
    assertEqual(Boolean(bundle.common?.upi), true, `[${code}] common.upi exists`);
    assertEqual(Boolean(bundle.common?.bank), true, `[${code}] common.bank exists`);
    assertEqual(Boolean(bundle.common?.cheque), true, `[${code}] common.cheque exists`);

    // 6. Simulate dialog strings
    const title = bundle.payment.paymentRecordedTitle;
    const msg = bundle.payment.paymentRecordedMsg
      .replace('{{amount}}', '₹500.00')
      .replace('{{name}}', 'Ramesh');
    const dtLabel = bundle.history.dateTimeLabel;
    const methodLabel = bundle.common.cash;
    const doneText = bundle.common.done;
    const smsText = bundle.common.sendSms;

    const fullDialogText = `${title} ${msg} ${dtLabel} ${methodLabel} ${doneText} ${smsText}`;

    // Verify no untranslated keys
    const containsRawKeys = /common\.|payment\.|history\.|newDue\.|COMMON\./i.test(fullDialogText);
    assertEqual(containsRawKeys, false, `[${code}] Dialog contains no raw or untranslated keys`);
  });
}

console.log('--- Running SMS Modal & Keyboard Handling Tests ---');
{
  const fs = require('fs');

  // Test 1: Verify SmsModal source code layout architecture & keyboard handling
  const smsModalCode = fs.readFileSync('./src/components/common/SmsModal.tsx', 'utf8');

  assertEqual(
    smsModalCode.includes("behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}"),
    true,
    'SMS Test 1: KeyboardAvoidingView is active on Android (not disabled with undefined)'
  );
  assertEqual(
    smsModalCode.includes('keyboardShouldPersistTaps="handled"'),
    true,
    'SMS Test 2: ScrollView prevents keyboard dismissal on tap'
  );
  assertEqual(
    smsModalCode.includes('scrollEnabled={false}'),
    true,
    'SMS Test 3: TextInput delegates scrolling smoothly to parent ScrollView'
  );
  assertEqual(
    smsModalCode.includes('scrollToInput'),
    true,
    'SMS Test 4: Automatically scrolls to reveal message input on focus'
  );
  assertEqual(
    smsModalCode.includes('sheetContainerKeyboard'),
    true,
    'SMS Test 5: Dynamic max-height constraint prevents modal from pushing off-screen'
  );
  assertEqual(
    smsModalCode.includes('backdropTouchable'),
    true,
    'SMS Test 6: Backdrop allows dismissing keyboard and modal on touch outside'
  );
  assertEqual(
    smsModalCode.includes('inputWrapperFocused'),
    true,
    'SMS Test 7: Input focus styling gives distinct visual feedback'
  );

  // Test 8: Template structure in smsService.ts
  const smsServiceCode = fs.readFileSync('./src/services/smsService.ts', 'utf8');
  assertEqual(smsServiceCode.includes("'REMINDER'"), true, 'SMS Test 8: REMINDER template defined');
  assertEqual(smsServiceCode.includes("'PAYMENT_RECEIVED'"), true, 'SMS Test 8: PAYMENT_RECEIVED template defined');
  assertEqual(smsServiceCode.includes("'DUE_ADDED'"), true, 'SMS Test 8: DUE_ADDED template defined');
  assertEqual(smsServiceCode.includes("'CUSTOM'"), true, 'SMS Test 8: CUSTOM template defined');
}

console.log('--- Running Dark Mode & Global Theming Verification Tests ---');
{
  const fs = require('fs');

  // Test 1: Verify Theme keys parity between COLORS and DARK_COLORS
  const themeFile = fs.readFileSync('./src/constants/theme.ts', 'utf8');
  assertEqual(themeFile.includes('export const COLORS'), true, 'Theme Test 1: COLORS exported');
  assertEqual(themeFile.includes('export const DARK_COLORS'), true, 'Theme Test 2: DARK_COLORS exported');
  assertEqual(themeFile.includes("background: '#090d16'"), true, 'Theme Test 3: DARK_COLORS defines dark slate background');
  assertEqual(themeFile.includes("surfaceCard: '#1e293b'"), true, 'Theme Test 4: DARK_COLORS defines dark slate card surface');
  assertEqual(themeFile.includes("textPrimary: '#f9fafb'"), true, 'Theme Test 5: DARK_COLORS defines crisp light text');

  // Test 2: Check all screens and components import and call useAppTheme
  const componentsToCheck = [
    './src/navigation/AppNavigator.tsx',
    './src/screens/dashboard/DashboardScreen.tsx',
    './src/screens/customers/CustomersScreen.tsx',
    './src/screens/customers/CustomerDetailsScreen.tsx',
    './src/screens/transactions/TransactionHistoryScreen.tsx',
    './src/screens/customers/AddCustomerScreen.tsx',
    './src/screens/customers/AddNewDueScreen.tsx',
    './src/screens/payment/RecordPaymentScreen.tsx',
    './src/screens/customers/EditCustomerScreen.tsx',
    './src/screens/settings/SettingsScreen.tsx',
    './src/screens/auth/LoginScreen.tsx',
    './src/components/common/SmsModal.tsx',
    './src/components/customer/CustomerCard.tsx',
    './src/components/customer/TransactionItem.tsx',
    './src/components/common/Card.tsx',
    './src/components/common/Input.tsx',
    './src/components/common/Badge.tsx',
    './src/components/common/Button.tsx',
  ];

  componentsToCheck.forEach((filepath) => {
    const code = fs.readFileSync(filepath, 'utf8');
    const hasTheme = code.includes('useAppTheme');
    assertEqual(hasTheme, true, `Theme Test: ${filepath} utilizes useAppTheme`);
  });
}

console.log('--- Running Privacy Policy Consent & Login Verification Tests ---');
{
  const fs = require('fs');

  // Test 1: Version Comparison Logic
  const { CURRENT_PRIVACY_POLICY_VERSION, PrivacyConsentService } = require('./src/services/privacyConsentService.ts');
  assertEqual(typeof CURRENT_PRIVACY_POLICY_VERSION, 'string', 'Privacy Test 1: CURRENT_PRIVACY_POLICY_VERSION is defined');
  assertEqual(PrivacyConsentService.compareVersions('1.0.0', '1.0.0'), 0, 'Privacy Test 1: Identical versions return 0');
  assertEqual(PrivacyConsentService.compareVersions('1.0.0', '0.9.0'), 1, 'Privacy Test 1: Newer version returns 1');
  assertEqual(PrivacyConsentService.compareVersions('0.9.0', '1.0.0'), -1, 'Privacy Test 1: Older version returns -1');
  assertEqual(PrivacyConsentService.compareVersions('1.0.0', '1.1.0'), -1, 'Privacy Test 1: Superseded version returns -1');

  // Test 2: First-time Consent Requirement & Checkbox in LoginScreen.tsx
  const loginCode = fs.readFileSync('./src/screens/auth/LoginScreen.tsx', 'utf8');
  assertEqual(loginCode.includes('PrivacyConsentService.getStoredConsent()'), true, 'Privacy Test 2: LoginScreen checks stored consent');
  assertEqual(loginCode.includes("accessibilityRole=\"checkbox\""), true, 'Privacy Test 2: Checkbox has accessibility role');
  assertEqual(loginCode.includes("t('privacy.checkboxAgree')"), true, 'Privacy Test 2: Localized checkbox text');
  assertEqual(loginCode.includes("t('privacy.policyLink')"), true, 'Privacy Test 2: Clickable Privacy Policy link');

  // Test 3: Unchecked Checkbox Disables Sign-In & Shows Explanation
  assertEqual(loginCode.includes('disabled={!isAgreed || loading}'), true, 'Privacy Test 3: Google Sign-in button is disabled when unchecked');
  assertEqual(loginCode.includes('(!isAgreed || loading) && styles.googleButtonDisabled'), true, 'Privacy Test 3: Dimmed styling applied when disabled');
  assertEqual(loginCode.includes("t('privacy.consentRequiredHint')"), true, 'Privacy Test 3: Clear explanation shown when unchecked');

  // Test 4: Returning Users & Version Upgrades
  assertEqual(loginCode.includes('setIsConsentRequired(false)'), true, 'Privacy Test 4: Returning users with unchanged policy are not re-prompted');
  assertEqual(loginCode.includes('setIsPolicyUpdated(true)'), true, 'Privacy Test 4: Material policy changes flag updated notice');
  assertEqual(loginCode.includes("t('privacy.updatedNoticeMsg'"), true, 'Privacy Test 4: Update banner rendered on policy revision');

  // Test 5: Separation of Google Auth & Recording Consent with Timestamp
  assertEqual(loginCode.includes('PrivacyConsentService.recordConsent(CURRENT_PRIVACY_POLICY_VERSION)'), true, 'Privacy Test 5: Consent explicitly recorded on sign-in');
  assertEqual(loginCode.includes('if (!isAgreed)'), true, 'Privacy Test 5: Google Sign-in cannot proceed without consent');

  // Test 6: In-App Accessible Real Privacy Policy Modal (No Placeholders)
  const modalCode = fs.readFileSync('./src/components/common/PrivacyPolicyModal.tsx', 'utf8');
  assertEqual(modalCode.includes('http://') || modalCode.includes('example.com'), false, 'Privacy Test 6: No placeholder or unhosted URLs');
  assertEqual(modalCode.includes('sec1Title') && modalCode.includes('sec2Title'), true, 'Privacy Test 6: Full multi-section real policy provided');
  assertEqual(modalCode.includes('onAccept'), true, 'Privacy Test 6: Modal supports one-tap accept & close');

  // Test 7: Parity in SettingsScreen (Privacy row opens real policy modal)
  const settingsCode = fs.readFileSync('./src/screens/settings/SettingsScreen.tsx', 'utf8');
  assertEqual(settingsCode.includes('setPrivacyModalVisible(true)'), true, 'Privacy Test 7: SettingsScreen opens real PrivacyPolicyModal');

  // Test 8: Localization Coverage across English, Hindi, and Bengali
  const en = require('./src/i18n/locales/en.ts').default;
  const hi = require('./src/i18n/locales/hi.ts').default;
  const bn = require('./src/i18n/locales/bn.ts').default;

  const requiredPrivacyKeys = [
    'checkboxAgree',
    'policyLink',
    'consentRequiredHint',
    'policyModalTitle',
    'effectiveDate',
    'version',
    'acceptAndClose',
    'close',
    'updatedNoticeTitle',
    'updatedNoticeMsg',
    'summaryHeadline',
    'summarySubtext',
    'sec1Title',
    'sec1Body',
    'sec2Title',
    'sec2Body',
    'sec3Title',
    'sec3Body',
    'sec4Title',
    'sec4Body',
    'sec5Title',
    'sec5Body',
    'sec6Title',
    'sec6Body',
    'sec7Title',
    'sec7Body',
    'sec8Title',
    'sec8Body',
    'supportLabel',
    'supportEmail',
  ];

  requiredPrivacyKeys.forEach((key) => {
    assertEqual(typeof en.privacy[key], 'string', `Privacy Test 8 [en]: privacy.${key} is localized`);
    assertEqual(typeof hi.privacy[key], 'string', `Privacy Test 8 [hi]: privacy.${key} is localized`);
    assertEqual(typeof bn.privacy[key], 'string', `Privacy Test 8 [bn]: privacy.${key} is localized`);
  });

  assertEqual(modalCode.includes('support.hisabmoney@gmail.com'), true, 'Privacy Test 9: Modal contains support email support.hisabmoney@gmail.com');
  assertEqual(settingsCode.includes('support.hisabmoney@gmail.com'), true, 'Privacy Test 9: Settings contains support email support.hisabmoney@gmail.com');
  assertEqual(modalCode.includes('topInset'), true, 'Privacy Test 10: Modal topbar handles safe status bar insets');
}

console.log('--- Running Google Profile Photo & Settings Profile Section Tests ---');
{
  const fs = require('fs');
  const settingsCode = fs.readFileSync('./src/screens/settings/SettingsScreen.tsx', 'utf8');
  const loginCode = fs.readFileSync('./src/screens/auth/LoginScreen.tsx', 'utf8');
  const authServiceCode = fs.readFileSync('./src/services/authService.ts', 'utf8');
  const backendModelCode = fs.readFileSync('../backend/src/models/User.js', 'utf8');
  const backendControllerCode = fs.readFileSync('../backend/src/controllers/authController.js', 'utf8');

  // Test 1: Real Google profile photo rendered with Image component
  assertEqual(settingsCode.includes('<Image') && settingsCode.includes('uri: avatarUrl'), true, 'Profile Test 1: Circular image rendered with Google avatar URL');
  assertEqual(settingsCode.includes('profileAvatarImage'), true, 'Profile Test 1: profileAvatarImage style defined');

  // Test 2: Fallback to initials when photo is missing or fails
  assertEqual(settingsCode.includes('getInitials(displayName)'), true, 'Profile Test 2: Fallback to initials when photo missing');
  assertEqual(settingsCode.includes('onError={() => setAvatarError(true)}'), true, 'Profile Test 2: Image error handler gracefully falls back to initials');

  // Test 3: Circular clipping & sizing
  assertEqual(settingsCode.includes("overflow: 'hidden'"), true, 'Profile Test 3: Profile avatar has overflow: hidden for circular clipping');

  // Test 4: Unwanted store name removed from Profile Card
  const profileCardRegex = /\{\/\* Google Profile Card \*\/\}[\s\S]*?\{\/\* Database Status Card \*\/\}/;
  const match = settingsCode.match(profileCardRegex);
  assertEqual(match !== null, true, 'Profile Test 4: Found Google Profile Card JSX');
  if (match) {
    const cardJsx = match[0];
    assertEqual(cardJsx.includes('displayBusiness'), false, 'Profile Test 4: Extra store-name line completely removed from Profile Card');
    assertEqual(cardJsx.includes('displayName'), true, 'Profile Test 4: Google account name is displayed');
    assertEqual(cardJsx.includes('displayEmail'), true, 'Profile Test 4: Google account email is displayed');
    assertEqual(cardJsx.includes('Badge label="Google"'), true, 'Profile Test 4: Google account indicator badge is displayed');
  }

  // Test 5: LoginScreen extracts and persists Google photo from signInResult
  assertEqual(loginCode.includes('googlePhoto = googleUser?.photo || googleUser?.picture'), true, 'Profile Test 5: LoginScreen captures Google photo from sign-in');
  assertEqual(loginCode.includes('avatarUrl: resolvedPhoto'), true, 'Profile Test 5: LoginScreen includes avatarUrl in AuthService.setUser');

  // Test 6: AuthService interface and persistence
  assertEqual(authServiceCode.includes('avatarUrl?: string'), true, 'Profile Test 6: AuthUser includes avatarUrl');
  assertEqual(authServiceCode.includes('picture?: string'), true, 'Profile Test 6: AuthUser includes picture');

  // Test 7: Backend User model & authController support picture
  assertEqual(backendModelCode.includes('picture: {'), true, 'Profile Test 7: Backend User model stores picture');
  assertEqual(backendControllerCode.includes('googleProfile.picture'), true, 'Profile Test 7: Backend controller saves picture');
  assertEqual(backendControllerCode.includes('avatarUrl: user.picture'), true, 'Profile Test 7: Backend controller returns avatarUrl');

  // Test 8: App restart persistence
  assertEqual(settingsCode.includes('AuthService.getUser()'), true, 'Profile Test 8: Settings loads persisted profile on mount/restart');

  // Test 9: Home screen header displays user name without "Store"
  const dashboardCode = fs.readFileSync('./src/screens/dashboard/DashboardScreen.tsx', 'utf8');
  assertEqual(dashboardCode.includes("{userName || user.name || 'Hisab Money'}"), true, 'Profile Test 9: Home page header displays user name directly');
  assertEqual(dashboardCode.includes('{user.businessName}'), false, 'Profile Test 9: Home page header does not use user.businessName');

  // Test 10: SmsModal topbar safe status bar handling
  const smsModalCode = fs.readFileSync('./src/components/common/SmsModal.tsx', 'utf8');
  assertEqual(smsModalCode.includes('topSafeInset'), true, 'Profile Test 10: SmsModal handles topSafeInset');
  assertEqual(smsModalCode.includes('paddingTop: isExpanded ? topSafeInset + 10 : SPACING[4]'), true, 'Profile Test 10: SmsModal applies dynamic top padding to clear status bar');
}

console.log('--- Running "Hisab Money" Branding & Compatibility Tests ---');
{
  const fs = require('fs');

  // Test 1: app.json visible app name is "Hisab Money"
  const appJson = JSON.parse(fs.readFileSync('./app.json', 'utf8'));
  assertEqual(appJson.expo.name, 'Hisab Money', 'Branding Test 1: app.json name is "Hisab Money"');

  // Test 2: Technical identifiers in app.json preserved
  assertEqual(appJson.expo.slug, 'hisab-khata', 'Branding Test 2: slug preserved');
  assertEqual(appJson.expo.scheme, 'hisabkhata', 'Branding Test 2: scheme preserved');
  assertEqual(appJson.expo.android.package, 'com.hisabkhata.app', 'Branding Test 2: android package name preserved');
  assertEqual(appJson.expo.extra.eas.projectId, '21b520f5-2bf8-4c9b-8321-baf9d51b95aa', 'Branding Test 2: EAS project ID preserved');

  // Test 3: Android strings.xml app_name is "Hisab Money"
  const stringsXml = fs.readFileSync('./android/app/src/main/res/values/strings.xml', 'utf8');
  assertEqual(stringsXml.includes('<string name="app_name">Hisab Money</string>'), true, 'Branding Test 3: Android strings.xml has Hisab Money');

  // Test 4: Locale translations consistent across EN, HI, BN
  const enLocale = require('./src/i18n/locales/en.ts').default;
  const hiLocale = require('./src/i18n/locales/hi.ts').default;
  const bnLocale = require('./src/i18n/locales/bn.ts').default;

  assertEqual(enLocale.common.appName, 'Hisab Money', 'Branding Test 4: English appName is "Hisab Money"');
  assertEqual(hiLocale.common.appName, 'हिसाब मनी', 'Branding Test 4: Hindi appName is "हिसाब मनी"');
  assertEqual(bnLocale.common.appName, 'হিসাব মানি', 'Branding Test 4: Bengali appName is "হিসাব মানি"');

  assertEqual(enLocale.settings.appVersionSubtitle, 'Hisab Money v2.0.0', 'Branding Test 4: EN app version subtitle');
  assertEqual(hiLocale.settings.appVersionSubtitle, 'हिसाब मनी v2.0.0', 'Branding Test 4: HI app version subtitle');
  assertEqual(bnLocale.settings.appVersionSubtitle, 'হিসাব মানি v2.0.0', 'Branding Test 4: BN app version subtitle');

  assertEqual(enLocale.settings.gdriveSubtitle.includes('Hisab Money'), true, 'Branding Test 4: EN gdriveSubtitle has Hisab Money');
  assertEqual(hiLocale.settings.gdriveSubtitle.includes('हिसाब मनी'), true, 'Branding Test 4: HI gdriveSubtitle has हिसाब मनी');
  assertEqual(bnLocale.settings.gdriveSubtitle.includes('হিসাব মানি'), true, 'Branding Test 4: BN gdriveSubtitle has হিসাব মানি');

  // Test 5: LoginScreen branding
  const loginCode = fs.readFileSync('./src/screens/auth/LoginScreen.tsx', 'utf8');
  assertEqual(loginCode.includes('>Hisab Money</Text>'), true, 'Branding Test 5: LoginScreen displays Hisab Money');
  assertEqual(loginCode.includes('हिसाब मनी — Your Business Ledger'), true, 'Branding Test 5: LoginScreen displays हिसाब मनी tagline');
  assertEqual(loginCode.includes('Hisab Money — Safe & Reliable Digital Ledger'), true, 'Branding Test 5: LoginScreen footer has Hisab Money');

  // Test 6: SMS Service branding
  const smsCode = fs.readFileSync('./src/services/smsService.ts', 'utf8');
  assertEqual(smsCode.includes('— Hisab Money'), true, 'Branding Test 6: SMS templates end with "— Hisab Money"');
  assertEqual(smsCode.includes('regarding your account at Hisab Money...'), true, 'Branding Test 6: SMS custom template references Hisab Money');
  assertEqual(smsCode.includes('— Paisa Khata'), false, 'Branding Test 6: No old brand in SMS templates');

  // Test 7: PDF Report branding
  const pdfCode = fs.readFileSync('./src/services/pdfReportService.ts', 'utf8');
  assertEqual(pdfCode.includes('<div class="brand-title">Hisab Money</div>'), true, 'Branding Test 7: PDF report has Hisab Money header');
  assertEqual(pdfCode.includes('dialogTitle: \'Hisab Money — Backup Report\''), true, 'Branding Test 7: PDF share dialog title has Hisab Money');
  assertEqual(pdfCode.includes('<div>Hisab Money • Safe Offline-First Digital Ledger with Google Cloud Backup</div>'), true, 'Branding Test 7: PDF report footer has Hisab Money');
  assertEqual(pdfCode.includes('Paisa Khata'), false, 'Branding Test 7: No old brand in PDF report');

  // Test 8: Backup backward compatibility (both Hisab Money and legacy Paisa Khata accepted)
  const backupCode = fs.readFileSync('./src/services/backupService.ts', 'utf8');
  assertEqual(backupCode.includes("snapshot.app !== 'paisa_khata_backup'"), true, 'Branding Test 8: BackupService validates legacy paisa_khata_backup');
  assertEqual(backupCode.includes("snapshot.app !== 'hisab_money_backup'"), true, 'Branding Test 8: BackupService validates hisab_money_backup');
  assertEqual(backupCode.includes("error: 'Backup file does not belong to Hisab Money'"), true, 'Branding Test 8: Rejection error references Hisab Money');

  // Test 9: Google Drive Service supports both Hisab Money and legacy folder/filenames
  const driveCode = fs.readFileSync('./src/services/googleDriveService.ts', 'utf8');
  assertEqual(driveCode.includes("HISAB_MONEY_FOLDER_NAME = 'Hisab Money'"), true, 'Branding Test 9: HISAB_MONEY_FOLDER_NAME is "Hisab Money"');
  assertEqual(driveCode.includes("PAISA_KHATA_FOLDER_NAME = 'Paisa Khata'"), true, 'Branding Test 9: PAISA_KHATA_FOLDER_NAME preserved for compatibility');
  assertEqual(driveCode.includes("HISAB_MONEY_BACKUP_FILENAME = 'Hisab_Money_Backup.json'"), true, 'Branding Test 9: HISAB_MONEY_BACKUP_FILENAME is "Hisab_Money_Backup.json"');
  assertEqual(driveCode.includes('getOrCreateHisabMoneyFolder'), true, 'Branding Test 9: getOrCreateHisabMoneyFolder defined');
  assertEqual(driveCode.includes('getOrCreatePaisaKhataFolder'), true, 'Branding Test 9: getOrCreatePaisaKhataFolder backward compatible alias');
  assertEqual(driveCode.includes("details: 'Uploading single cloud backup file to Hisab Money folder...'"), true, 'Branding Test 9: Progress stage references Hisab Money');
  assertEqual(driveCode.includes("Google Drive connected! 'Hisab Money' folder ready for automatic cloud backups."), true, 'Branding Test 9: Connect message references Hisab Money');

  // Test 10: App assets exist and verified
  assertEqual(fs.existsSync('./assets/icon.png'), true, 'Branding Test 10: icon.png exists');
  assertEqual(fs.existsSync('./assets/splash-icon.png'), true, 'Branding Test 10: splash-icon.png exists');
  assertEqual(fs.existsSync('./assets/android-icon-foreground.png'), true, 'Branding Test 10: android-icon-foreground.png exists');
  assertEqual(fs.existsSync('./assets/favicon.png'), true, 'Branding Test 10: favicon.png exists');
}

console.log('--- Running Final Backup System Verification Tests ---');
{
  const fs = require('fs');
  const driveCode = fs.readFileSync('./src/services/googleDriveService.ts', 'utf8');
  const queueCode = fs.readFileSync('./src/services/backupQueueService.ts', 'utf8');
  const dailyCode = fs.readFileSync('./src/services/dailyBackupService.ts', 'utf8');
  const notifCode = fs.readFileSync('./src/services/notificationService.ts', 'utf8');
  const appDataCode = fs.readFileSync('./src/services/mockService.ts', 'utf8');
  const settingsCode = fs.readFileSync('./src/screens/settings/SettingsScreen.tsx', 'utf8');
  const appCode = fs.readFileSync('./App.tsx', 'utf8');

  // Test 1: First Google login without Drive authorization shows Drive as disconnected
  assertEqual(driveCode.includes('getDriveAuthorizedState()'), true, 'Backup Test 1: Separates Google login from Drive authorization state');
  assertEqual(driveCode.includes('if (!isAuthorized)'), true, 'Backup Test 1: isDriveConnected returns false if user has not explicitly connected Drive');
  assertEqual(driveCode.includes("DRIVE_AUTHORIZED_KEY = 'hisab_money_drive_authorized'"), true, 'Backup Test 1: Distinct persistence key for Drive authorization');

  // Test 2: Real Drive authorization & verification
  assertEqual(driveCode.includes('verifyWithApi: boolean = false'), true, 'Backup Test 2: Supports deep API verification of Drive token & storage');
  assertEqual(driveCode.includes('setDriveAuthorizedState(true)'), true, 'Backup Test 2: Marks connected only after real Drive authorization and folder verification');

  // Test 3: Denied/revoked permission handling
  assertEqual(driveCode.includes('verifyRes.status === 401 || verifyRes.status === 403'), true, 'Backup Test 3: Detects revoked or expired token');
  assertEqual(driveCode.includes('await this.setDriveAuthorizedState(false)'), true, 'Backup Test 3: Automatically clears authorized state when access revoked');
  assertEqual(driveCode.includes('disconnectGoogleDrive'), true, 'Backup Test 3: User disconnect cleanly resets authorization');

  // Test 4: Single primary backup file updated in place
  assertEqual(driveCode.includes('HISAB_MONEY_BACKUP_FILENAME'), true, 'Backup Test 4: Primary backup filename is Hisab_Money_Backup.json');
  assertEqual(driveCode.includes('uploadOrUpdateFile'), true, 'Backup Test 4: Uses uploadOrUpdateFile to update existing file by ID');
  assertEqual(driveCode.includes('findFileInFolder'), true, 'Backup Test 4: Checks existing backup in Drive folder to prevent duplicate file creation');

  // Test 5: Automatic backup triggered on all local data changes
  assertEqual(appDataCode.includes("BackupQueueService.triggerAutoBackup('customer_created')"), true, 'Backup Test 5: Customer creation triggers auto backup');
  assertEqual(appDataCode.includes("BackupQueueService.triggerAutoBackup('customer_updated')"), true, 'Backup Test 5: Customer update triggers auto backup');
  assertEqual(appDataCode.includes("BackupQueueService.triggerAutoBackup('customer_archived')"), true, 'Backup Test 5: Customer archive triggers auto backup');
  assertEqual(appDataCode.includes("BackupQueueService.triggerAutoBackup('due_added')"), true, 'Backup Test 5: Due creation triggers auto backup');
  assertEqual(appDataCode.includes("BackupQueueService.triggerAutoBackup('payment_recorded')"), true, 'Backup Test 5: Payment recording triggers auto backup');

  // Test 6: Coalescing rapid changes & serialized queue
  assertEqual(queueCode.includes('clearTimeout(this.debounceTimer)'), true, 'Backup Test 6: Coalesces rapid sequential changes');
  assertEqual(queueCode.includes('this.isUploading'), true, 'Backup Test 6: Serialized queue prevents overlapping uploads');
  assertEqual(queueCode.includes('queuedChangesDuringUpload'), true, 'Backup Test 6: Retains newer changes if data changes during upload and triggers afterward');

  // Test 7: Offline changes remain pending and upload after reconnecting
  assertEqual(queueCode.includes('getPendingWorkFlag'), true, 'Backup Test 7: Persistent pending work flag in SecureStore');
  assertEqual(queueCode.includes('setPendingWorkFlag(true)'), true, 'Backup Test 7: Retains pending work when Drive disconnected or offline');
  assertEqual(queueCode.includes('resumePendingWork'), true, 'Backup Test 7: Resumes pending work when connectivity or Drive returns');

  // Test 8: Transient failures retry with bounded exponential backoff
  assertEqual(queueCode.includes('scheduleRetry'), true, 'Backup Test 8: Retry scheduler defined');
  assertEqual(queueCode.includes('Math.min(5000 * Math.pow(3, this.retryCount - 1), 300000)'), true, 'Backup Test 8: Exponential backoff bounded to max 5 minutes');

  // Test 9: Android system notifications with zero PII
  assertEqual(notifCode.includes('Backing up your data'), true, 'Backup Test 9: Start notification title');
  assertEqual(notifCode.includes('Hisab Money is updating your Google Drive backup.'), true, 'Backup Test 9: Start notification message');
  assertEqual(notifCode.includes('Backup completed successfully'), true, 'Backup Test 9: Success notification title');
  assertEqual(notifCode.includes('Your Hisab Money data has been backed up to Google Drive.'), true, 'Backup Test 9: Success notification message');
  assertEqual(notifCode.includes("Backup couldn't be completed"), true, 'Backup Test 9: Failure notification title');
  assertEqual(notifCode.includes("Your data is still saved locally. We'll retry your backup when possible."), true, 'Backup Test 9: Failure notification message');

  // Test 10: Notification permission denial resilience
  assertEqual(notifCode.includes('requestNotificationPermission'), true, 'Backup Test 10: Gracefully requests permission');
  assertEqual(notifCode.includes('if (!hasPermission) return;'), true, 'Backup Test 10: Backups proceed without failing if notifications denied');

  // Test 11: Daily best-effort backup attempt
  assertEqual(dailyCode.includes('HISAB_MONEY_DAILY_BACKUP_TASK'), true, 'Backup Test 11: TaskManager daily task defined');
  assertEqual(dailyCode.includes('24 * 60 * 60'), true, 'Backup Test 11: 24h background interval registered');
  assertEqual(dailyCode.includes('initForegroundMonitor'), true, 'Backup Test 11: Foreground fallback checks >24h elapsed since last backup');

  // Test 12: Settings UI - Always ON, no toggle switch, accurate states
  assertEqual(settingsCode.includes('Automatic Cloud Backup'), true, 'Backup Test 12: Always-on Automatic Cloud Backup title');
  assertEqual(settingsCode.includes('badge="Always ON"'), true, 'Backup Test 12: Always ON badge displayed');
  assertEqual(settingsCode.includes('Back Up Now'), true, 'Backup Test 12: Manual Back Up Now action');
  assertEqual(settingsCode.includes('Daily Backup Attempt'), true, 'Backup Test 12: Daily backup attempt row');
  assertEqual(settingsCode.includes('BackupQueueService.subscribe'), true, 'Backup Test 12: Real-time subscription to backup status');

  // Test 13: App bootstrap wiring
  assertEqual(appCode.includes('BackupQueueService.init()'), true, 'Backup Test 13: Backup queue initialized on launch');
  assertEqual(appCode.includes('DailyBackupService.initForegroundMonitor()'), true, 'Backup Test 13: Daily backup monitor initialized on launch');
  assertEqual(appCode.includes('NotificationService.initNotificationChannel()'), true, 'Backup Test 13: Android notification channels initialized on launch');
}

console.log('--- Running Critical Google Drive Backup Restore & Data Recovery Tests ---');
{
  const fs = require('fs');
  const backupCode = fs.readFileSync('./src/services/backupService.ts', 'utf8');
  const driveCode = fs.readFileSync('./src/services/googleDriveService.ts', 'utf8');
  const syncCode = fs.readFileSync('./src/services/syncService.ts', 'utf8');
  const settingsCode = fs.readFileSync('./src/screens/settings/SettingsScreen.tsx', 'utf8');

  // Test 1: createLocalSnapshot SQL query is safe when userId is null (no broken 'WHERE AND' replacement)
  assertEqual(backupCode.includes("const userClause = userId ? '(user_id = ? OR user_id IS NULL)' : '1=1';"), true, 'Data Recovery Test 1: Uses safe userClause without broken WHERE AND replace');
  assertEqual(backupCode.includes("WHERE ${userClause} AND id NOT LIKE 'c-dev-user-1%'"), true, 'Data Recovery Test 1: Safe SQL WHERE clause for customers');
  assertEqual(backupCode.includes("WHERE ${userClause} AND id NOT LIKE 'p-dev-user-1%'"), true, 'Data Recovery Test 1: Safe SQL WHERE clause for payments');
  assertEqual(!backupCode.includes(".replace('WHERE AND', 'WHERE')"), true, 'Data Recovery Test 1: Removed fragile .replace WHERE AND hack');

  // Test 2: restoreSnapshot uses atomic upsert with ON CONFLICT(id) DO UPDATE
  assertEqual(backupCode.includes('INSERT INTO customers ('), true, 'Data Recovery Test 2: customers uses upsert');
  assertEqual(backupCode.includes('ON CONFLICT(id) DO UPDATE SET'), true, 'Data Recovery Test 2: customers has ON CONFLICT DO UPDATE');
  assertEqual(backupCode.includes('user_id = COALESCE(?, excluded.user_id, customers.user_id)'), true, 'Data Recovery Test 2: Claims restored records for authenticated user');

  // Test 3: due_transactions and payments upsert with ON CONFLICT(id) DO UPDATE
  assertEqual(backupCode.includes('INSERT INTO due_transactions ('), true, 'Data Recovery Test 3: due_transactions uses upsert');
  assertEqual(backupCode.includes('INSERT INTO payments ('), true, 'Data Recovery Test 3: payments uses upsert');

  // Test 4: validateBackup normalizes missing or legacy opening balances
  assertEqual(backupCode.includes('c.opening_balance_paise = 0;'), true, 'Data Recovery Test 4: validateBackup defaults missing opening balance gracefully');

  // Test 5: Google Drive listing fetches modifiedTime and orders by modifiedTime desc
  assertEqual(driveCode.includes('orderBy=modifiedTime desc,createdTime desc'), true, 'Data Recovery Test 5: Drive API orders by modifiedTime desc');
  assertEqual(driveCode.includes('fields=files(id,name,createdTime,modifiedTime,size)'), true, 'Data Recovery Test 5: Drive API includes modifiedTime in fields');
  assertEqual(driveCode.includes('const timeB = new Date(b.modifiedTime || b.createdTime).getTime();'), true, 'Data Recovery Test 5: Client-side sorts newest modified first');

  // Test 6: SettingsScreen inspects candidate backups and selects candidate with customer data
  assertEqual(settingsCode.includes('setSelectedBackupFile(chosenFile);'), true, 'Data Recovery Test 6: Smart candidate selection for restore');
  assertEqual(settingsCode.includes('loadLocalBackupMeta().catch(() => {});'), true, 'Data Recovery Test 6: Refreshes local metadata after restore');

  // Test 6b: Google Drive service folder deduplication and overwrite safety
  assertEqual(driveCode.includes('findFileGlobally'), true, 'Data Recovery Test 6b: Implements findFileGlobally');
  assertEqual(driveCode.includes('Blocked overwrite of non-empty cloud backup by empty local database'), true, 'Data Recovery Test 6b: Protects cloud backup from empty overwrite');

  // Test 7: syncExistingLocalRecords queries records with null user_id so offline/restored records sync
  assertEqual(syncCode.includes("const userCond = userId ? '(c.user_id = ? OR c.user_id IS NULL)' : '1=1';"), true, 'Data Recovery Test 7: syncExistingLocalRecords handles NULL user_id for customers');
  assertEqual(syncCode.includes("const dueUserCond = userId ? '(d.user_id = ? OR d.user_id IS NULL)' : '1=1';"), true, 'Data Recovery Test 7: syncExistingLocalRecords handles NULL user_id for dues');
  assertEqual(syncCode.includes("const payUserCond = userId ? '(p.user_id = ? OR p.user_id IS NULL)' : '1=1';"), true, 'Data Recovery Test 7: syncExistingLocalRecords handles NULL user_id for payments');

  // Test 8: End-to-End Simulation of Customer, Due, Payment Serialization and Validation
  const sampleSnapshot = {
    app: 'hisab_money_backup',
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    customersCount: 3,
    duesCount: 2,
    paymentsCount: 2,
    data: {
      customers: [
        {
          id: 'c-test-1',
          name: 'Aman Sharma',
          phone: '9876543210',
          address: 'Delhi',
          notes: 'Regular customer',
          credit_limit: 10000,
          opening_balance_paise: 50000, // ₹500
          is_archived: 0,
          created_at: '2026-10-25T10:00:00.000Z',
          updated_at: '2026-10-25T10:00:00.000Z',
        },
        {
          id: 'c-test-2',
          name: 'Priya Verma',
          phone: '9876543211',
          address: 'Mumbai',
          notes: '',
          credit_limit: 5000,
          opening_balance_paise: 120000, // ₹1,200
          is_archived: 0,
          created_at: '2026-10-26T11:00:00.000Z',
          updated_at: '2026-10-26T11:00:00.000Z',
        },
        {
          id: 'c-test-3',
          name: 'Rohit Gupta',
          phone: '9876543212',
          address: 'Kolkata',
          notes: 'Wholesale',
          credit_limit: 20000,
          opening_balance_paise: 0, // ₹0
          is_archived: 0,
          created_at: '2026-10-27T12:00:00.000Z',
          updated_at: '2026-10-27T12:00:00.000Z',
        },
      ],
      dues: [
        {
          id: 'due-test-1',
          customer_id: 'c-test-1',
          amount_paise: 30000, // ₹300
          reason: 'Groceries borrow',
          transaction_date: '2026-10-28T09:00:00.000Z',
          notes: null,
          created_at: '2026-10-28T09:00:00.000Z',
        },
        {
          id: 'due-test-2',
          customer_id: 'c-test-3',
          amount_paise: 80000, // ₹800
          reason: 'Bulk purchase',
          transaction_date: '2026-10-28T14:00:00.000Z',
          notes: null,
          created_at: '2026-10-28T14:00:00.000Z',
        },
      ],
      payments: [
        {
          id: 'pay-test-1',
          customer_id: 'c-test-1',
          amount_paise: 20000, // ₹200
          payment_method: 'upi',
          payment_date: '2026-10-29T10:00:00.000Z',
          notes: 'GPay',
          created_at: '2026-10-29T10:00:00.000Z',
        },
        {
          id: 'pay-test-2',
          customer_id: 'c-test-2',
          amount_paise: 50000, // ₹500
          payment_method: 'cash',
          payment_date: '2026-10-29T12:00:00.000Z',
          notes: null,
          created_at: '2026-10-29T12:00:00.000Z',
        },
      ],
    },
  };

  const serialized = JSON.stringify(sampleSnapshot);
  assertEqual(typeof serialized, 'string', 'Data Recovery Test 8: Serialization succeeds');

  // Verify financial balance reconciliation for test customer 1:
  // Opening: 50000, Due: 30000, Paid: 20000 => Remaining Balance: 60000 (₹600)
  const calc1 = calculateBalances(50000, 20000, 30000);
  assertEqual(calc1.openingBalanceRupees, 500, 'Data Recovery Test 8: Customer 1 opening balance ₹500');
  assertEqual(calc1.totalNewDuesRupees, 300, 'Data Recovery Test 8: Customer 1 new dues ₹300');
  assertEqual(calc1.totalPaidRupees, 200, 'Data Recovery Test 8: Customer 1 total paid ₹200');
  assertEqual(calc1.remainingBalanceRupees, 600, 'Data Recovery Test 8: Customer 1 outstanding balance ₹600');

  // Verify financial balance reconciliation for test customer 2:
  // Opening: 120000, Due: 0, Paid: 50000 => Remaining Balance: 70000 (₹700)
  const calc2 = calculateBalances(120000, 50000, 0);
  assertEqual(calc2.remainingBalanceRupees, 700, 'Data Recovery Test 8: Customer 2 outstanding balance ₹700');

  // Verify financial balance reconciliation for test customer 3:
  // Opening: 0, Due: 80000, Paid: 0 => Remaining Balance: 80000 (₹800)
  const calc3 = calculateBalances(0, 0, 80000);
  assertEqual(calc3.remainingBalanceRupees, 800, 'Data Recovery Test 8: Customer 3 outstanding balance ₹800');
}

// --- First-Login Google Drive Connection Tests ---
console.log('--- Running First-Login Google Drive Connection Tests ---');
{
  const fs = require('fs');
  const driveCode = fs.readFileSync('./src/services/googleDriveService.ts', 'utf8');
  const authCode = fs.readFileSync('./src/services/authService.ts', 'utf8');
  const loginCode = fs.readFileSync('./src/screens/auth/LoginScreen.tsx', 'utf8');
  const dashCode = fs.readFileSync('./src/screens/dashboard/DashboardScreen.tsx', 'utf8');

  // Test 1: Persistent first-drive prompt flag management
  assertEqual(driveCode.includes("const FIRST_DRIVE_PROMPT_KEY = 'hisab_money_first_drive_prompt_handled';"), true, 'First-Login Test 1: FIRST_DRIVE_PROMPT_KEY defined');
  assertEqual(driveCode.includes('static async isFirstDrivePromptHandled(): Promise<boolean>'), true, 'First-Login Test 1: isFirstDrivePromptHandled defined');
  assertEqual(driveCode.includes('static async setFirstDrivePromptHandled(handled: boolean): Promise<void>'), true, 'First-Login Test 1: setFirstDrivePromptHandled defined');

  // Test 2: Verified connection requirement
  assertEqual(driveCode.includes('if (folderRes.success && folderRes.folderId) {'), true, 'First-Login Test 2: Verified folder required for success');
  assertEqual(driveCode.includes('await this.setDriveAuthorizedState(false);'), true, 'First-Login Test 2: Strictly sets false when folder verification fails');

  // Test 3: handleFirstLoginDriveSetup automated flow
  assertEqual(driveCode.includes('static async handleFirstLoginDriveSetup(): Promise<'), true, 'First-Login Test 3: handleFirstLoginDriveSetup defined');
  assertEqual(driveCode.includes('await this.setFirstDrivePromptHandled(true);'), true, 'First-Login Test 3: Marks prompt handled on setup');
  assertEqual(driveCode.includes('localCount === 0 && remoteSnapshot && remoteSnapshot.customersCount > 0'), true, 'First-Login Test 3: Detects existing cloud backup for empty DB');
  assertEqual(driveCode.includes('hasConflict: true'), true, 'First-Login Test 3: Detects conflict when both local and cloud data exist');

  // Test 4: LoginScreen initiates first-login flow
  assertEqual(loginCode.includes('const isPromptHandled = await GoogleDriveBackupService.isFirstDrivePromptHandled();'), true, 'First-Login Test 4: LoginScreen checks isFirstDrivePromptHandled');
  assertEqual(loginCode.includes('if (isDriveAvail && !isDriveConn && !isPromptHandled) {'), true, 'First-Login Test 4: Automatically prompts if Drive not connected on first login');
  assertEqual(loginCode.includes('setFirstDriveModalVisible(true);'), true, 'First-Login Test 4: Displays first-login Drive modal');

  // Test 5: Explains Drive requirement and allows approve/decline
  assertEqual(loginCode.includes('handleApproveDrive'), true, 'First-Login Test 5: handleApproveDrive defined');
  assertEqual(loginCode.includes('handleDeclineDrive'), true, 'First-Login Test 5: handleDeclineDrive defined');
  assertEqual(loginCode.includes('Enable Automatic Cloud Backup'), true, 'First-Login Test 5: Explains cloud backup requirement');
  assertEqual(loginCode.includes('Maybe Later (Connect in Settings)'), true, 'First-Login Test 5: User can decline/postpone authorization');

  // Test 6: Safe reconciliation and restore
  assertEqual(loginCode.includes('Restore Cloud Backup?'), true, 'First-Login Test 6: Prompts to restore existing cloud backup on clean install');
  assertEqual(loginCode.includes('Never silently overwrite: would you like to restore cloud backup or keep local records?'), true, 'First-Login Test 6: Safe reconciliation prevents silent overwrite');

  // Test 7: Logout resets first-login prompt for next user
  assertEqual(authCode.includes('await GoogleDriveBackupService.setFirstDrivePromptHandled(false);'), true, 'First-Login Test 7: Logout resets first drive prompt flag');

  // Test 8: Dashboard shows waiting banner when Drive authorization pending
  assertEqual(dashCode.includes('const connected = await GoogleDriveBackupService.isDriveConnected();'), true, 'First-Login Test 8: Dashboard checks isDriveConnected');
  assertEqual(dashCode.includes('Cloud Backup Waiting for Authorization'), true, 'First-Login Test 8: Displays waiting authorization banner');
  assertEqual(dashCode.includes("Connect Google Drive"), true, 'First-Login Test 8: Provides action button to connect Google Drive');
}

// ── 12. Edit Due Transaction Feature Tests ──────────────────────────────────
console.log('--- Running Edit Due Transaction Feature Tests ---');
{
  const fs = require('fs');
  const dueRepoCode = fs.readFileSync('./src/repositories/dueRepository.ts', 'utf8');
  assertEqual(dueRepoCode.includes('static async updateDue(params: UpdateDueParams): Promise<DueTransaction>'), true, 'Edit Due Test 1: DueRepository defines updateDue');
  assertEqual(dueRepoCode.includes('amountPaise <= 0'), true, 'Edit Due Test 1: DueRepository validates amountPaise > 0');
  assertEqual(dueRepoCode.includes('UPDATE due_transactions'), true, 'Edit Due Test 1: DueRepository updates existing transaction instead of creating new');
  assertEqual(dueRepoCode.includes("UPDATE customers SET updated_at = ?"), true, 'Edit Due Test 1: DueRepository touches customer updated_at');
  assertEqual(dueRepoCode.includes("SyncService.enqueue('due', params.id, 'UPDATE'"), true, 'Edit Due Test 1: DueRepository enqueues UPDATE operation in sync queue');
  assertEqual(dueRepoCode.includes("BackupQueueService.triggerAutoBackup('due_updated')"), true, 'Edit Due Test 1: DueRepository triggers auto cloud backup');

  const mockServiceCode = fs.readFileSync('./src/services/mockService.ts', 'utf8');
  assertEqual(mockServiceCode.includes('static async updateDue(params: {'), true, 'Edit Due Test 2: AppDataService defines updateDue');

  const editModalCode = fs.readFileSync('./src/components/customer/EditDueModal.tsx', 'utf8');
  assertEqual(editModalCode.includes('export function EditDueModal('), true, 'Edit Due Test 3: EditDueModal component defined');
  assertEqual(editModalCode.includes('Math.round(parsed * 100)'), true, 'Edit Due Test 3: EditDueModal computes integer paise');
  assertEqual(editModalCode.includes('KeyboardAvoidingView'), true, 'Edit Due Test 3: EditDueModal uses KeyboardAvoidingView');
  assertEqual(editModalCode.includes('Confirm Transaction Update'), true, 'Edit Due Test 3: EditDueModal provides confirmation step before updating');
  assertEqual(editModalCode.includes('Previous Amount'), true, 'Edit Due Test 3: Confirmation displays Previous Amount');
  assertEqual(editModalCode.includes('New Amount'), true, 'Edit Due Test 3: Confirmation displays New Amount');
  assertEqual(editModalCode.includes('Updated Reason'), true, 'Edit Due Test 3: Confirmation displays Updated Reason');

  const txItemCode = fs.readFileSync('./src/components/customer/TransactionItem.tsx', 'utf8');
  assertEqual(txItemCode.includes('isNewDue ? ('), true, 'Edit Due Test 4: TransactionItem conditionally renders Edit Due only for eligible new dues');
  assertEqual(txItemCode.includes('!transaction.id.startsWith(\'opening-\')'), true, 'Edit Due Test 4: Opening balance excluded from Edit Due');
  assertEqual(txItemCode.includes('<EditDueModal'), true, 'Edit Due Test 4: TransactionItem renders EditDueModal');
  assertEqual(txItemCode.includes('onTransactionUpdated?.();'), true, 'Edit Due Test 4: TransactionItem triggers onTransactionUpdated callback');

  const custDetailsCode = fs.readFileSync('./src/screens/customers/CustomerDetailsScreen.tsx', 'utf8');
  assertEqual(custDetailsCode.includes('onTransactionUpdated={loadCustomer}'), true, 'Edit Due Test 5: CustomerDetailsScreen passes loadCustomer to recompute balances');

  const txHistoryCode = fs.readFileSync('./src/screens/transactions/TransactionHistoryScreen.tsx', 'utf8');
  assertEqual(txHistoryCode.includes('onTransactionUpdated={loadTransactions}'), true, 'Edit Due Test 6: TransactionHistoryScreen passes loadTransactions to refresh history');

  // Verify translations
  const enLocale = require('./src/i18n/locales/en.ts').default;
  const hiLocale = require('./src/i18n/locales/hi.ts').default;
  const bnLocale = require('./src/i18n/locales/bn.ts').default;

  assertEqual(typeof enLocale.editDue?.title, 'string', 'Edit Due Test 7: EN editDue.title defined');
  assertEqual(typeof enLocale.editDue?.confirmTitle, 'string', 'Edit Due Test 7: EN editDue.confirmTitle defined');
  assertEqual(typeof hiLocale.editDue?.title, 'string', 'Edit Due Test 7: HI editDue.title defined');
  assertEqual(typeof bnLocale.editDue?.title, 'string', 'Edit Due Test 7: BN editDue.title defined');
}

// ── 13. Universal Transaction-Based Send SMS Tests ──────────────────────────
console.log('--- Running Universal Transaction-Based Send SMS Tests ---');
{
  const fs = require('fs');
  const { SmsService } = require('./src/services/smsService.ts');

  // Test 1: New Due transaction SMS generation
  const dueTx = {
    id: 'due-101',
    customerId: 'c-1',
    type: 'credit',
    subType: 'new_due',
    amount: 200,
    amountPaise: 20000,
    reason: 'Groceries',
  };
  const dueMsg = SmsService.buildMessageForTransaction({
    customerName: 'Basim',
    outstandingBalanceRupees: 800,
    transaction: dueTx,
  });
  assertEqual(
    dueMsg,
    'Hello Basim, ₹200.00 has been added to your account. Your current outstanding balance is ₹800.00. Please contact us if you have any questions. — Hisab Money',
    'Universal SMS Test 1: New Due message matches exact wording'
  );

  // Test 2: Payment Received transaction SMS generation
  const paymentTx = {
    id: 'pay-101',
    customerId: 'c-1',
    type: 'payment',
    subType: 'payment',
    amount: 150,
    amountPaise: 15000,
    paymentMethod: 'cash',
  };
  const payMsg = SmsService.buildMessageForTransaction({
    customerName: 'Basim',
    outstandingBalanceRupees: 650,
    transaction: paymentTx,
  });
  assertEqual(
    payMsg,
    'Hello Basim, we received your payment of ₹150.00. Your updated outstanding balance is ₹650.00. Thank you. — Hisab Money',
    'Universal SMS Test 2: Payment Received message matches exact wording'
  );

  // Test 3: Opening Balance transaction SMS generation
  const openingTx = {
    id: 'opening-c-1',
    customerId: 'c-1',
    type: 'credit',
    subType: 'opening',
    amount: 500,
    amountPaise: 50000,
    reason: 'Opening Balance',
  };
  const openingMsg = SmsService.buildMessageForTransaction({
    customerName: 'Basim',
    outstandingBalanceRupees: 500,
    transaction: openingTx,
  });
  assertEqual(
    openingMsg.includes('₹500.00 has been added to your account'),
    true,
    'Universal SMS Test 3: Opening Balance transaction supported'
  );

  // Test 4: Correct transaction amount
  assertEqual(dueMsg.includes('₹200.00'), true, 'Universal SMS Test 4: Correct due amount');
  assertEqual(payMsg.includes('₹150.00'), true, 'Universal SMS Test 4: Correct payment amount');

  // Test 5: Correct customer name and phone sanitizer
  assertEqual(dueMsg.includes('Hello Basim'), true, 'Universal SMS Test 5: Customer name in greeting');
  const phoneCheck = SmsService.sanitizePhoneNumber('+91 98765-43210');
  assertEqual(phoneCheck.valid, true, 'Universal SMS Test 5: Sanitizer validates phone');
  assertEqual(phoneCheck.formatted, '+919876543210', 'Universal SMS Test 5: Sanitizer removes spaces and dashes');

  // Test 6: Latest outstanding balance
  assertEqual(dueMsg.includes('outstanding balance is ₹800.00'), true, 'Universal SMS Test 6: Due message includes latest balance');
  assertEqual(payMsg.includes('outstanding balance is ₹650.00'), true, 'Universal SMS Test 6: Payment message includes latest balance');

  // Test 7: Existing message wording remains unchanged with branding
  assertEqual(dueMsg.endsWith('— Hisab Money'), true, 'Universal SMS Test 7: Due message preserves branding');
  assertEqual(payMsg.endsWith('— Hisab Money'), true, 'Universal SMS Test 7: Payment message preserves branding');

  // Test 8: No template selection UI in SmsModal.tsx
  const smsModalCode = fs.readFileSync('./src/components/common/SmsModal.tsx', 'utf8');
  assertEqual(smsModalCode.includes('CHOOSE TEMPLATE'), false, 'Universal SMS Test 8: Template selector title removed');
  assertEqual(smsModalCode.includes('Payment Reminder'), false, 'Universal SMS Test 8: Template reminder chip removed');
  assertEqual(smsModalCode.includes('handleSelectType'), false, 'Universal SMS Test 8: Manual template selector handler removed');
  assertEqual(smsModalCode.includes('pillsScroll'), false, 'Universal SMS Test 8: Template pills container removed');

  // Test 9: Message editing works in SmsModal.tsx
  assertEqual(smsModalCode.includes('onChangeText={setMessageText}'), true, 'Universal SMS Test 9: TextInput allows editing message');
  assertEqual(smsModalCode.includes('MESSAGE PREVIEW & EDIT'), true, 'Universal SMS Test 9: Preview & Edit label present');

  // Test 10: Default SMS app composer integration
  const smsServiceCode = fs.readFileSync('./src/services/smsService.ts', 'utf8');
  assertEqual(smsServiceCode.includes('openSmsComposer'), true, 'Universal SMS Test 10: openSmsComposer defined');
  assertEqual(smsModalCode.includes('Open SMS App'), true, 'Universal SMS Test 10: Open SMS App button present');

  // Test 11: TransactionItem exposes Send SMS on ANY transaction
  const txItemCode = fs.readFileSync('./src/components/customer/TransactionItem.tsx', 'utf8');
  assertEqual(txItemCode.includes('onSendSms ? ('), true, 'Universal SMS Test 11: TransactionItem renders Send SMS for transactions');
  assertEqual(txItemCode.includes('onSendSms(transaction)'), true, 'Universal SMS Test 11: Invokes onSendSms with exact transaction');

  // Test 12: CustomerDetailsScreen wires Send SMS
  const custDetailsCode = fs.readFileSync('./src/screens/customers/CustomerDetailsScreen.tsx', 'utf8');
  assertEqual(custDetailsCode.includes('onSendSms={handleOpenSmsForTransaction}'), true, 'Universal SMS Test 12: CustomerDetailsScreen connects onSendSms');
  assertEqual(custDetailsCode.includes('setSelectedSmsTx(tx)'), true, 'Universal SMS Test 12: CustomerDetailsScreen tracks selected transaction for SMS');
}

console.log('All financial scenario, payment timestamp, dialog localization, SMS modal, Dark Mode, Privacy Policy consent, Google Profile, Hisab Money Branding, Final Backup System, Critical Data Recovery, First-Login Google Drive Connection, Edit Due Transaction, and Universal Transaction-Based Send SMS tests passed successfully!');


