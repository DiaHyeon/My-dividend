// บริการค้นหาและรวบรวมสินทรัพย์ที่บันทึกซ้ำ (Symbol เดียวกัน) เข้าเป็น Asset เดียว พร้อมย้ายประวัติธุรกรรมทั้งหมดมาผูกกับ Asset หลัก
import { supabase } from '../lib/supabase';
import { Asset, AssetType } from '../types/database';

export interface ConsolidationResult {
  mergedCount: number;
  consolidatedSymbols: string[];
}

/**
 * ตรวจสอบและรวมสินทรัพย์ที่มี symbol และ asset_type เดียวกันที่ยัง active อยู่
 * - ย้าย transactions ทั้งหมดของ asset ที่ซ้ำไปผูกกับ asset หลัก (primary asset)
 * - ย้าย dividend_schedules ไปผูกกับ asset หลัก
 * - อัปเดตราคาตลาดปัจจุบัน (current_price) ของ asset หลักให้เป็นราคาก้อนล่าสุด
 * - ทำการ soft-delete (is_archived = true) สำหรับ asset ที่ซ้ำ
 */
export async function consolidateDuplicateAssets(): Promise<ConsolidationResult> {
  try {
    // 1. ดึงสินทรัพย์ทั้งหมดที่ยังไม่ถูก archived
    const { data: assets, error } = await supabase
      .from('assets')
      .select('*')
      .eq('is_archived', false)
      .order('created_at', { ascending: true });

    if (error || !assets || assets.length === 0) {
      return { mergedCount: 0, consolidatedSymbols: [] };
    }

    // 2. จัดกลุ่มตาม symbol (ตัวพิมพ์ใหญ่) + asset_type
    const groups = new Map<string, Asset[]>();
    assets.forEach((item) => {
      const key = `${item.symbol.trim().toUpperCase()}__${item.asset_type}`;
      const existing = groups.get(key) || [];
      existing.push(item);
      groups.set(key, existing);
    });

    let mergedCount = 0;
    const consolidatedSymbols: string[] = [];

    // 3. วนลูปตรวจสอบกลุ่มที่มีมากกว่า 1 รายการ
    for (const [key, list] of groups.entries()) {
      if (list.length <= 1) continue;

      // รายการแรก (เก่าสุดตาม created_at) เป็น Primary Asset
      const primary = list[0];
      const duplicates = list.slice(1);
      const symbol = primary.symbol;

      let latestPrice = Number(primary.current_price) || 0;

      for (const dup of duplicates) {
        const dupPrice = Number(dup.current_price) || 0;
        if (dupPrice > 0) {
          latestPrice = dupPrice;
        }

        // ย้าย transactions จาก duplicate ไปยัง primary
        const { error: txMoveErr } = await supabase
          .from('transactions')
          .update({ asset_id: primary.id })
          .eq('asset_id', dup.id);

        if (txMoveErr) {
          console.warn(`[Consolidation] Error moving transactions from ${dup.id} to ${primary.id}:`, txMoveErr.message);
        }

        // ย้าย dividend_schedules จาก duplicate ไปยัง primary
        const { error: divMoveErr } = await supabase
          .from('dividend_schedules')
          .update({ asset_id: primary.id })
          .eq('asset_id', dup.id);

        if (divMoveErr) {
          console.warn(`[Consolidation] Error moving dividend schedules from ${dup.id} to ${primary.id}:`, divMoveErr.message);
        }

        // Archive duplicate asset
        const { error: archiveErr } = await supabase
          .from('assets')
          .update({ is_archived: true })
          .eq('id', dup.id);

        if (archiveErr) {
          console.warn(`[Consolidation] Error archiving duplicate asset ${dup.id}:`, archiveErr.message);
        } else {
          mergedCount++;
        }
      }

      // อัปเดตราคาล่าสุดให้กับ primary asset ถ้ามีราคาใหม่กว่า
      if (latestPrice > 0 && latestPrice !== Number(primary.current_price)) {
        await supabase
          .from('assets')
          .update({ current_price: latestPrice })
          .eq('id', primary.id);
      }

      consolidatedSymbols.push(symbol);
    }

    if (mergedCount > 0) {
      console.log(`[Consolidation] Successfully consolidated ${mergedCount} duplicate assets for:`, consolidatedSymbols);
    }

    return { mergedCount, consolidatedSymbols };
  } catch (err: any) {
    console.warn('[Consolidation] Error during consolidation:', err.message);
    return { mergedCount: 0, consolidatedSymbols: [] };
  }
}
