import React, { useState, useEffect, useRef } from 'react';
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
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmail, signUpWithEmail, resetPasswordForEmail } from '../services/authService';
import { setUserDisplayName } from '../services/userService';
import { colors, borderWidth, radii, fonts } from '../theme/tokens';

type AuthMode = 'SIGN_IN' | 'SIGN_UP' | 'FORGOT_PASSWORD';

interface StatusBannerInfo {
  title: string;
  message: string;
  submessage?: string;
}

export const AuthScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<AuthMode>('SIGN_IN');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetCooldown, setResetCooldown] = useState<number>(0);

  // แจ้งเตือน In-App Banner สไตล์ Calm Mint
  const [statusBanner, setStatusBanner] = useState<StatusBannerInfo | null>(null);
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerTranslateY = useRef(new Animated.Value(-16)).current;
  const bannerTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showBannerNotice = (banner: StatusBannerInfo, autoSwitchMode?: AuthMode, durationMs: number = 2000) => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
    }
    setStatusBanner(banner);

    // Animate in
    Animated.parallel([
      Animated.timing(bannerOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(bannerTranslateY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto dismiss & switch after duration (e.g. 2 seconds)
    bannerTimerRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(bannerOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(bannerTranslateY, {
          toValue: -12,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setStatusBanner(null);
        if (autoSwitchMode) {
          setMode(autoSwitchMode);
        }
      });
    }, durationMs);
  };

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
    };
  }, []);

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
            'กรุณายืนยันอีเมล / Verify Email ✉️',
            `ส่งลิงก์ยืนยันไปที่ ${email.trim()} แล้ว กรุณากดยืนยันในอีเมล (ตรวจดูใน Spam) ก่อนเข้าสู่ระบบครับ\n\nPlease confirm your email via the link sent to your inbox/spam before signing in.`
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
          showBannerNotice(
            {
              title: 'ยืนยันอีเมลของคุณ / Verify Email ✉️',
              message: `ส่งลิงก์ยืนยันไปที่ ${email.trim()} แล้ว กรุณาตรวจสอบ Inbox หรือ Spam ก่อนเข้าสู่ระบบ`,
              submessage: 'A confirmation link has been sent to your email. Please check your inbox or spam.',
            },
            'SIGN_IN',
            2000
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Calm Mint In-App Status Banner (holds for 2s on sign up) */}
      {statusBanner && (
        <Animated.View
          style={[
            styles.bannerContainer,
            {
              top: Math.max(insets.top, 16) + 8,
              opacity: bannerOpacity,
              transform: [{ translateY: bannerTranslateY }],
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.92}
            style={styles.bannerCard}
            onPress={() => {
              if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
              setStatusBanner(null);
              setMode('SIGN_IN');
            }}
          >
            <View style={styles.bannerIconBadge}>
              <Ionicons name="mail" size={20} color={colors.accent} />
            </View>
            <View style={styles.bannerTextContainer}>
              <Text style={styles.bannerTitle}>{statusBanner.title}</Text>
              <Text style={styles.bannerMessage}>{statusBanner.message}</Text>
              {statusBanner.submessage && (
                <Text style={styles.bannerSubmessage}>{statusBanner.submessage}</Text>
              )}
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

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
                <Image
                  source={require('../../assets/icon.png')}
                  style={styles.logoImage}
                  resizeMode="cover"
                />
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
                    <Ionicons name="person-outline" size={20} color="#1F7A52" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="เช่น สมชาย หรือ Bank"
                      placeholderTextColor="#8FAEA0"
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
                  <Ionicons name="mail-outline" size={20} color="#1F7A52" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    placeholder="เช่น yourname@gmail.com"
                    placeholderTextColor="#8FAEA0"
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
                    <Ionicons name="lock-closed-outline" size={20} color="#1F7A52" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="อย่างน้อย 6 ตัวอักษร"
                      placeholderTextColor="#8FAEA0"
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
                        color={colors.ink}
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
                disabled={loading || (mode === 'FORGOT_PASSWORD' && resetCooldown > 0)}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color={colors.accent} size="small" />
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
                  <Ionicons name="arrow-back-outline" size={16} color={colors.ink} />
                  <Text style={styles.backButtonText}>กลับไปหน้าเข้าสู่ระบบ</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Data Isolation & Security Guarantee Badge */}
            <View style={styles.securityBadge}>
              <Ionicons name="shield-checkmark" size={16} color="#1F7A52" />
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
    backgroundColor: colors.bg,
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
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth,
    borderColor: colors.ink,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  logoImage: {
    width: 72,
    height: 72,
    borderRadius: 20,
  },
  appName: {
    fontSize: 30,
    fontWeight: '700',
    fontFamily: fonts.display,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  appTagline: {
    fontSize: 14,
    fontFamily: fonts.thai,
    color: colors.muted,
    marginTop: 6,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 3,
    marginBottom: 18,
    borderWidth: borderWidth,
    borderColor: colors.ink,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radii.pill,
  },
  tabButtonActive: {
    backgroundColor: colors.ink,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.accent,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: 22,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    shadowColor: colors.shadow,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
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
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
    marginBottom: 6,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: '#1F7A52',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    paddingHorizontal: 14,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.thai,
    color: colors.ink,
    height: '100%',
  },
  eyeButton: {
    padding: 6,
  },
  submitButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: colors.shadow,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.accent,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
    paddingVertical: 6,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#EAF3EE',
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: radii.pill,
  },
  securityBadgeText: {
    fontSize: 12,
    fontFamily: fonts.thai,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
    flexShrink: 1,
  },
  bannerContainer: {
    position: 'absolute',
    left: 18,
    right: 18,
    zIndex: 99999,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 20,
    padding: 14,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: colors.shadow,
        shadowOffset: { width: 4, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 0,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 6px 20px rgba(18, 61, 42, 0.35)',
      },
    }),
  },
  bannerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(111, 205, 168, 0.15)',
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  bannerTextContainer: {
    flex: 1,
    gap: 3,
  },
  bannerTitle: {
    fontFamily: fonts.thaiBold,
    fontSize: 13.5,
    color: colors.accent,
    letterSpacing: -0.2,
  },
  bannerMessage: {
    fontFamily: fonts.thai,
    fontSize: 12.5,
    color: '#FBFFFD',
    lineHeight: 18,
  },
  bannerSubmessage: {
    fontFamily: fonts.thai,
    fontSize: 11,
    color: '#A9CDB9',
    lineHeight: 16,
    marginTop: 2,
  },
});

export default AuthScreen;
