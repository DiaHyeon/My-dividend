import React, { Component, ReactNode, useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, LogBox, BackHandler } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Dashboard } from './src/screens/Dashboard';
import { Portfolio } from './src/screens/Portfolio';
import { AssetsScreen } from './src/screens/AssetsScreen';
import { AssetType } from './src/types/database';

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

      {/* Screen Views */}
      <View style={styles.screenContainer}>
        {currentTab === 'DASHBOARD' ? (
          <Dashboard
            onNavigateToPortfolio={handleNavigateToPortfolio}
            onNavigateToAssets={handleNavigateToAssets}
          />
        ) : currentTab === 'PORTFOLIO' ? (
          <Portfolio
            initialCategoryFilter={portfolioCategory}
            onNavigateToDashboard={handleNavigateToDashboard}
            onNavigateToAssets={handleNavigateToAssets}
          />
        ) : (
          <AssetsScreen
            initialView={assetsInitialView}
            initialCategoryFilter={assetsCategory}
            onNavigateToDashboard={handleNavigateToDashboard}
            onNavigateToPortfolio={handleNavigateToPortfolio}
          />
        )}
      </View>

      {/* Modern Docked Bottom Navigation Bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity
          style={styles.tabButton}
          onPress={handleNavigateToDashboard}
          activeOpacity={0.7}
        >
          <View style={[styles.iconWrapper, currentTab === 'DASHBOARD' && styles.iconWrapperActive]}>
            <Ionicons
              name={currentTab === 'DASHBOARD' ? 'bar-chart' : 'bar-chart-outline'}
              size={22}
              color={currentTab === 'DASHBOARD' ? '#059669' : '#64748B'}
            />
          </View>
          <Text style={[styles.tabLabel, currentTab === 'DASHBOARD' && styles.tabLabelActive]}>
            Overview
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => {
            setPortfolioCategory('ALL');
            setCurrentTab('PORTFOLIO');
          }}
          activeOpacity={0.7}
        >
          <View style={[styles.iconWrapper, currentTab === 'PORTFOLIO' && styles.iconWrapperActive]}>
            <Ionicons
              name={currentTab === 'PORTFOLIO' ? 'pie-chart' : 'pie-chart-outline'}
              size={22}
              color={currentTab === 'PORTFOLIO' ? '#059669' : '#64748B'}
            />
          </View>
          <Text style={[styles.tabLabel, currentTab === 'PORTFOLIO' && styles.tabLabelActive]}>
            Portfolio
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabButton}
          onPress={() => handleNavigateToAssets('HOLDINGS', 'ALL')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconWrapper, currentTab === 'ASSETS' && styles.iconWrapperActive]}>
            <Ionicons
              name={currentTab === 'ASSETS' ? 'wallet' : 'wallet-outline'}
              size={22}
              color={currentTab === 'ASSETS' ? '#059669' : '#64748B'}
            />
          </View>
          <Text style={[styles.tabLabel, currentTab === 'ASSETS' && styles.tabLabelActive]}>
            Holdings
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <RootErrorBoundary>
        <MainNavigator />
      </RootErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconWrapper: {
    paddingHorizontal: 18,
    paddingVertical: 4,
    borderRadius: 16,
    marginBottom: 2,
  },
  iconWrapperActive: {
    backgroundColor: '#ECFDF5',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabLabelActive: {
    color: '#059669',
    fontWeight: '700',
  },
});



