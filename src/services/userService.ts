import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

export const USER_NAME_STORAGE_KEY = '@mydividend_user_name';

/**
 * คำนวณคำทักทายภาษาอังกฤษตามช่วงเวลาของวัน
 * - เช้า (05:00 - 11:59): Good morning
 * - บ่าย (12:00 - 16:59): Good afternoon
 * - เย็น/ค่ำ (17:00 - 04:59): Good evening
 */
export function getTimeGreeting(date: Date = new Date()): { greeting: string; icon: string } {
  const hours = date.getHours();

  if (hours >= 5 && hours < 12) {
    return { greeting: 'Good morning', icon: '☀️' };
  } else if (hours >= 12 && hours < 17) {
    return { greeting: 'Good afternoon', icon: '🌤️' };
  } else {
    return { greeting: 'Good evening', icon: '🌙' };
  }
}

/**
 * ดึงชื่อที่แสดงของผู้ใช้
 * 1. ตรวจสอบจาก AsyncStorage ก่อน
 * 2. หากไม่มี ดึงจาก Supabase user_metadata.display_name
 * 3. หากไม่มี ดึงจากตัวหน้า @ ของอีเมล (เช่น somchai@gmail.com -> Somchai)
 * 4. หากไม่มี ให้ใช้ค่าเริ่มต้นเป็น 'Investor'
 */
export async function getUserDisplayName(): Promise<string> {
  try {
    const cachedName = await AsyncStorage.getItem(USER_NAME_STORAGE_KEY);
    if (cachedName && cachedName.trim().length > 0) {
      return cachedName.trim();
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // 1. Check user_metadata
      const metaName = user.user_metadata?.display_name || user.user_metadata?.name;
      if (metaName && typeof metaName === 'string' && metaName.trim().length > 0) {
        await AsyncStorage.setItem(USER_NAME_STORAGE_KEY, metaName.trim());
        return metaName.trim();
      }

      // 2. Check email prefix
      if (user.email) {
        const prefix = user.email.split('@')[0];
        if (prefix) {
          const capitalized = prefix.charAt(0).toUpperCase() + prefix.slice(1);
          await AsyncStorage.setItem(USER_NAME_STORAGE_KEY, capitalized);
          return capitalized;
        }
      }
    }

    return 'Investor';
  } catch (error) {
    console.warn('[UserService] Failed to get user display name:', error);
    return 'Investor';
  }
}

/**
 * บันทึกชื่อที่แสดงของผู้ใช้
 */
export async function setUserDisplayName(name: string): Promise<void> {
  try {
    const trimmed = name.trim();
    await AsyncStorage.setItem(USER_NAME_STORAGE_KEY, trimmed);

    // อัปเดตไปยัง Supabase Auth metadata ด้วย (ถ้ามีเน็ตเวิร์ก)
    await supabase.auth.updateUser({
      data: { display_name: trimmed },
    });
  } catch (error) {
    console.warn('[UserService] Failed to update user display name:', error);
  }
}
