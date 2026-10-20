import React, { Component, ReactNode, useState, useEffect } from 'react';
import { useCalmFonts } from './src/theme/useCalmFonts';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, LogBox, BackHandler, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { Dashboard } from './src/screens/Dashboard';
import { Portfolio } from './src/screens/Portfolio';
import { AssetsScreen } from './src/screens/AssetsScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { AssetType } from './src/types/database';
import { OfflineNoticeToast } from './src/components/OfflineNoticeToast';
import { DashedDivider } from './src/components/ui/DashedDivider';
import { CalmText } from './src/components/ui/CalmText';
import { colors } from './src/theme/tokens';

// ปิดหน้าต่างแจ้งเตือน LogBox ทั้งหมดบนหน้าจอมือถือ
LogBox.ignoreAllLogs(true);
LogBox.ignoreLogs([
  '`expo-notifications` functionality is not fully supported in Expo Go',
  'expo-notifications: Android Push notifications',
  'Error setting notification channel',
  'ExpoNotificationChannelManager',
  'NotificationsChannelsProvider',
  'Failed to schedule XD reminder notification',
  'Unable to configure notification handler',
  'Cannot connect to Expo CLI',
]);

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('RootErrorBoundary caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  resetError = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.errorContainer}>
          <ScrollView contentContainerStyle={styles.errorContent}>
            <Text style={styles.errorHeader}>⚠️ พบข้อผิดพลาดในการแสดงผล</Text>
            <Text style={styles.errorMessage}>
              {this.state.error?.message || 'Unknown Error'}
            </Text>
            {this.state.error?.stack && (
              <View style={styles.stackBox}>
                <Text style={styles.stackText}>{this.state.error.stack}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.retryButton} onPress={this.resetError}>
              <Text style={styles.retryButtonText}>🔄 ลองใหม่อีกครั้ง (Retry)</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

type TabType = 'DASHBOARD' | 'PORTFOLIO' | 'ASSETS';

function MainNavigator() {
  const [currentTab, setCurrentTab] = useState<TabType>('DASHBOARD');
  const [portfolioCategory, setPortfolioCategory] = useState<'ALL' | AssetType>('ALL');
  const [assetsInitialView, setAssetsInitialView] = useState<'HOLDINGS' | 'TRANSACTIONS'>('HOLDINGS');
  const [assetsCategory, setAssetsCategory] = useState<'ALL' | AssetType>('ALL');
  const insets = useSafeAreaInsets();

  const handleNavigateToPortfolio = (category?: 'ALL' | AssetType) => {
    setPortfolioCategory(category || 'ALL');
    setCurrentTab('PORTFOLIO');
  };

  const handleNavigateToAssets = (
    view: 'HOLDINGS' | 'TRANSACTIONS' = 'HOLDINGS',
    category: 'ALL' | AssetType = 'ALL'
  ) => {
    setAssetsInitialView(view);
    setAssetsCategory(category);
    setCurrentTab('ASSETS');
  };

  const handleNavigateToDashboard = () => {
    setCurrentTab('DASHBOARD');
  };

  // ดักจับปุ่ม Back บน Android เพื่อย้อนกลับไปแท็บ Overview ก่อนปิดแอป
  useEffect(() => {
    const onBackPress = () => {
      if (currentTab !== 'DASHBOARD') {
        setCurrentTab('DASHBOARD');
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [currentTab]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Screen Views (Screens remain mounted to preserve state, scroll offset, and prevent re-querying) */}
      <View style={styles.screenContainer}>
        <View style={[styles.screenWrapper, currentTab === 'DASHBOARD' ? styles.screenVisible : styles.screenHidden]}>
          <Dashboard
            onNavigateToPortfolio={handleNavigateToPortfolio}
            onNavigateToAssets={handleNavigateToAssets}
          />
        </View>
        <View style={[styles.screenWrapper, currentTab === 'PORTFOLIO' ? styles.screenVisible : styles.screenHidden]}>
          <Portfolio
            initialCategoryFilter={portfolioCategory}
            onNavigateToDashboard={handleNavigateToDashboard}
            onNavigateToAssets={handleNavigateToAssets}
          />
        </View>
        <View style={[styles.screenWrapper, currentTab === 'ASSETS' ? styles.screenVisible : styles.screenHidden]}>
          <AssetsScreen
            initialView={assetsInitialView}
            initialCategoryFilter={assetsCategory}
            onNavigateToDashboard={handleNavigateToDashboard}
            onNavigateToPortfolio={handleNavigateToPortfolio}
          />
        </View>
      </View>

      {/* Floating Offline Status Toast */}
      <OfflineNoticeToast />

      {/* Modern Docked Bottom Navigation Bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <DashedDivider color={colors.ink} marginVertical={0} />
        <View style={styles.bottomBarRow}>
          <TouchableOpacity
            style={styles.tabButton}
            onPress={handleNavigateToDashboard}
            activeOpacity={0.7}
          >
            <View style={[styles.tabContent, currentTab === 'DASHBOARD' ? styles.tabActive : styles.tabInactive]}>
              <Ionicons
                name={currentTab === 'DASHBOARD' ? 'bar-chart' : 'bar-chart-outline'}
                size={20}
                color={currentTab === 'DASHBOARD' ? colors.accent : colors.ink}
              />
              <CalmText
                variant="mono"
                size={11}
                color={currentTab === 'DASHBOARD' ? colors.accent : colors.ink}
              >
                Overview
              </CalmText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabButton}
            onPress={() => {
              setPortfolioCategory('ALL');
              setCurrentTab('PORTFOLIO');
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.tabContent, currentTab === 'PORTFOLIO' ? styles.tabActive : styles.tabInactive]}>
              <Ionicons
                name={currentTab === 'PORTFOLIO' ? 'pie-chart' : 'pie-chart-outline'}
                size={20}
                color={currentTab === 'PORTFOLIO' ? colors.accent : colors.ink}
              />
              <CalmText
                variant="mono"
                size={11}
                color={currentTab === 'PORTFOLIO' ? colors.accent : colors.ink}
              >
                Portfolio
              </CalmText>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabButton}
            onPress={() => handleNavigateToAssets('HOLDINGS', 'ALL')}
            activeOpacity={0.7}
          >
            <View style={[styles.tabContent, currentTab === 'ASSETS' ? styles.tabActive : styles.tabInactive]}>
              <Ionicons
                name={currentTab === 'ASSETS' ? 'wallet' : 'wallet-outline'}
                size={20}
                color={currentTab === 'ASSETS' ? colors.accent : colors.ink}
              />
              <CalmText
                variant="mono"
                size={11}
                color={currentTab === 'ASSETS' ? colors.accent : colors.ink}
              >
                Holdings
              </CalmText>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useCalmFonts();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  useEffect(() => {
    // ตรวจสอบเซสชันเริ่มต้น
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setAuthLoading(false);
      })
      .catch((err) => {
        console.warn('Initial session check error:', err);
        setAuthLoading(false);
      });

    // ฟังเหตุการณ์เปลี่ยนแปลงสถานะการยืนยันตัวตน (Login, Logout, Token Refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <RootErrorBoundary>
        {authLoading ? (
          <View style={styles.authLoadingContainer}>
            <ActivityIndicator size="large" color="#10B981" />
          </View>
        ) : session ? (
          <MainNavigator />
        ) : (
          <AuthScreen />
        )}
      </RootErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  authLoadingContainer: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#FFF1F2',
  },
  errorContent: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorHeader: {
    fontSize: 20,
    fontWeight: '800',
    color: '#9F1239',
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  stackBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    marginBottom: 20,
    maxHeight: 250,
  },
  stackText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  retryButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  screenContainer: {
    flex: 1,
  },
  screenWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  screenVisible: {
    display: 'flex',
  },
  screenHidden: {
    display: 'none',
  },
  bottomBar: {
    backgroundColor: colors.surface,
  },
  bottomBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  tabActive: {
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.ink,
    shadowColor: colors.accent,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  tabInactive: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'transparent',
  },
});



