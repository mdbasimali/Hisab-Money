import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { useAppTheme } from '../../context/ThemeContext';
import { ContactsService, PhoneContact, ContactsPermissionStatus } from '../../services/contactsService';
import { AppDataService } from '../../services/mockService';

interface ContactSearchSectionProps {
  permissionStatus: ContactsPermissionStatus;
  onRequestPermission: () => void;
  onSelectContact: (name: string, phone: string) => void;
  onViewExistingCustomer: (customerId: string) => void;
}

export function ContactSearchSection({
  permissionStatus,
  onRequestPermission,
  onSelectContact,
  onViewExistingCustomer,
}: ContactSearchSectionProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();

  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [results, setResults] = useState<PhoneContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [multiNumberContact, setMultiNumberContact] = useState<PhoneContact | null>(null);

  const searchInputRef = useRef<any>(null);
  const searchTimeoutRef = useRef<any>(null);

  const performSearch = useCallback(
    async (searchText: string) => {
      if (permissionStatus !== 'granted') {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const matches = await ContactsService.searchContacts(searchText);
        setResults(matches);
      } catch (e) {
        console.warn('[ContactSearchSection] Search failed:', e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [permissionStatus]
  );

  // Search when query or permission changes
  useEffect(() => {
    if (permissionStatus !== 'granted') {
      setResults([]);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!isFocused && !query) {
      setResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(query);
    }, 150);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, isFocused, permissionStatus, performSearch]);

  const handleBarPress = () => {
    if (permissionStatus !== 'granted') {
      onRequestPermission();
      return;
    }
    setIsFocused(true);
    searchInputRef.current?.focus();
    performSearch(query);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsFocused(false);
    searchInputRef.current?.blur();
  };

  const handlePickPhone = async (contactName: string, phoneNumber: string) => {
    const cleanNumber = ContactsService.normalizePhoneNumber(phoneNumber);
    if (!cleanNumber) return;

    // Duplicate customer protection check
    try {
      const existing = await AppDataService.getCustomerByPhone(cleanNumber);
      if (existing) {
        Alert.alert(
          t('contacts.duplicateTitle', 'Customer Already Exists'),
          t('contacts.duplicateMsg', {
            defaultValue: `A customer named "${existing.name}" is already registered with this phone number (+91 ${cleanNumber}).`,
            name: existing.name,
            phone: cleanNumber,
          }),
          [
            {
              text: t('contacts.viewCustomer', 'View Customer'),
              onPress: () => {
                handleClear();
                onViewExistingCustomer(existing.id);
              },
            },
            {
              text: t('common.cancel', 'Cancel'),
              style: 'cancel',
            },
          ]
        );
        return;
      }
    } catch (e) {
      console.warn('[ContactSearchSection] Duplicate check warning:', e);
    }

    handleClear();
    onSelectContact(contactName, cleanNumber);
  };

  const handleContactPress = (contact: PhoneContact) => {
    if (contact.phoneNumbers.length === 0) return;

    if (contact.phoneNumbers.length === 1) {
      handlePickPhone(contact.name, contact.phoneNumbers[0].number);
    } else {
      // Multiple numbers: ask user to pick one
      setMultiNumberContact(contact);
    }
  };

  const handleOpenSettings = () => {
    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      Linking.openSettings().catch(() => {});
    }
  };

  const showDropdown = isFocused || (permissionStatus === 'granted' && query.length > 0);

  return (
    <View style={styles.wrapper}>
      {/* Search Bar Container */}
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={handleBarPress}
        style={[
          styles.container,
          {
            backgroundColor: colors.surfaceCard,
            borderColor: isFocused ? colors.primary : colors.border,
            borderWidth: 1,
          },
        ]}
      >
        <View style={styles.searchIconWrap}>
          <Ionicons name="search" size={20} color={colors.primary} />
        </View>

        <View style={styles.inputCol}>
          <TextInput
            ref={searchInputRef}
            style={[styles.input, { color: colors.textPrimary }]}
            placeholder={t('contacts.searchPlaceholder', 'Search phone contacts')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onFocus={() => {
              if (permissionStatus !== 'granted') {
                searchInputRef.current?.blur();
                onRequestPermission();
                return;
              }
              setIsFocused(true);
              performSearch(query);
            }}
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="search"
          />
          <Text style={[styles.supportingText, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('contacts.supportingText', 'Find a contact to add as customer')}
          </Text>
        </View>

        <View style={styles.rightActions}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : query.length > 0 ? (
            <TouchableOpacity onPress={handleClear} hitSlop={10} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleBarPress} hitSlop={10} activeOpacity={0.7}>
              <Ionicons
                name={permissionStatus === 'granted' ? 'call-outline' : 'shield-outline'}
                size={18}
                color={colors.primary}
              />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>

      {/* Permission Denied Notice (if user interacts or search is focused without permission) */}
      {isFocused && permissionStatus !== 'granted' && (
        <View
          style={[
            styles.permissionPromptCard,
            { backgroundColor: isDark ? '#1c1917' : '#fffbeb', borderColor: isDark ? '#b45309' : '#fde68a' },
          ]}
        >
          <View style={styles.permissionPromptHeader}>
            <Ionicons name="lock-closed-outline" size={18} color={isDark ? '#fbbf24' : '#d97706'} />
            <Text style={[styles.permissionPromptTitle, { color: isDark ? '#fef3c7' : '#92400e' }]}>
              {t('contacts.accessDisabled', 'Contacts Access Disabled')}
            </Text>
          </View>
          <Text style={[styles.permissionPromptBody, { color: isDark ? '#d6d3d1' : '#b45309' }]}>
            {t('contacts.accessDesc', 'Quickly find and import customer details from your phone contacts without manual typing.')}
          </Text>
          <View style={styles.permissionPromptActions}>
            <TouchableOpacity
              style={[styles.permissionActionBtn, { backgroundColor: colors.primary }]}
              onPress={onRequestPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.permissionActionBtnText}>
                {t('contacts.enableBtn', 'Enable Contacts')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.permissionActionSecondaryBtn, { borderColor: colors.border }]}
              onPress={handleOpenSettings}
              activeOpacity={0.7}
            >
              <Text style={[styles.permissionActionSecondaryText, { color: colors.textSecondary }]}>
                {t('contacts.openSettings', 'Open Device Settings')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Live Search Results Dropdown */}
      {showDropdown && permissionStatus === 'granted' && (
        <View
          style={[
            styles.dropdown,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Header with dismiss button */}
          <View style={[styles.dropdownHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.dropdownTitle, { color: colors.textSecondary }]}>
              {query.trim().length > 0 ? `Matches (${results.length})` : 'Phone Contacts'}
            </Text>
            <TouchableOpacity onPress={handleClear} activeOpacity={0.7}>
              <Text style={[styles.doneBtnText, { color: colors.primary }]}>{t('common.done', 'Done')}</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingBoxText, { color: colors.textSecondary }]}>
                {t('common.loading', 'Loading contacts...')}
              </Text>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="search-outline" size={32} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {t('contacts.noContactsFound', 'No contacts found')}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                {t('contacts.noContactsSub', 'No phone contacts match your search.')}
              </Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              style={styles.resultsList}
              renderItem={({ item }) => {
                const primaryNumber = item.phoneNumbers[0]?.number || '';
                const displayPhone = ContactsService.formatPhoneNumberDisplay(primaryNumber);
                const hasMultiple = item.phoneNumbers.length > 1;

                return (
                  <TouchableOpacity
                    style={[styles.contactRow, { borderBottomColor: colors.border }]}
                    onPress={() => handleContactPress(item)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.contactAvatar, { backgroundColor: isDark ? '#064e3b' : '#dcfce7' }]}>
                      <Text style={[styles.contactInitial, { color: colors.primary }]}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.contactInfo}>
                      <Text style={[styles.contactName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View style={styles.contactPhoneRow}>
                        <Text style={[styles.contactPhone, { color: colors.textSecondary }]}>
                          {displayPhone}
                        </Text>
                        {hasMultiple && (
                          <View
                            style={[
                              styles.multipleBadge,
                              { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' },
                            ]}
                          >
                            <Text style={[styles.multipleBadgeText, { color: colors.textSecondary }]}>
                              +{item.phoneNumbers.length - 1} more
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={[styles.addBtn, { backgroundColor: isDark ? '#064e3b' : '#dcfce7' }]}>
                      <Ionicons name="person-add" size={16} color={colors.primary} />
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}

      {/* Multi-Number Selection Dialog */}
      <Modal
        visible={!!multiNumberContact}
        transparent
        animationType="fade"
        onRequestClose={() => setMultiNumberContact(null)}
        statusBarTranslucent
      >
        <View style={styles.multiNumberOverlay}>
          <View
            style={[
              styles.multiNumberBox,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.multiNumberHeader}>
              <View style={[styles.contactAvatar, { backgroundColor: isDark ? '#064e3b' : '#dcfce7', marginRight: 10 }]}>
                <Text style={[styles.contactInitial, { color: colors.primary }]}>
                  {multiNumberContact?.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.multiNumberTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {multiNumberContact?.name}
                </Text>
                <Text style={[styles.multiNumberSubtitle, { color: colors.textSecondary }]}>
                  {t('contacts.selectNumberSubtitle', 'Select phone number to use:')}
                </Text>
              </View>
            </View>

            <View style={styles.numbersList}>
              {multiNumberContact?.phoneNumbers.map((phone, idx) => {
                const formatted = ContactsService.formatPhoneNumberDisplay(phone.number);
                return (
                  <TouchableOpacity
                    key={`${phone.number}-${idx}`}
                    style={[styles.numberChoiceBtn, { borderColor: colors.border, backgroundColor: isDark ? '#1e293b' : '#f8fafc' }]}
                    onPress={() => {
                      const name = multiNumberContact.name;
                      setMultiNumberContact(null);
                      handlePickPhone(name, phone.number);
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="call-outline" size={18} color={colors.primary} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.numberChoiceText, { color: colors.textPrimary }]}>{formatted}</Text>
                      <Text style={[styles.numberChoiceLabel, { color: colors.textSecondary }]}>{phone.label}</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.multiNumberCancelBtn, { borderColor: colors.border }]}
              onPress={() => setMultiNumberContact(null)}
              activeOpacity={0.7}
            >
              <Text style={[styles.multiNumberCancelText, { color: colors.textSecondary }]}>
                {t('common.cancel', 'Cancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: SPACING[4],
    marginBottom: SPACING[3],
    zIndex: 100,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING[3],
    paddingVertical: 8,
    borderRadius: RADIUS.lg,
    minHeight: 52,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  searchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING[2],
  },
  inputCol: {
    flex: 1,
    justifyContent: 'center',
  },
  input: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    padding: 0,
    margin: 0,
    lineHeight: 18,
  },
  supportingText: {
    fontSize: FONT_SIZES.xs,
    marginTop: 1,
  },
  rightActions: {
    marginLeft: SPACING[2],
    justifyContent: 'center',
    alignItems: 'center',
    width: 28,
  },
  permissionPromptCard: {
    marginTop: SPACING[2],
    padding: SPACING[3],
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  permissionPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  permissionPromptTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  permissionPromptBody: {
    fontSize: FONT_SIZES.xs,
    lineHeight: 16,
    marginBottom: SPACING[2],
  },
  permissionPromptActions: {
    flexDirection: 'row',
    gap: SPACING[2],
  },
  permissionActionBtn: {
    paddingHorizontal: SPACING[3],
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  permissionActionBtnText: {
    color: '#ffffff',
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
  },
  permissionActionSecondaryBtn: {
    paddingHorizontal: SPACING[3],
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  permissionActionSecondaryText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.medium,
  },
  dropdown: {
    marginTop: SPACING[2],
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    maxHeight: 280,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING[3],
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  doneBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  resultsList: {
    maxHeight: 240,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING[3],
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING[3],
  },
  contactInitial: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 2,
  },
  contactPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactPhone: {
    fontSize: FONT_SIZES.xs,
  },
  multipleBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
  },
  multipleBadgeText: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.medium,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING[2],
  },
  loadingBox: {
    padding: SPACING[4],
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
  },
  loadingBoxText: {
    fontSize: FONT_SIZES.xs,
  },
  emptyBox: {
    padding: SPACING[4],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: 4,
  },
  emptySub: {
    fontSize: FONT_SIZES.xs,
    textAlign: 'center',
  },
  multiNumberOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING[4],
  },
  multiNumberBox: {
    width: '100%',
    maxWidth: 360,
    borderRadius: RADIUS.xl,
    padding: SPACING[4],
    borderWidth: 1,
  },
  multiNumberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING[3],
  },
  multiNumberTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  multiNumberSubtitle: {
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  numbersList: {
    gap: SPACING[2],
    marginBottom: SPACING[3],
  },
  numberChoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING[3],
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  numberChoiceText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  numberChoiceLabel: {
    fontSize: FONT_SIZES.xs,
    textTransform: 'capitalize',
    marginTop: 1,
  },
  multiNumberCancelBtn: {
    height: 42,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  multiNumberCancelText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});
