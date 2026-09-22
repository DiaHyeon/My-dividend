import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { AssetSummary, AssetType, Transaction } from '../types/database';
import { fetchStockPrice, fetchExchangeRate } from '../services/stockService';
import { fetchFundNav } from '../services/fundService';
import { scheduleXdReminder, cancelRemindersForSymbol } from '../services/notificationService';
import { detectPendingSplits, applySplitAdjustment, SplitDetectionResult } from '../services/splitService';
import { getSectorsForType, getAssetSector, setAssetSector, detectSector, getSectorDefinition } from '../services/sectorService';
import { evaluateCashTax, calculateAnnualGrossInterest } from '../services/taxService';
import { getAssetCurrency, setAssetCurrency, getCachedExchangeRate } from '../services/currencyService';
import { CashAssetForm } from './CashAssetForm';
import { CalendarPickerModal } from './CalendarPickerModal';
import { SectorPickerModal } from './SectorPickerModal';

interface EditAssetModalProps {
  visible: boolean;
  asset: AssetSummary | null;
  onClose: () => void;
  onSuccess: () => void;
}

const ASSET_TYPES: { label: string; shortLabel: string; value: AssetType; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'หุ้น (STOCKS)', shortLabel: 'หุ้น', value: 'STOCKS', icon: 'trending-up' },
  { label: 'กองทุน (FUNDS)', shortLabel: 'กองทุน', value: 'FUNDS', icon: 'pie-chart' },
  { label: 'เงินฝาก (CASH)', shortLabel: 'เงินฝาก', value: 'CASH', icon: 'wallet' },
];

export const EditAssetModal: React.FC<EditAssetModalProps> = ({
  visible,
  asset,
  onClose,
  onSuccess,
}) => {
  const [symbol, setSymbol] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('STOCKS');
  const [shares, setShares] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [taxRatePercent, setTaxRatePercent] = useState('10');
  const [expectedDpu, setExpectedDpu] = useState('');
  const [xdDate, setXdDate] = useState('');
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [existingScheduleId, setExistingScheduleId] = useState<string | null>(null);
  const [selectedSector, setSelectedSector] = useState<string>('Technology');
  const [isSectorPickerVisible, setIsSectorPickerVisible] = useState(false);
  const [interestRate, setInterestRate] = useState<string>('1.5');
  const [interestFrequency, setInterestFrequency] = useState<'MONTHLY' | 'SEMI_ANNUAL' | 'ANNUAL'>('MONTHLY');
  const [isAutoCashTax, setIsAutoCashTax] = useState(true);

  // Currency State for Multi-currency Support
  const [currency, setCurrency] = useState<'THB' | 'USD'>('THB');
  const [exchangeRate, setExchangeRate] = useState<number>(34.00);
  const [isFetchingRate, setIsFetchingRate] = useState(false);

  // Auto-calculate tax rate for CASH when deposit amount, interest rate or segment changes
  useEffect(() => {
    if (assetType === 'CASH' && isAutoCashTax) {
      const dep = parseFloat(shares) || 0;
      const rate = parseFloat(interestRate) || 0;
      const evalResult = evaluateCashTax(dep, rate, selectedSector);
      setTaxRatePercent(evalResult.suggestedTaxRatePercent.toString());
    }
  }, [assetType, shares, interestRate, selectedSector, isAutoCashTax]);

  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isRefreshingPrice, setIsRefreshingPrice] = useState(false);
  const [priceFeedback, setPriceFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Stock Split Detection State
  const [splitDetection, setSplitDetection] = useState<SplitDetectionResult | null>(null);
  const [isCheckingSplit, setIsCheckingSplit] = useState(false);
  const [isApplyingSplit, setIsApplyingSplit] = useState(false);

  // Initialize values when asset changes or modal becomes visible
  useEffect(() => {
    if (!asset || !visible) return;

    setSymbol(asset.symbol || '');
    setAssetType(asset.asset_type || 'STOCKS');
    setShares(asset.net_shares !== undefined ? asset.net_shares.toString() : '0');
    setTaxRatePercent(
      asset.tax_rate !== undefined ? (Number(asset.tax_rate) * 100).toFixed(0) : (asset.asset_type === 'CASH' ? '0' : '10')
    );
    setPriceFeedback('');

    // Load Sector
    getAssetSector(asset.id, asset.symbol, asset.asset_type).then((sec) => {
      setSelectedSector(sec);
    });

    // Load Currency & Exchange Rate
    const initializeCurrency = async () => {
      const rate = await getCachedExchangeRate();
      setExchangeRate(rate);

      const detectedCurr = await getAssetCurrency(asset.id, asset.symbol, asset.tax_rate, asset.asset_type);
      setCurrency(detectedCurr);

      const dbCost = asset.weighted_average_cost !== undefined ? Number(asset.weighted_average_cost) : 0;
      const dbPrice = asset.current_price !== undefined ? Number(asset.current_price) : 0;

      if (detectedCurr === 'USD' && rate > 0) {
        setCostPrice((dbCost / rate).toFixed(2));
        setCurrentPrice((dbPrice / rate).toFixed(2));
      } else {
        setCostPrice(dbCost.toString());
        setCurrentPrice(dbPrice.toString());
      }
    };
    initializeCurrency();

    // Fetch related dividend schedule
    const loadSchedules = async () => {
      setIsLoadingDetails(true);
      try {
        const rate = await getCachedExchangeRate();
        const detectedCurr = await getAssetCurrency(asset.id, asset.symbol, asset.tax_rate, asset.asset_type);

        const { data: divData, error } = await supabase
          .from('dividend_schedules')
          .select('*')
          .eq('asset_id', asset.id)
          .order('xd_date', { ascending: false })
          .limit(1);

        if (!error && divData && divData.length > 0) {
          const rawDpu = divData[0].dpu ? Number(divData[0].dpu) : 0;
          setExpectedDpu(rawDpu.toString());
          setXdDate(divData[0].xd_date || '');
          setExistingScheduleId(divData[0].id);

          if (asset.asset_type === 'CASH') {
            if (rawDpu > 0) {
              setInterestRate((rawDpu * 12 * 100).toFixed(2));
            }
          }
        } else {
          setExpectedDpu('0');
          const nextMonth = new Date();
          nextMonth.setDate(nextMonth.getDate() + 30);
          setXdDate(nextMonth.toISOString().split('T')[0]);
          setExistingScheduleId(null);
        }
      } catch (err: any) {
        console.warn('Error fetching schedule details:', err.message);
      } finally {
        setIsLoadingDetails(false);
      }
    };

    loadSchedules();

    // Check for pending stock splits (only applicable for STOCKS)
    const checkSplits = async () => {
      if (asset.asset_type !== 'STOCKS') {
        setSplitDetection(null);
        return;
      }
      setIsCheckingSplit(true);
      try {
        const { data: txs, error: txErr } = await supabase
          .from('transactions')
          .select('*')
          .eq('asset_id', asset.id);

        if (!txErr && txs && txs.length > 0) {
          const result = await detectPendingSplits(asset.id, asset.symbol, txs as Transaction[]);
          setSplitDetection(result);
        } else {
          setSplitDetection(null);
        }
      } catch (e) {
        console.warn('Error checking pending splits:', e);
      } finally {
        setIsCheckingSplit(false);
      }
    };

    checkSplits();
  }, [asset, visible]);

  // Handle switching currency toggle in Edit Modal
  const handleCurrencyToggle = (targetCurr: 'THB' | 'USD') => {
    if (targetCurr === currency) return;
    const currentCost = parseFloat(costPrice) || 0;
    const currentCurrPrice = parseFloat(currentPrice) || 0;
    const currentDpu = parseFloat(expectedDpu) || 0;
    const rate = exchangeRate > 0 ? exchangeRate : 34.00;

    if (targetCurr === 'USD') {
      // THB -> USD
      setCostPrice((currentCost / rate).toFixed(2));
      setCurrentPrice((currentCurrPrice / rate).toFixed(2));
      if (currentDpu > 0) setExpectedDpu((currentDpu / rate).toFixed(4));
      setTaxRatePercent('15');
    } else {
      // USD -> THB
      setCostPrice((currentCost * rate).toFixed(2));
      setCurrentPrice((currentCurrPrice * rate).toFixed(2));
      if (currentDpu > 0) setExpectedDpu((currentDpu * rate).toFixed(4));
      setTaxRatePercent('10');
    }
    setCurrency(targetCurr);
  };

  const refreshExchangeRate = async () => {
    setIsFetchingRate(true);
    const rate = await fetchExchangeRate();
    if (rate && rate > 0) {
      setExchangeRate(rate);
    }
    setIsFetchingRate(false);
  };

  // Quick refresh latest price from stock / fund service
  const handleRefreshLatestPrice = async () => {
    if (!symbol.trim()) return;
    setIsRefreshingPrice(true);

    if (assetType === 'FUNDS') {
      setPriceFeedback('กำลังดึงค่า NAV ล่าสุดจาก ก.ล.ต...');
      try {
        const navData = await fetchFundNav(undefined, symbol.trim().toUpperCase());
        if (navData && navData.latestNav > 0) {
          const navStr = navData.latestNav.toFixed(4);
          setCurrentPrice(navStr);
          setPriceFeedback(`✅ อัปเดต NAV ล่าสุด: ฿${navStr}${navData.navDate ? ` (${navData.navDate})` : ''}`);
        } else {
          setPriceFeedback('ℹ️ ไม่พบ NAV จาก ก.ล.ต. กรุณากรอกด้วยตัวเอง');
        }
      } catch {
        setPriceFeedback('⚠️ ไม่สามารถดึง NAV ได้ในขณะนี้');
      } finally {
        setIsRefreshingPrice(false);
      }
      return;
    }

    setPriceFeedback('กำลังดึงราคาตลาดล่าสุด...');

    try {
      const price = await fetchStockPrice(symbol.trim().toUpperCase());
      if (price !== null && price > 0) {
        if (currency === 'USD') {
          setCurrentPrice(price.toString());
          const thbEquivalent = (price * exchangeRate).toFixed(2);
          setPriceFeedback(`✅ อัปเดตราคาล่าสุด: $${price.toFixed(2)} (~฿${thbEquivalent})`);
        } else {
          setCurrentPrice(price.toString());
          setPriceFeedback(`✅ อัปเดตราคาล่าสุดแล้ว: ฿${price.toFixed(2)}`);
        }
      } else {
        setPriceFeedback('ℹ️ ไม่พบราคาจากตลาด หรือเป็นสินทรัพย์นอกตลาด');
      }
    } catch {
      setPriceFeedback('⚠️ ไม่สามารถดึงราคาได้ในขณะนี้');
    } finally {
      setIsRefreshingPrice(false);
    }
  };

  // Calculations for live preview
  const numShares = parseFloat(shares) || 0;
  const numCurrentPrice = parseFloat(currentPrice) || 0;
  const numCostPrice = parseFloat(costPrice) || 0;
  const effectiveRate = currency === 'USD' ? exchangeRate : 1.0;
  const previewMarketValue = numShares * numCurrentPrice * effectiveRate;
  const previewTotalCost = numShares * numCostPrice * effectiveRate;
  const previewPL = previewMarketValue - previewTotalCost;
  const previewPLPercent = previewTotalCost > 0 ? (previewPL / previewTotalCost) * 100 : 0;

  // Handle Save
  const handleSave = async () => {
    if (!asset) return;

    const trimmedSymbol = symbol.trim().toUpperCase();
    const parsedShares = parseFloat(shares);
    const parsedCostPrice = parseFloat(costPrice);
    const parsedCurrentPrice = parseFloat(currentPrice);
    const parsedTaxPercent = parseFloat(taxRatePercent);
    const parsedDpu = expectedDpu.trim() ? parseFloat(expectedDpu) : 0;

    if (!trimmedSymbol) {
      Alert.alert('ข้อมูลไม่ครบถ้วน', 'กรุณาระบุชื่อย่อสินทรัพย์ (Symbol)');
      return;
    }

    if (isNaN(parsedShares) || parsedShares < 0) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณาระบุจำนวนหุ้นที่ถูกต้อง (0 ขึ้นไป)');
      return;
    }

    if (isNaN(parsedCostPrice) || parsedCostPrice < 0) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณาระบุราคาต้นทุนเฉลี่ยที่ถูกต้อง');
      return;
    }

    if (isNaN(parsedCurrentPrice) || parsedCurrentPrice < 0) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณาระบุราคาตลาดปัจจุบันที่ถูกต้อง');
      return;
    }

    setIsSubmitting(true);

    try {
      const rateMultiplier = currency === 'USD' ? (exchangeRate || 34.00) : 1.0;
      const convertedCurrentPrice = parsedCurrentPrice * rateMultiplier;
      const convertedCostPrice = parsedCostPrice * rateMultiplier;
      const convertedDpu = parsedDpu * rateMultiplier;

      const calculatedTaxRate = isNaN(parsedTaxPercent) || parsedTaxPercent < 0
        ? (currency === 'USD' ? 0.1500 : 0.1000)
        : Number((parsedTaxPercent / 100).toFixed(4));

      // 1. Update Asset table
      const { error: assetError } = await supabase
        .from('assets')
        .update({
          symbol: trimmedSymbol,
          asset_type: assetType,
          current_price: Number(convertedCurrentPrice.toFixed(4)),
          tax_rate: calculatedTaxRate,
        })
        .eq('id', asset.id);

      if (assetError) {
        throw new Error(assetError.message || 'ไม่สามารถอัปเดตสินทรัพย์ได้');
      }

      // 2. Update or Insert Transaction (to update net_shares & average cost in view_asset_summary)
      const { data: existingTxs, error: txFetchError } = await supabase
        .from('transactions')
        .select('*')
        .eq('asset_id', asset.id)
        .order('created_at', { ascending: true });

      if (!txFetchError && existingTxs && existingTxs.length > 0) {
        if (existingTxs.length === 1) {
          // Single transaction: update directly
          const primaryTx = existingTxs[0];
          const { error: txUpdateError } = await supabase
            .from('transactions')
            .update({
              shares: Number(parsedShares.toFixed(4)),
              price_per_share: Number(convertedCostPrice.toFixed(4)),
            })
            .eq('id', primaryTx.id);

          if (txUpdateError) {
            console.warn('Transaction update error:', txUpdateError.message);
          }
        } else {
          // Multiple DCA transactions: consolidate cleanly into single record with new total and cost
          const primaryTx = existingTxs[0];
          const otherTxIds = existingTxs.slice(1).map((t) => t.id);

          if (otherTxIds.length > 0) {
            await supabase.from('transactions').delete().in('id', otherTxIds);
          }

          const { error: txUpdateError } = await supabase
            .from('transactions')
            .update({
              shares: Number(parsedShares.toFixed(4)),
              price_per_share: Number(convertedCostPrice.toFixed(4)),
            })
            .eq('id', primaryTx.id);

          if (txUpdateError) {
            console.warn('Transaction consolidate error:', txUpdateError.message);
          }
        }
      } else {
        // If no existing transaction, insert one
        const todayDate = new Date().toISOString().split('T')[0];
        await supabase.from('transactions').insert({
          asset_id: asset.id,
          type: 'BUY',
          shares: Number(parsedShares.toFixed(4)),
          price_per_share: Number(convertedCostPrice.toFixed(4)),
          transaction_date: todayDate,
        });
      }

      // 3. Update or Insert Dividend Schedule (STOCKS & FUNDS)
      if (assetType === 'STOCKS' || assetType === 'FUNDS') {
        const targetXdDate = xdDate.trim() || new Date().toISOString().split('T')[0];

        if (existingScheduleId) {
          await supabase
            .from('dividend_schedules')
            .update({
              dpu: Number(parsedDpu.toFixed(4)),
              xd_date: targetXdDate,
            })
            .eq('id', existingScheduleId);
        } else if (parsedDpu > 0) {
          await supabase.from('dividend_schedules').insert({
            asset_id: asset.id,
            dpu: Number(parsedDpu.toFixed(4)),
            xd_date: targetXdDate,
            is_projected: true,
          });
        }

        if (parsedDpu > 0) {
          await scheduleXdReminder(trimmedSymbol, targetXdDate);
        }
      } else if (assetType === 'CASH') {
        const parsedRate = parseFloat(interestRate);
        // Clean existing schedules
        await supabase.from('dividend_schedules').delete().eq('asset_id', asset.id);

        if (!isNaN(parsedRate) && parsedRate > 0) {
          const currentYear = new Date().getFullYear();
          const schedules: any[] = [];
          const annualDpu = parsedRate / 100;

          if (interestFrequency === 'MONTHLY') {
            for (let m = 0; m < 12; m++) {
              const d = new Date(currentYear, m, 28);
              schedules.push({
                asset_id: asset.id,
                dpu: Number((annualDpu / 12).toFixed(6)),
                xd_date: d.toISOString().split('T')[0],
                is_projected: true,
              });
            }
          } else if (interestFrequency === 'SEMI_ANNUAL') {
            schedules.push(
              {
                asset_id: asset.id,
                dpu: Number((annualDpu / 2).toFixed(6)),
                xd_date: `${currentYear}-06-30`,
                is_projected: true,
              },
              {
                asset_id: asset.id,
                dpu: Number((annualDpu / 2).toFixed(6)),
                xd_date: `${currentYear}-12-31`,
                is_projected: true,
              }
            );
          } else {
            schedules.push({
              asset_id: asset.id,
              dpu: Number(annualDpu.toFixed(6)),
              xd_date: `${currentYear}-12-31`,
              is_projected: true,
            });
          }
          await supabase.from('dividend_schedules').insert(schedules);
        }
      }

      // 4. Save Sector Override & Currency
      const finalSector = selectedSector && selectedSector !== 'Other'
        ? selectedSector
        : detectSector(trimmedSymbol, assetType);
      await setAssetSector(asset.id, finalSector);
      await setAssetCurrency(asset.id, currency);

      const alertDetail = currency === 'USD'
        ? ` (ราคาแปลงจาก $${parsedCostPrice.toFixed(2)} เป็น ฿${convertedCostPrice.toFixed(2)})`
        : '';
      Alert.alert('สำเร็จ', `แก้ไขข้อมูลสินทรัพย์ ${trimmedSymbol} เรียบร้อยแล้ว${alertDetail}`);
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกการแก้ไขได้');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle One-Click Automatic Stock Split Adjustment
  const handleApplySplit = async () => {
    if (!splitDetection?.latestSplit || !asset) return;
    const split = splitDetection.latestSplit;
    Alert.alert(
      `ยืนยันปรับการแตกพาร์ (${split.splitRatioStr})`,
      `ระบบจะปรับจำนวนหุ้น x${split.ratio} และหารต้นทุนต่อหุ้นสำหรับ ${splitDetection.eligibleTransactions.length} รายการที่ซื้อก่อน ${split.date} อัตโนมัติ เพื่อให้พอร์ตและปันผลตรงกับความเป็นจริง`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ยืนยันปรับพาร์',
          onPress: async () => {
            setIsApplyingSplit(true);
            try {
              const res = await applySplitAdjustment(
                asset,
                split,
                splitDetection.eligibleTransactions
              );
              Alert.alert(
                'สำเร็จ',
                `ปรับสัดส่วนการแตกพาร์ ${split.splitRatioStr} เรียบร้อยแล้ว (${res.updatedCount} รายการ) จำนวนหุ้นใหม่: ${res.newShares.toFixed(2)} หุ้น`
              );
              setSplitDetection(null);
              onSuccess();
              onClose();
            } catch (err: any) {
              Alert.alert('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถปรับสัดส่วนได้');
            } finally {
              setIsApplyingSplit(false);
            }
          },
        },
      ]
    );
  };

  // Handle Delete (Prominent Red Button with Confirmation)
  const handleDelete = () => {
    if (!asset) return;

    Alert.alert(
      'ยืนยันการลบสินทรัพย์',
      `คุณแน่ใจหรือไม่ที่จะลบ ${asset.symbol} ออกจากพอร์ตการลงทุน? ข้อมูลจะถูกนำออกจาก Dashboard ทันที`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบสินทรัพย์',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              // Perform Soft Delete as required by BRIEF.md
              const { error } = await supabase
                .from('assets')
                .update({ is_archived: true })
                .eq('id', asset.id);

              if (error) {
                throw new Error(error.message || 'ไม่สามารถลบสินทรัพย์ได้');
              }

              // Clean scheduled XD reminders for this symbol so no orphaned reminders pop up
              await cancelRemindersForSymbol(asset.symbol);

              Alert.alert('สำเร็จ', `ลบ ${asset.symbol} ออกจากพอร์ตแล้ว`);
              onSuccess();
              onClose();
            } catch (err: any) {
              Alert.alert('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถลบสินทรัพย์ได้');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (!asset) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'android' ? 'height' : 'padding'}
        style={styles.modalOverlay}
      >
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>แก้ไขสินทรัพย์</Text>
              <Text style={styles.sheetSubtitle}>{asset.symbol} • รายละเอียดการลงทุน</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {isLoadingDetails ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={styles.loadingText}>กำลังโหลดข้อมูลสินทรัพย์...</Text>
              </View>
            ) : null}

            {/* 1. Minimal Segmented Category Selector */}
            <View style={styles.assetTypeSegmentContainer}>
              {ASSET_TYPES.map((type) => {
                const isSelected = assetType === type.value;
                return (
                  <TouchableOpacity
                    key={type.value}
                    style={[styles.assetTypeSegmentTab, isSelected && styles.assetTypeSegmentTabActive]}
                    onPress={() => setAssetType(type.value)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={type.icon}
                      size={15}
                      color={isSelected ? '#0F172A' : '#64748B'}
                    />
                    <Text style={[styles.assetTypeSegmentText, isSelected && styles.assetTypeSegmentTextActive]}>
                      {type.shortLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {assetType === 'CASH' ? (
              <CashAssetForm
                accountName={symbol}
                onChangeAccountName={setSymbol}
                selectedSector={selectedSector}
                onChangeSector={setSelectedSector}
                depositAmount={shares}
                onChangeDepositAmount={(val) => {
                  setShares(val);
                  setCostPrice('1');
                  setCurrentPrice('1');
                }}
                interestRate={interestRate}
                onChangeInterestRate={setInterestRate}
                interestFrequency={interestFrequency}
                onChangeInterestFrequency={setInterestFrequency}
                taxRatePercent={taxRatePercent}
                onChangeTaxRatePercent={(rate) => {
                  setTaxRatePercent(rate);
                  setIsAutoCashTax(false);
                }}
                isAutoCashTax={isAutoCashTax}
                onToggleAutoTax={() => {
                  const nextAuto = !isAutoCashTax;
                  setIsAutoCashTax(nextAuto);
                  if (nextAuto) {
                    const dep = parseFloat(shares) || 0;
                    const rate = parseFloat(interestRate) || 0;
                    const evalResult = evaluateCashTax(dep, rate, selectedSector);
                    setTaxRatePercent(evalResult.suggestedTaxRatePercent.toString());
                  }
                }}
              />
            ) : (
              /* STOCKS / FUNDS FIELDS */
              <View>
                {/* Stock Split Detection Notice Banner */}
                {splitDetection?.hasSplit && splitDetection.latestSplit && (
                  <View style={styles.splitBanner}>
                    <View style={styles.splitBannerHeader}>
                      <View style={styles.splitIconBox}>
                        <Ionicons name="git-branch" size={18} color="#D97706" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.splitTitle}>ตรวจพบการแตกพาร์</Text>
                          <View style={styles.splitBadge}>
                            <Text style={styles.splitBadgeText}>{splitDetection.latestSplit.splitRatioStr}</Text>
                          </View>
                        </View>
                        <Text style={styles.splitSubtitle}>
                          มีผล {splitDetection.latestSplit.date} • พบรายการซื้อก่อนแตกพาร์ {splitDetection.eligibleTransactions.length} รายการ
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.applySplitButton}
                      disabled={isApplyingSplit}
                      onPress={handleApplySplit}
                      activeOpacity={0.8}
                    >
                      {isApplyingSplit ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="flash" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.applySplitButtonText}>ปรับจำนวนหุ้น & ต้นทุนให้อัตโนมัติ (1-Click)</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* 2. Symbol Field */}
                <Text style={styles.fieldLabel}>ชื่อย่อสินทรัพย์ (Symbol)</Text>
                <TextInput
                  style={styles.input}
                  value={symbol}
                  onChangeText={setSymbol}
                  placeholder="เช่น PTT, AAPL, SCBDV"
                  placeholderTextColor="#94A3B8"
                />

                {/* Segment / Category Selector */}
                <View style={styles.sectorHeaderRow}>
                  <Text style={styles.fieldLabelNoMargin}>
                    {assetType === 'FUNDS' ? 'ประเภทกองทุน' : 'กลุ่มอุตสาหกรรม (Segment)'}
                  </Text>
                  {selectedSector ? (
                    <TouchableOpacity
                      style={[
                        styles.detectedSectorBadge,
                        {
                          backgroundColor:
                            getSectorDefinition(selectedSector, assetType).color + '1A',
                        },
                      ]}
                      onPress={() => setIsSectorPickerVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={getSectorDefinition(selectedSector, assetType).icon as any}
                        size={13}
                        color={getSectorDefinition(selectedSector, assetType).color}
                      />
                      <Text
                        style={[
                          styles.detectedSectorBadgeText,
                          { color: getSectorDefinition(selectedSector, assetType).color },
                        ]}
                        numberOfLines={1}
                      >
                        {getSectorDefinition(selectedSector, assetType).label}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={12}
                        color={getSectorDefinition(selectedSector, assetType).color}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectorChipsScroll}>
                  {getSectorsForType(assetType).map((sec) => (
                    <TouchableOpacity
                      key={sec.id}
                      style={[
                        styles.sectorChip,
                        selectedSector === sec.id && { backgroundColor: sec.color, borderColor: sec.color },
                      ]}
                      onPress={() => setSelectedSector(sec.id)}
                    >
                      <Text
                        style={[
                          styles.sectorChipText,
                          selectedSector === sec.id && styles.sectorChipTextActive,
                        ]}
                      >
                        {sec.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {/* Currency Selector (THB vs USD) */}
                {assetType === 'STOCKS' && (
                  <>
                    <Text style={styles.fieldLabel}>สกุลเงินที่บันทึก (Currency)</Text>
                    <View style={styles.currencyToggleContainer}>
                      <TouchableOpacity
                        style={[styles.currencyBtn, currency === 'THB' && styles.currencyBtnActive]}
                        onPress={() => handleCurrencyToggle('THB')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.currencyBtnText, currency === 'THB' && styles.currencyBtnTextActive]}>
                          🇹🇭 บาทไทย (THB ฿)
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.currencyBtn, currency === 'USD' && styles.currencyBtnActive]}
                        onPress={() => handleCurrencyToggle('USD')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.currencyBtnText, currency === 'USD' && styles.currencyBtnTextActive]}>
                          🇺🇸 ดอลลาร์สหรัฐ (USD $)
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* USD Exchange Rate Box */}
                    {currency === 'USD' && (
                      <View style={styles.usdExchangeBox}>
                        <View style={styles.usdExchangeHeader}>
                          <Ionicons name="swap-horizontal" size={16} color="#2563EB" />
                          <Text style={styles.usdExchangeTitle}>อัตราแลกเปลี่ยน (1 USD = กี่บาท)</Text>
                          {isFetchingRate && <ActivityIndicator size="small" color="#2563EB" />}
                        </View>
                        <View style={styles.usdExchangeInputRow}>
                          <TextInput
                            style={styles.usdExchangeInput}
                            value={exchangeRate > 0 ? exchangeRate.toString() : ''}
                            onChangeText={(val) => {
                              const parsed = parseFloat(val);
                              setExchangeRate(!isNaN(parsed) && parsed > 0 ? parsed : 0);
                            }}
                            keyboardType="decimal-pad"
                            placeholder="34.00"
                            placeholderTextColor="#94A3B8"
                          />
                          <TouchableOpacity
                            style={styles.fetchRateBtn}
                            onPress={refreshExchangeRate}
                            disabled={isFetchingRate}
                          >
                            <Ionicons name="refresh" size={14} color="#2563EB" />
                            <Text style={styles.fetchRateBtnText}>ดึงเรทสด</Text>
                          </TouchableOpacity>
                        </View>
                        {costPrice.trim() && !isNaN(parseFloat(costPrice)) ? (
                          <Text style={styles.usdConvertedHint}>
                            ต้นทุน: ${parseFloat(costPrice).toFixed(2)} ≈ ฿{(parseFloat(costPrice) * (exchangeRate || 34)).toFixed(2)} บาท/หุ้น
                            {shares.trim() && !isNaN(parseFloat(shares))
                              ? ` • ยอดรวม: ฿${(parseFloat(shares) * parseFloat(costPrice) * (exchangeRate || 34)).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`
                              : ''}
                          </Text>
                        ) : null}
                      </View>
                    )}
                  </>
                )}

                {/* 3. Current Price Field with Quick Refresh Button */}
                <View style={styles.labelRow}>
                  <Text style={styles.fieldLabel}>
                    {assetType === 'FUNDS' ? 'NAV ล่าสุดต่อหน่วย (฿)' : `ราคาปัจจุบันต่อหน่วย (${currency === 'USD' ? '$ USD' : '฿ THB'})`}
                  </Text>
                  <TouchableOpacity
                    style={styles.refreshPriceBtn}
                    onPress={handleRefreshLatestPrice}
                    disabled={isRefreshingPrice}
                  >
                    {isRefreshingPrice ? (
                      <ActivityIndicator size="small" color="#059669" />
                    ) : (
                      <>
                        <Ionicons name="sync-outline" size={14} color="#059669" />
                        <Text style={styles.refreshPriceBtnText}>
                          {assetType === 'FUNDS' ? 'ดึง NAV ล่าสุด' : 'ดึงราคาล่าสุด'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.input}
                  value={currentPrice}
                  onChangeText={setCurrentPrice}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                />
                {priceFeedback ? <Text style={styles.feedbackNote}>{priceFeedback}</Text> : null}

                {/* 4. Holdings: Shares & Cost Price */}
                <View style={styles.twoColumnRow}>
                  <View style={styles.columnItem}>
                    <Text style={styles.fieldLabel}>
                      {assetType === 'FUNDS' ? 'จำนวนหน่วยลงทุน (Units)' : 'จำนวนหุ้น/หน่วยที่ถือ'}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={shares}
                      onChangeText={setShares}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  <View style={styles.columnItem}>
                    <Text style={styles.fieldLabel}>
                      {assetType === 'FUNDS' ? 'NAV ต้นทุนเฉลี่ย (฿)' : `ต้นทุนเฉลี่ยต่อหุ้น (${currency === 'USD' ? '$' : '฿'})`}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={costPrice}
                      onChangeText={setCostPrice}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                </View>

                {/* Live Calculation Preview Card */}
                <View style={styles.previewCard}>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>มูลค่ารวม:</Text>
                    <Text style={styles.previewValue}>
                      ฿{previewMarketValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {currency === 'USD' && ` ($${(numShares * numCurrentPrice).toFixed(2)})`}
                    </Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>กำไร/ขาดทุน (P/L):</Text>
                    <Text style={[styles.previewValue, previewPL >= 0 ? styles.profitColor : styles.lossColor]}>
                      {previewPL >= 0 ? '+' : ''}฿
                      {previewPL.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (
                      {previewPLPercent.toFixed(2)}%)
                    </Text>
                  </View>
                </View>

                {/* 5. Withholding Tax Rate for STOCKS & FUNDS */}
                <Text style={styles.fieldLabel}>อัตราภาษีหัก ณ ที่จ่าย (%)</Text>
                <View style={styles.taxPresetsRow}>
                  {[
                    { label: '0% (ยกเว้น)', value: '0' },
                    { label: '10% (หุ้นไทย)', value: '10' },
                    { label: '15% (US/ต่างประเทศ)', value: '15' },
                  ].map((preset) => (
                    <TouchableOpacity
                      key={preset.value}
                      style={[
                        styles.taxPresetBtn,
                        taxRatePercent === preset.value && styles.taxPresetBtnActive,
                      ]}
                      onPress={() => setTaxRatePercent(preset.value)}
                    >
                      <Text
                        style={[
                          styles.taxPresetBtnText,
                          taxRatePercent === preset.value && styles.taxPresetBtnTextActive,
                        ]}
                      >
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  value={taxRatePercent}
                  onChangeText={setTaxRatePercent}
                  keyboardType="decimal-pad"
                  placeholder="ระบุเปอร์เซ็นต์ภาษี เช่น 0 หรือ 10"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            )}

            {/* 6. Dividend Information (If STOCKS or FUNDS) */}
            {assetType === 'STOCKS' || assetType === 'FUNDS' ? (
              <View style={styles.dividendSection}>
                <Text style={styles.sectionHeaderTitle}>
                  {assetType === 'FUNDS' ? 'ข้อมูลเงินปันผลกองทุนคาดการณ์' : 'ข้อมูลเงินปันผลคาดการณ์'}
                </Text>
                <View style={styles.twoColumnRow}>
                  <View style={styles.columnItem}>
                    <Text style={styles.fieldLabel}>
                      {assetType === 'FUNDS' ? 'ปันผลต่อหน่วย (฿ DPU)' : `ปันผลต่อหุ้น (${currency === 'USD' ? '$ DPU' : '฿ DPU'})`}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={expectedDpu}
                      onChangeText={setExpectedDpu}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  <View style={styles.columnItem}>
                    <Text style={styles.fieldLabel}>วันขึ้น XD คาดการณ์</Text>
                    <View style={styles.dateInputWrapper}>
                      <TextInput
                        style={styles.dateTextInput}
                        value={xdDate}
                        onChangeText={setXdDate}
                        placeholder="เช่น 2026-05-15"
                        placeholderTextColor="#94A3B8"
                      />
                      <TouchableOpacity
                        style={styles.calendarIconBtn}
                        onPress={() => setIsCalendarVisible(true)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="calendar-outline" size={18} color="#059669" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                <Text style={styles.dividendHelpText}>
                  ยอดเงินปันผลจะถูกนำไปคำนวณในกราฟ 12 เดือนและแจ้งเตือนล่วงหน้า 1 วันก่อนวัน XD
                </Text>
              </View>
            ) : null}

            {/* Action Buttons */}
            <View style={styles.actionButtonsContainer}>
              {/* Primary Green Save Button */}
              <TouchableOpacity
                style={[styles.saveButton, isSubmitting && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={isSubmitting || isDeleting}
                activeOpacity={0.85}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.saveButtonText}>บันทึกการแก้ไข</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Prominent Red Delete Button as requested */}
              <TouchableOpacity
                style={[styles.deleteButtonRed, isDeleting && styles.buttonDisabled]}
                onPress={handleDelete}
                disabled={isSubmitting || isDeleting}
                activeOpacity={0.85}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.deleteButtonRedText}>ลบสินทรัพย์ออกจากพอร์ต</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <CalendarPickerModal
        visible={isCalendarVisible}
        target="xdDate"
        currentDate={xdDate}
        title="เลือกวัน XD คาดการณ์"
        onClose={() => setIsCalendarVisible(false)}
        onSelectDate={(isoDate) => setXdDate(isoDate)}
      />

      <SectorPickerModal
        visible={isSectorPickerVisible}
        assetType={assetType}
        selectedSector={selectedSector}
        onSelectSector={(secId) => setSelectedSector(secId)}
        onClose={() => setIsSectorPickerVisible(false)}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '500',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  refreshPriceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  refreshPriceBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    marginBottom: 14,
  },
  dateInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  dateTextInput: {
    flex: 1,
    height: 42,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    paddingVertical: 0,
  },
  calendarIconBtn: {
    padding: 6,
  },
  feedbackNote: {
    fontSize: 12,
    color: '#059669',
    marginTop: -8,
    marginBottom: 12,
    fontWeight: '500',
  },
  assetTypeSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginTop: 4,
    marginBottom: 16,
    gap: 4,
  },
  assetTypeSegmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
    gap: 6,
  },
  assetTypeSegmentTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  assetTypeSegmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  assetTypeSegmentTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  columnItem: {
    flex: 1,
  },
  previewCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    gap: 4,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  previewValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectorHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
    gap: 8,
  },
  fieldLabelNoMargin: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  detectedSectorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flexShrink: 1,
  },
  detectedSectorBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  profitColor: {
    color: '#059669',
  },
  lossColor: {
    color: '#DC2626',
  },
  taxPresetsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  taxPresetBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  taxPresetBtnActive: {
    backgroundColor: '#059669',
  },
  taxPresetBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  taxPresetBtnTextActive: {
    color: '#FFFFFF',
  },
  dividendSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  dividendHelpText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: -4,
  },
  actionButtonsContainer: {
    marginTop: 8,
    gap: 10,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    elevation: 2,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  // Prominent Red Delete Button
  deleteButtonRed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    elevation: 2,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  deleteButtonRedText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sectorChipsScroll: {
    marginBottom: 14,
  },
  sectorChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  sectorChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  sectorChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  frequencyBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  frequencyBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  frequencyBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
  frequencyBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  cashPreviewCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 4,
    marginBottom: 14,
    gap: 6,
  },
  cashPreviewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  cashPreviewHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  taxStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  taxStatusBadgeFree: {
    backgroundColor: '#DCFCE7',
  },
  taxStatusBadgeTaxed: {
    backgroundColor: '#FEF3C7',
  },
  taxStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  taxStatusBadgeFreeText: {
    color: '#15803D',
  },
  taxStatusBadgeTaxedText: {
    color: '#B45309',
  },
  cashPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cashPreviewLabel: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '500',
  },
  cashPreviewTotalRow: {
    paddingTop: 6,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#D1FAE5',
  },
  cashPreviewHighlightLabel: {
    fontSize: 13,
    color: '#065F46',
    fontWeight: '700',
  },
  cashPreviewMuted: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  cashPreviewTax: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  cashPreviewHighlight: {
    fontSize: 17,
    fontWeight: '800',
    color: '#059669',
  },
  cashPreviewSub: {
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
  },
  taxHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  autoTaxToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    gap: 4,
  },
  autoTaxToggleBtnActive: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  autoTaxToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  autoTaxToggleTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  taxAlertBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
  },
  taxAlertBoxNormal: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  taxAlertBoxExceeded: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  taxAlertTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  taxAlertTitleNormal: {
    color: '#15803D',
  },
  taxAlertTitleExceeded: {
    color: '#B45309',
  },
  taxAlertDetail: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
  },
  taxAlertQuota: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    marginTop: 4,
  },
  taxPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  taxPill: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  taxPillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  taxPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
  taxPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  currencyToggleContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
    marginBottom: 10,
  },
  currencyBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  currencyBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  currencyBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  usdExchangeBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  usdExchangeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  usdExchangeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
    flex: 1,
  },
  usdExchangeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 6,
  },
  usdExchangeInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#93C5FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  fetchRateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  fetchRateBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  usdConvertedHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E40AF',
    marginTop: 2,
    lineHeight: 16,
  },
  splitBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  splitBannerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  splitIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  splitBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  splitBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  splitSubtitle: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 16,
  },
  applySplitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D97706',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  applySplitButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

