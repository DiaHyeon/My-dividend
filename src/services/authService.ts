// บริการจัดการยืนยันตัวตน (Authentication Service) และเซสชันผู้ใช้งาน พร้อมระบบเชื่อมต่อบัญชีทดสอบและกู้คืนรหัสผ่าน
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearPortfolioCache } from './portfolioCacheService';
import { USER_NAME_STORAGE_KEY } from './userService';

const DEMO_EMAIL = process.env.EXPO_PUBLIC_DEMO_EMAIL || 'demo@mydividend.app';
const DEMO_PASSWORD = process.env.EXPO_PUBLIC_DEMO_PASSWORD || 'Password123!';

let authInitPromise: Promise<Session | null> | null = null;

/**
 * ตรวจสอบเซสชันปัจจุบันของผู้ใช้งาน
 * พร้อมระบบ De-duplication เพื่อป้องกันไม่ให้ยิง Request ซ้อนกันหลายครั้งเมื่อเปิดแอป
 */
export async function ensureAuthenticated(): Promise<Session | null> {
  if (authInitPromise) {
    return authInitPromise;
  }

  authInitPromise = (async () => {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!sessionError && session) {
        return session;
      }

      return null;
    } catch (err: any) {
      console.warn('[AuthService] Error in ensureAuthenticated:', err.message);
      return null;
    } finally {
      authInitPromise = null;
    }
  })();

  return authInitPromise;
}

/**
 * ดึงข้อมูลเซสชันผู้ใช้งานปัจจุบัน
 */
export async function getCurrentSession(): Promise<Session | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session;
  } catch (err) {
    console.warn('[AuthService] Error getting session:', err);
    return null;
  }
}

/**
 * ดึงข้อมูลผู้ใช้งานที่กำลังล็อกอินอยู่
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch (err) {
    console.warn('[AuthService] Error getting user:', err);
    return null;
  }
}

/**
 * ฟังก์ชันเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน
 */
export async function signInWithEmail(
  email: string,
  pass: string
): Promise<{ session: Session | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pass,
    });
    return { session: data.session, error: error ? new Error(error.message) : null };
  } catch (err: any) {
    return { session: null, error: err };
  }
}

/**
 * ฟังก์ชันเข้าสู่ระบบพอร์ตทดลองทันที (1-Click Demo Sign In)
 */
export async function signInWithDemo(): Promise<{ session: Session | null; error: Error | null }> {
  return signInWithEmail(DEMO_EMAIL, DEMO_PASSWORD);
}

/**
 * ฟังก์ชันสมัครสมาชิกใหม่ พร้อมบันทึกชื่อที่แสดง (Display Name)
 */
export async function signUpWithEmail(
  email: string,
  pass: string,
  displayName?: string
): Promise<{ user: User | null; error: Error | null }> {
  try {
    const trimmedEmail = email.trim();
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: pass,
      options: displayName ? { data: { display_name: displayName.trim() } } : undefined,
    });
    return { user: data.user, error: error ? new Error(error.message) : null };
  } catch (err: any) {
    return { user: null, error: err };
  }
}

/**
 * ฟังก์ชันส่งอีเมลสำหรับกู้คืนรหัสผ่าน (Forgot Password)
 */
export async function resetPasswordForEmail(
  email: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    return { error: error ? new Error(error.message) : null };
  } catch (err: any) {
    return { error: err };
  }
}

/**
 * ออกจากระบบ และล้างข้อมูลแคชพอร์ตในเครื่องทั้งหมดเพื่อความปลอดภัยและความเป็นส่วนตัว
 */
export async function signOut(): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.auth.signOut();
    // ล้างแคชพอร์ตออฟไลน์และชื่อผู้ใช้ในเครื่อง เพื่อไม่ให้ผู้ใช้คนถัดไปเห็นข้อมูล
    await clearPortfolioCache();
    await AsyncStorage.removeItem(USER_NAME_STORAGE_KEY);
    return { error: error ? new Error(error.message) : null };
  } catch (err: any) {
    return { error: err };
  }
}

/**
 * ตรวจสอบว่าเซสชันปัจจุบันเป็นบัญชีทดสอบหรือไม่
 */
export async function isDemoSession(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || !user.email) return false;
  return user.email.toLowerCase() === DEMO_EMAIL.toLowerCase();
}

