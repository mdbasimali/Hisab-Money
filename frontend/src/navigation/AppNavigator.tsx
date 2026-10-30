import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import type { RootStackParamList, MainTabParamList } from '../types';
import { FONT_SIZES, FONT_WEIGHTS } from '../constants/theme';
import { AuthService } from '../services/authService';

// Screens
import { LoginScreen } from '../screens/auth/LoginScreen';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { CustomersScreen } from '../screens/customers/CustomersScreen';
import { AddCustomerScreen } from '../screens/customers/AddCustomerScreen';
import { EditCustomerScreen } from '../screens/customers/EditCustomerScreen';
import { CustomerDetailsScreen } from '../screens/customers/CustomerDetailsScreen';
import { RecordPaymentScreen } from '../screens/payment/RecordPaymentScreen';
import { AddNewDueScreen } from '../screens/customers/AddNewDueScreen';
import { TransactionHistoryScreen } from '../screens/transactions/TransactionHistoryScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';

import { useTranslation } from 'react-i18next';

import { useAppTheme } from '../context/ThemeContext';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs({ onLogout }: { onLogout?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: FONT_SIZES.xs,
          fontWeight: FONT_WEIGHTS.semibold,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          if (route.name === 'Dashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Customers') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'History') {
            iconName = focused ? 'receipt' : 'receipt-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: t('tabs.home') }} />
      <Tab.Screen name="Customers" component={CustomersScreen} options={{ title: t('tabs.customers') }} />
      <Tab.Screen name="History" component={TransactionHistoryScreen} options={{ title: t('tabs.history') }} />
      <Tab.Screen name="Settings" options={{ title: t('tabs.settings') }}>
        {(props) => <SettingsScreen {...props} onLogout={onLogout} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const { isDark, colors } = useAppTheme();

  useEffect(() => {
    let isMounted = true;
    AuthService.isAuthenticated()
      .then((authenticated) => {
        if (isMounted) setIsLoggedIn(authenticated);
      })
      .catch((err) => {
        console.warn('[AppNavigator] Auth check warning:', err);
        if (isMounted) setIsLoggedIn(false);
      })
      .finally(() => {
        if (isMounted) setCheckingAuth(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (checkingAuth) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const customNavTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.white,
          text: colors.textPrimary,
          border: colors.border,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.white,
          text: colors.textPrimary,
          border: colors.border,
        },
      };

  return (
    <NavigationContainer theme={customNavTheme}>
      <RootStack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        {!isLoggedIn ? (
          <RootStack.Screen name="Login">
            {(props) => (
              <LoginScreen {...props} onLogin={() => setIsLoggedIn(true)} />
            )}
          </RootStack.Screen>
        ) : (
          <>
            <RootStack.Screen name="MainTabs">
              {() => <MainTabs onLogout={() => setIsLoggedIn(false)} />}
            </RootStack.Screen>
            <RootStack.Screen
              name="AddCustomer"
              component={AddCustomerScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <RootStack.Screen
              name="EditCustomer"
              component={EditCustomerScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <RootStack.Screen
              name="CustomerDetails"
              component={CustomerDetailsScreen}
            />
            <RootStack.Screen
              name="RecordPayment"
              component={RecordPaymentScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <RootStack.Screen
              name="AddNewDue"
              component={AddNewDueScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
