import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmail, signUpWithEmail, resetPasswordForEmail, signInWithDemo } from '../services/authService';
import { setUserDisplayName } from '../services/userService';

type AuthMode = 'SIGN_IN' | 'SIGN_UP' | 'FORGOT_PASSWORD';

export const AuthScreen: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('SIGN_IN');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [resetCooldown, setResetCooldown] = useState<number>(0);

  // ตัวนับถอยหลัง Cooldown 60 วินาที สำหรับป้องกันการสแปมส่งอีเมลรีเซ็ตรหัสผ่าน
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (resetCooldown > 0) {
      timer = setInterval(() => {
        setResetCooldown((prev) => (prev > 1 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [resetCooldown]);

  const isNetworkError = (msg: string) => {
    const m = msg.toLowerCase();
    return m.includes('network') || m.includes('fetch') || m.includes('failed to fetch') || m.includes('connection');
  };

  // เข้าสู่ระบบด้วย Email & Password
  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      Alert.alert('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }

    setLoading(true);
    try {
      const { session, error } = await signInWithEmail(email.trim(), password);
      if (error) {
        const errorMsg = error.message || '';
        if (isNetworkError(errorMsg)) {
          Alert.alert('โหมดออฟไลน์', 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ กรุณาตรวจสอบการเชื่อมต่อเครือข่ายก่อนเข้าสู่ระบบครับ');
        } else if (errorMsg.toLowerCase().includes('email not confirmed')) {
          Alert.alert(
            'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ ✉️',
            `ระบบของ Supabase ได้ส่งลิงก์ยืนยันไปยัง ${email.trim()} เรียบร้อยแล้ว\n\n1. กรุณาเปิดกล่องจดหมายของคุณ (หรือโฟลเดอร์จดหมายขยะ/Spam)\n2. กดลิงก์ยืนยันในอีเมล 1 ครั้ง\n3. กลับมากด "เข้าสู่ระบบ" ได้ทันทีครับ\n\n💡 หมายเหตุ: หากต้องการให้สมัครแล้วเข้าได้ทันทีโดยไม่ต้องรอยืนยันอีเมล สามารถปิดการตั้งค่า "Confirm email" ได้ใน Supabase Dashboard`
          );
        } else {
          Alert.alert('เข้าสู่ระบบไม่สำเร็จ', errorMsg || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        }
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (isNetworkError(msg)) {
        Alert.alert('โหมดออฟไลน์', 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ กรุณาตรวจสอบการเชื่อมต่อเครือข่ายก่อนเข้าสู่ระบบครับ');
      } else {
        Alert.alert('เกิดข้อผิดพลาด', msg || 'ไม่สามารถเข้าสู่ระบบได้');
      }
    } finally {
      setLoading(false);
    }
  };

  // สมัครสมาชิกใหม่
  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      Alert.alert('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }

    if (password.length < 6) {
      Alert.alert('รหัสผ่านสั้นเกินไป', 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }

    setLoading(true);
    try {
      const nameToSave = displayName.trim() || email.split('@')[0];
      const { user, session, error } = await signUpWithEmail(email.trim(), password, nameToSave);

      if (error) {
        const errorMsg = error.message || '';
        if (isNetworkError(errorMsg)) {
          Alert.alert('โหมดออฟไลน์', 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ กรุณาตรวจสอบการเชื่อมต่อเครือข่ายก่อนสร้างบัญชีครับ');
        } else if (
          errorMsg.toLowerCase().includes('already registered') ||
          errorMsg.toLowerCase().includes('already in use')
        ) {
          Alert.alert(
            'อีเมลนี้มีอยู่ในระบบแล้ว 💡',
            `อีเมล ${email.trim()} ถูกลงทะเบียนไว้แล้ว หากนี่คืออีเมลของคุณและคุณจำรหัสผ่านไม่ได้ สามารถกด "กู้คืนบัญชีนี้" เพื่อรับลิงก์ตั้งรหัสผ่านเข้าใช้งานได้ทันทีครับ`,
            [
              { text: 'ใช้อีเมลอื่น', style: 'cancel' },
              {
                text: 'กู้คืนบัญชีนี้',
                onPress: () => {
                  setMode('FORGOT_PASSWORD');
                },
              },
            ]
          );
        } else {
          Alert.alert('สร้างบัญชีไม่สำเร็จ', errorMsg || 'ไม่สามารถสร้างบัญชีได้');
        }
      } else if (user) {
        if (nameToSave) {
          await setUserDisplayName(nameToSave);
        }
        if (session) {
          Alert.alert(
            'สมัครสมาชิกสำเร็จ 🎉',
            'ยินดีต้อนรับ! บัญชีของคุณถูกสร้างเรียบร้อยแล้วและเข้าสู่ระบบพอร์ตส่วนตัวของคุณแล้ว'
          );
        } else {
          Alert.alert(
            'สร้างบัญชีเรียบร้อยแล้ว ✉️',
            `ระบบได้ส่งอีเมลยืนยันไปยัง ${email.trim()} เรียบร้อยแล้ว กรุณาเปิดอีเมล (หรือดูในโฟลเดอร์ Spam/จดหมายขยะ) และกดปุ่มยืนยันก่อนเข้าสู่ระบบครับ`,
            [{ text: 'ไปหน้าเข้าสู่ระบบ', onPress: () => setMode('SIGN_IN') }]
          );
        }
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (isNetworkError(msg)) {
        Alert.alert('โหมดออฟไลน์', 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ กรุณาตรวจสอบการเชื่อมต่อเครือข่ายก่อนสร้างบัญชีครับ');
      } else {
        Alert.alert('เกิดข้อผิดพลาด', msg || 'ไม่สามารถสร้างบัญชีได้');
      }
    } finally {
      setLoading(false);
    }
  };

  // ขอรีเซ็ตรหัสผ่าน (ลืมรหัสผ่าน) พร้อมระบบ Cooldown ป้องกันการสแปม
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('กรุณาระบุอีเมล', 'กรุณากรอกอีเมลของคุณเพื่อรับลิงก์ตั้งรหัสผ่านใหม่');
      return;
    }

    if (resetCooldown > 0) {
      Alert.alert('กรุณารอสักครู่', `กรุณารออีก ${resetCooldown} วินาที ก่อนส่งคำขอใหม่อีกครั้ง`);
      return;
    }

    setLoading(true);
    try {
      const { error } = await resetPasswordForEmail(email.trim());
      if (error) {
        const errLower = (error.message || '').toLowerCase();
        if (isNetworkError(errLower)) {
          Alert.alert('โหมดออฟไลน์', 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ กรุณาตรวจสอบการเชื่อมต่อเครือข่ายก่อนส่งคำขอครับ');
        } else if (errLower.includes('rate limit') || errLower.includes('60 seconds')) {
          setResetCooldown(60);
          Alert.alert('คำขอถี่เกินไป', 'ระบบอนุญาตให้ส่งลิงก์ได้ทุกๆ 60 วินาที กรุณารอสักครู่ก่อนลองใหม่');
        } else {
          Alert.alert('ไม่สามารถส่งคำขอได้', error.message || 'เกิดข้อผิดพลาดในการส่งลิงก์');
        }
      } else {
        setResetCooldown(60); // เริ่ม Cooldown 60 วินาทีทันทีที่ส่งสำเร็จ
        Alert.alert(
          'ส่งลิงก์เรียบร้อยแล้ว 📩',
          `ระบบได้ส่งลิงก์สำหรับรีเซ็ตรหัสผ่านไปยัง ${email.trim()} เรียบร้อยแล้ว กรุณาตรวจสอบกล่องจดหมายของคุณ`,
          [{ text: 'ไปหน้าเข้าสู่ระบบ', onPress: () => setMode('SIGN_IN') }]
        );
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (isNetworkError(msg)) {
        Alert.alert('โหมดออฟไลน์', 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ กรุณาตรวจสอบการเชื่อมต่อเครือข่ายก่อนส่งคำขอครับ');
      } else {
        Alert.alert('เกิดข้อผิดพลาด', msg || 'ไม่สามารถส่งลิงก์ได้');
      }
    } finally {
      setLoading(false);
    }
  };

  // เข้าสู่ระบบด้วยบัญชีพอร์ตทดลองทันที (1-Click Demo)
  const handleDemoSignIn = async () => {
    setDemoLoading(true);
    try {
      const { session, error } = await signInWithDemo();
      if (error) {
        const errorMsg = error.message || '';
        if (isNetworkError(errorMsg)) {
          Alert.alert('โหมดออฟไลน์', 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ กรุณาตรวจสอบการเชื่อมต่อเครือข่ายก่อนเข้าสู่พอร์ตทดลองครับ');
        } else {
          Alert.alert('เข้าสู่พอร์ตทดลองไม่สำเร็จ', errorMsg || 'ไม่พบบัญชีพอร์ตทดลองในระบบ');
        }
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (isNetworkError(msg)) {
        Alert.alert('โหมดออฟไลน์', 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ กรุณาตรวจสอบการเชื่อมต่อเครือข่ายก่อนเข้าสู่พอร์ตทดลองครับ');
      } else {
        Alert.alert('เกิดข้อผิดพลาด', msg || 'ไม่สามารถเข้าสู่พอร์ตทดลองได้');
      }
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        style={styles.keyboardView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
          {/* Logo & App Title */}
          <View style={styles.brandHeader}>
            <View style={styles.logoBadge}>
              <Ionicons name="pie-chart" size={34} color="#10B981" />
            </View>
            <Text style={styles.appName}>My Dividend</Text>
            <Text style={styles.appTagline}>
              {mode === 'SIGN_IN' && 'เข้าสู่ระบบเพื่อจัดการพอร์ตการลงทุนของคุณ'}
              {mode === 'SIGN_UP' && 'สร้างพอร์ตส่วนตัวและเริ่มวางแผนรับเงินปันผล'}
              {mode === 'FORGOT_PASSWORD' && 'กู้คืนรหัสผ่านเข้าใช้งานระบบ'}
            </Text>
          </View>

          {/* Mode Switcher Tabs */}
          {mode !== 'FORGOT_PASSWORD' && (
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, mode === 'SIGN_IN' && styles.tabButtonActive]}
                onPress={() => setMode('SIGN_IN')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, mode === 'SIGN_IN' && styles.tabTextActive]}>
                  เข้าสู่ระบบ
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, mode === 'SIGN_UP' && styles.tabButtonActive]}
                onPress={() => setMode('SIGN_UP')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, mode === 'SIGN_UP' && styles.tabTextActive]}>
                  สร้างบัญชีใหม่
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Form Card */}
          <View style={styles.formCard}>
            {/* Display Name Input (Only on Sign Up) */}
            {mode === 'SIGN_UP' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>ชื่อของคุณ (Display Name)</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="person-outline" size={20} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="เช่น สมชาย หรือ Bank"
                    placeholderTextColor="#94A3B8"
                    value={displayName}
                    onChangeText={setDisplayName}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            {/* Email Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>อีเมล (Email)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="เช่น yourname@gmail.com"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Password Input (Hidden in Forgot Password mode) */}
            {mode !== 'FORGOT_PASSWORD' && (
              <View style={styles.inputGroup}>
                <View style={styles.passwordLabelRow}>
                  <Text style={styles.inputLabel}>รหัสผ่าน (Password)</Text>
                  {mode === 'SIGN_IN' && (
                    <TouchableOpacity onPress={() => setMode('FORGOT_PASSWORD')}>
                      <Text style={styles.forgotPasswordText}>ลืมรหัสผ่าน?</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                    placeholderTextColor="#94A3B8"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#64748B"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Submit Action Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (loading || (mode === 'FORGOT_PASSWORD' && resetCooldown > 0)) &&
                  styles.submitButtonDisabled,
              ]}
              onPress={
                mode === 'SIGN_IN'
                  ? handleSignIn
                  : mode === 'SIGN_UP'
                  ? handleSignUp
                  : handleForgotPassword
              }
              disabled={loading || demoLoading || (mode === 'FORGOT_PASSWORD' && resetCooldown > 0)}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {mode === 'SIGN_IN' && 'เข้าสู่ระบบ'}
                  {mode === 'SIGN_UP' && 'สร้างบัญชีและเริ่มใช้งาน'}
                  {mode === 'FORGOT_PASSWORD' &&
                    (resetCooldown > 0
                      ? `ส่งใหม่อีกครั้งได้ใน (${resetCooldown}s)`
                      : 'ส่งลิงก์รีเซ็ตรหัสผ่าน')}
                </Text>
              )}
            </TouchableOpacity>

            {/* Back to Sign In button (Only on Forgot Password mode) */}
            {mode === 'FORGOT_PASSWORD' && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setMode('SIGN_IN')}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back-outline" size={16} color="#64748B" />
                <Text style={styles.backButtonText}>กลับไปหน้าเข้าสู่ระบบ</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Demo Access Divider & Button */}
          {mode === 'SIGN_IN' && (
            <View style={styles.demoSection}>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>หรือ</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.demoButton}
                onPress={handleDemoSignIn}
                disabled={loading || demoLoading}
                activeOpacity={0.8}
              >
                {demoLoading ? (
                  <ActivityIndicator color="#10B981" size="small" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={18} color="#10B981" />
                    <Text style={styles.demoButtonText}>เข้าสู่พอร์ตทดลอง (Demo Portfolio)</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.demoHintText}>
                พอร์ตสาธิต 10 สินทรัพย์ (MCD, KO, CPALL, Kplus ฯลฯ)
              </Text>
            </View>
          )}

          {/* Data Isolation & Security Guarantee Badge */}
          <View style={styles.securityBadge}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#059669" />
            <Text style={styles.securityBadgeText}>
              ระบบรักษาความปลอดภัยแยกพอร์ตเด็ดขาดด้วย Row Level Security (RLS)
            </Text>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 160,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  appTagline: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 6,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#0F172A',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  inputGroup: {
    marginBottom: 16,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E2E8F0',
    marginBottom: 6,
  },
  forgotPasswordText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34D399',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#F8FAFC',
    height: '100%',
  },
  eyeButton: {
    padding: 6,
  },
  submitButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 6,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  demoSection: {
    marginTop: 16,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#334155',
  },
  dividerText: {
    fontSize: 12,
    color: '#64748B',
    paddingHorizontal: 12,
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    height: 46,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  demoButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
  },
  demoHintText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
    paddingHorizontal: 10,
  },
  securityBadgeText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    flexShrink: 1,
  },
});

export default AuthScreen;
