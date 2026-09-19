import React, { Component, ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, LogBox } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Dashboard } from './src/screens/Dashboard';

// ปิดการแจ้งเตือนข้อแนะนำ Expo Go Push Notifications ซึ่งแอพใช้ Local Notifications ในเครื่องเท่านั้น
LogBox.ignoreLogs([
  '`expo-notifications` functionality is not fully supported in Expo Go',
  'expo-notifications: Android Push notifications',
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

export default function App() {
  return (
    <SafeAreaProvider>
      <RootErrorBoundary>
        <View style={styles.container}>
          <StatusBar style="dark" />
          <Dashboard />
        </View>
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
});



