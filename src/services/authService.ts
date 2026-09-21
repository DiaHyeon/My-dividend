// บริการจัดการยืนยันตัวตน (Authentication Service) และเซสชันผู้ใช้งาน พร้อมระบบเชื่อมต่อบัญชีทดสอบอัตโนมัติอย่างปลอดภัย
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const DEMO_EMAIL = process.env.EXPO_PUBLIC_DEMO_EMAIL || 'demo@mydividend.app';
const DEMO_PASSWORD = process.env.EXPO_PUBLIC_DEMO_PASSWORD || '';

let authInitPromise: Promise<Session | null> | null = null;

/**
 * ตรวจสอบเซสชันปัจจุบัน และหากยังไม่มี จะทำการล็อกอินเข้าสู่ระบบบัญชีทดสอบอัตโนมัติ
 * พร้อมระบบ De-duplication เพื่อป้องกันไม่ให้ยิง Request ซ้อนกันหลายครั้งเมื่อเปิดแอป
 */
export async function ensureAuthenticated(): Promise<Session | null> {
  // หากมี Promise ที่กำลังทำงานอยู่แล้ว ให้ใช้ร่วมกันทันที (ป้องกัน Concurrency race condition)
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

      // หากยังไม่มีเซสชันและมีการกำหนดรหัสบัญชีทดสอบไว้ใน .env
      if (DEMO_EMAIL && DEMO_PASSWORD) {
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: DEMO_EMAIL,
            password: DEMO_PASSWORD,
          });

        if (signInError) {
          console.warn('[AuthService] Auto demo sign-in notice:', signInError.message);
          return null;
        }

        return signInData.session;
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
 * ฟังก์ชันเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน (พร้อมรองรับหน้า Login ในอนาคต)
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
 * ฟังก์ชันสมัครสมาชิกใหม่ (พร้อมรองรับหน้า Register ในอนาคต)
 */
export async function signUpWithEmail(
  email: string,
  pass: string
): Promise<{ user: User | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
    });
    return { user: data.user, error: error ? new Error(error.message) : null };
  } catch (err: any) {
    return { user: null, error: err };
  }
}

/**
 * ออกจากระบบ
 */
export async function signOut(): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.auth.signOut();
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
