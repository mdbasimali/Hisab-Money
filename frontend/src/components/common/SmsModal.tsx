import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  StatusBar as RNStatusBar,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, SPACING } from '../../constants/theme';
import { SmsService, SmsTemplateType } from '../../services/smsService';
import { useAppTheme } from '../../context/ThemeContext';
import { formatINR } from '../../utils/formatters';

interface SmsModalProps {
  visible: boolean;
  onClose: () => void;
  customerName: string;
  phoneNumber?: string | null;
  outstandingBalanceRupees: number;
  transaction?: any | null;
  initialType?: SmsTemplateType;
  transactionAmountRupees?: number;
}

export const SmsModal: React.FC<SmsModalProps> = ({
  visible,
  onClose,
  customerName,
  phoneNumber,
  outstandingBalanceRupees,
  transaction,
  initialType = 'REMINDER',
  transactionAmountRupees,
}) => {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();

  const topSafeInset = Platform.OS === 'android'
    ? Math.max(RNStatusBar.currentHeight || 0, insets.top || 0, 28)
    : Math.max(insets.top || 0, 20);

  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const isExpanded = isKeyboardVisible || isFocused;

  const scrollViewRef = useRef<any>(null);
  const inputRef = useRef<any>(null);
  const inputContainerY = useRef<number>(0);
  const isFocusedRef = useRef<boolean>(false);

  const scrollToInput = (delay = 120) => {
    setTimeout(() => {
      if (scrollViewRef.current) {
        // Scroll so the input is revealed right below the header with comfortable padding
        const targetY = Math.max(0, inputContainerY.current - 12);
        scrollViewRef.current.scrollTo({ y: targetY, animated: true });
      }
    }, delay);
  };

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      if (isFocusedRef.current) {
        scrollToInput(100);
      }
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      const text = transaction
        ? SmsService.buildMessageForTransaction({
            customerName,
            outstandingBalanceRupees,
            transaction,
          })
        : SmsService.buildMessage({
            type: initialType,
            customerName,
            phoneNumber,
            outstandingBalanceRupees,
            transactionAmountRupees,
          });
      setMessageText(text);
      setIsKeyboardVisible(false);
      setIsFocused(false);
      isFocusedRef.current = false;
    } else {
      Keyboard.dismiss();
    }
  }, [
    visible,
    transaction,
    initialType,
    customerName,
    phoneNumber,
    outstandingBalanceRupees,
    transactionAmountRupees,
  ]);

  const handleInputFocus = () => {
    isFocusedRef.current = true;
    setIsFocused(true);
    scrollToInput(150);
  };

  const handleInputBlur = () => {
    isFocusedRef.current = false;
    setIsFocused(false);
  };

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const handleSend = async () => {
    Keyboard.dismiss();
    if (!phoneNumber) {
      Alert.alert(
        'Missing Phone Number',
        'This customer does not have a phone number saved. Please add a phone number to their profile first.'
      );
      return;
    }

    if (!messageText.trim()) {
      Alert.alert('Empty Message', 'Please enter a message before sending.');
      return;
    }

    setLoading(true);
    const result = await SmsService.openSmsComposer(phoneNumber, messageText.trim());
    setLoading(false);

    if (result.success) {
      onClose();
    } else {
      Alert.alert('SMS Notice', result.error || 'Could not open native SMS app.');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={styles.overlay}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            if (isKeyboardVisible) {
              Keyboard.dismiss();
            } else {
              handleClose();
            }
          }}
        >
          <View style={styles.backdropTouchable} />
        </TouchableWithoutFeedback>

        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.border,
              borderWidth: isDark ? 1 : 0,
              paddingTop: isExpanded ? topSafeInset + 10 : SPACING[4],
              marginTop: isExpanded ? 0 : topSafeInset,
            },
            isExpanded && styles.sheetContainerKeyboard,
          ]}
        >
          {/* Header (Pinned at top of sheet) */}
          <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? colors.primaryLight : '#f0fdf4' }]}>
                <Ionicons name="chatbubble-ellipses" size={20} color={colors.primary} />
              </View>
              <View style={styles.headerTextCol}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>{t('common.sendSms') || 'Send SMS'}</Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  To: {customerName} {phoneNumber ? `(${phoneNumber})` : '(No Phone)'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={[styles.closeBtn, { backgroundColor: isDark ? '#334155' : '#f1f5f9' }]}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
              delayPressIn={0}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel') || 'Close'}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Scrollable Content Body */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
          >
            {/* Recipient & Transaction Details Card */}
            <View style={[styles.recipientCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardRow}>
                <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Recipient</Text>
                <Text style={[styles.cardValue, { color: colors.textPrimary }]}>{customerName}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Mobile Number</Text>
                <Text style={[styles.cardValue, !phoneNumber ? { color: colors.danger } : { color: colors.textPrimary }]}>
                  {phoneNumber || 'Not provided'}
                </Text>
              </View>

              {transaction ? (
                <>
                  <View style={styles.cardRow}>
                    <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Selected Transaction</Text>
                    <Text style={[styles.cardValue, { color: transaction.type === 'payment' ? colors.primary : colors.danger, fontWeight: '700' }]}>
                      {transaction.type === 'payment'
                        ? 'Payment Received'
                        : transaction.subType === 'opening'
                        ? 'Opening Balance'
                        : transaction.reason
                        ? `Due: ${transaction.reason}`
                        : 'New Due Added'}
                    </Text>
                  </View>
                  <View style={styles.cardRow}>
                    <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Transaction Amount</Text>
                    <Text style={[styles.cardValue, { color: transaction.type === 'payment' ? colors.primary : colors.danger, fontWeight: '700' }]}>
                      {transaction.type === 'payment' ? '-' : '+'}{formatINR(transaction.amount)}
                    </Text>
                  </View>
                </>
              ) : null}

              <View style={styles.cardRow}>
                <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Current Due</Text>
                <Text
                  style={[
                    styles.cardValue,
                    {
                      color: outstandingBalanceRupees > 0 ? colors.danger : colors.primary,
                      fontWeight: '700',
                    },
                  ]}
                >
                  ₹{outstandingBalanceRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            {/* Editable Message Input (with layout anchor) */}
            <View
              onLayout={(e) => {
                inputContainerY.current = e.nativeEvent.layout.y;
              }}
            >
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MESSAGE PREVIEW & EDIT</Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }, isFocused && { borderColor: colors.primary, backgroundColor: isDark ? colors.surfaceCard : '#ffffff' }]}>
                <TextInput
                  ref={inputRef}
                  style={[styles.messageInput, { color: colors.textPrimary }]}
                  multiline
                  numberOfLines={4}
                  value={messageText}
                  onChangeText={setMessageText}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  placeholder="Type your message here..."
                  placeholderTextColor={colors.textMuted}
                  textAlignVertical="top"
                  scrollEnabled={false}
                />
                <Text style={[styles.charCount, { color: colors.textMuted }]}>{messageText.length} characters</Text>
              </View>
            </View>

            {/* Disclaimer */}
            <View style={styles.disclaimerRow}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
              <Text style={[styles.disclaimerText, { color: colors.textMuted }]}>
                Opens your default SMS app so you can review before sending. Standard carrier rates apply.
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={handleClose} disabled={loading}>
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>{t('common.cancel') || 'Cancel'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: colors.primary }, !phoneNumber && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={loading || !phoneNumber}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.sendBtnText}>Open SMS App</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  backdropTouchable: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[4],
    paddingBottom: Platform.OS === 'android' ? SPACING[4] : SPACING[6],
    maxHeight: '90%',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  sheetContainerKeyboard: {
    maxHeight: '100%',
    paddingBottom: SPACING[3],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING[3],
    paddingBottom: SPACING[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerTextCol: {
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING[2],
  },
  scrollView: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: SPACING[4],
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    marginBottom: SPACING[2],
    marginTop: SPACING[2],
  },
  recipientCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: SPACING[3],
    marginBottom: SPACING[3],
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  cardLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  cardValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  inputWrapper: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: SPACING[3],
    marginBottom: SPACING[2],
  },
  inputWrapperFocused: {
    borderColor: '#16a34a',
    backgroundColor: '#ffffff',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  messageInput: {
    fontSize: 14,
    color: COLORS.textPrimary,
    minHeight: 85,
    lineHeight: 20,
    padding: 0,
  },
  charCount: {
    textAlign: 'right',
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: SPACING[4],
    paddingHorizontal: 2,
  },
  disclaimerText: {
    fontSize: 11,
    color: COLORS.textMuted,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  sendBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
  sendBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
