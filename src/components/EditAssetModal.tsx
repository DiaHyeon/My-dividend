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
import { SellAssetModal } from './SellAssetModal';
import { getLocalDateString } from '../utils/dateUtils';
import { portfolioEvents } from '../services/eventService';
import { colors, borderWidth, radii, fonts } from '../theme/tokens';
import { DashedDivider } from './ui/DashedDivider';

interface EditAssetModalProps {
  visible: boolean;
  asset: AssetSummary | null;
  onClose: () => void;
  onSuccess: () => void;
  onNavigateToTransactions?: (symbol?: string) => void;
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
  onNavigateToTransactions,
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
  const [isSellModalVisible, setIsSellModalVisible] = useState(false);

  // Stock Split Detection State
  const [splitDetection, setSplitDetection] = useState<SplitDetectionResult | null>(null);
  const [isCheckingSplit, setIsCheckingSplit] = useState(false);
  const [isApplyingSplit, setIsApplyingSplit] = useState(false);
  const [txCount, setTxCount] = useState<number>(1);

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
          setXdDate(getLocalDateString(nextMonth));
          setExistingScheduleId(null);
        }
      } catch (err: any) {
        console.warn('Error fetching schedule details:', err.message);
      } finally {
        setIsLoadingDetails(false);
      }
    };

    loadSchedules();

    // Check transaction count and pending stock splits
    const checkTransactionsAndSplits = async () => {
      try {
        const { data: txs, error: txErr } = await supabase
          .from('transactions')
          .select('*')
          .eq('asset_id', asset.id);

        if (!txErr && txs) {
          setTxCount(txs.length);
          if (asset.asset_type === 'STOCKS' && txs.length > 0) {
            setIsCheckingSplit(true);
            const result = await detectPendingSplits(
              asset.id,
              asset.symbol,
              txs as Transaction[],
              asset.currency,
              asset.last_split_date
            );
            setSplitDetection(result);
          } else {
            setSplitDetection(null);
          }
        } else {
          setTxCount(1);
          setSplitDetection(null);
        }
      } catch (e) {
        console.warn('Error checking transactions/splits:', e);
      } finally {
        setIsCheckingSplit(false);
      }
    };

    checkTransactionsAndSplits();
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
      const price = await fetchStockPrice(symbol.trim().toUpperCase(), undefined, currency);
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
      // DPU is persisted in the asset's native currency (USD for US stocks, THB otherwise) - never pre-converted

      const calculatedTaxRate = isNaN(parsedTaxPercent) || parsedTaxPercent < 0
        ? (currency === 'USD' ? 0.1500 : 0.1000)
        : Number((parsedTaxPercent / 100).toFixed(4));

      // 1. Update Asset table
      const { error: assetError } = await supabase
        .from('assets')
        .update({
          symbol: trimmedSymbol,
          asset_type: assetType,
          currency: currency,
          current_price: Number(convertedCurrentPrice.toFixed(4)),
          tax_rate: calculatedTaxRate,
        })
        .eq('id', asset.id);

      if (assetError) {
        throw new Error(assetError.message || 'ไม่สามารถอัปเดตสินทรัพย์ได้');
      }

      // 2. Update Transaction (ONLY if single transaction and values were changed, NEVER delete DCA transactions)
      const { data: existingTxs, error: txFetchError } = await supabase
        .from('transactions')
        .select('*')
        .eq('asset_id', asset.id)
        .order('created_at', { ascending: true });

      if (!txFetchError && existingTxs && existingTxs.length === 1) {
        // Single transaction: update directly if values changed
        const primaryTx = existingTxs[0];
        const oldShares = Number(primaryTx.shares) || 0;
        const oldPrice = Number(primaryTx.price_per_share) || 0;
        if (Math.abs(oldShares - parsedShares) > 0.0001 || Math.abs(oldPrice - convertedCostPrice) > 0.0001) {
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
        }
      } else if (!txFetchError && (!existingTxs || existingTxs.length === 0)) {
        // If no existing transaction, insert one
        const todayDate = getLocalDateString();
        await supabase.from('transactions').insert({
          asset_id: asset.id,
          type: 'BUY',
          shares: Number(parsedShares.toFixed(4)),
          price_per_share: Number(convertedCostPrice.toFixed(4)),
          transaction_date: todayDate,
        });
      }
      // Note: If existingTxs.length > 1 (DCA positions), transactions are NEVER deleted or overwritten!
      // Multi-buy DCA history is preserved safely, and can be edited in Transaction History.

      // 3. Update or Insert Dividend Schedule (STOCKS & FUNDS)
      if (assetType === 'STOCKS' || assetType === 'FUNDS') {
        const targetXdDate = xdDate.trim() || getLocalDateString();

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
                xd_date: getLocalDateString(d),
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
      portfolioEvents.emitRefresh();
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
              portfolioEvents.emitRefresh();
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
              portfolioEvents.emitRefresh();
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
          <View style={styles.grabHandle} />
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>แก้ไขสินทรัพย์</Text>
              <Text style={styles.sheetSubtitle}>{asset.symbol} • รายละเอียดการลงทุน</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <DashedDivider color={colors.shadow} />

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {isLoadingDetails ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={colors.ink} />
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
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={type.icon}
                      size={18}
                      color={isSelected ? colors.accent : colors.ink}
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
                        <Ionicons name="git-branch" size={18} color="#B45309" />
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
                        <ActivityIndicator size="small" color={colors.accent} />
                      ) : (
                        <>
                          <Ionicons name="flash" size={14} color={colors.accent} style={{ marginRight: 6 }} />
                          <Text style={styles.applySplitButtonText}>ปรับจำนวนหุ้น & ต้นทุนให้อัตโนมัติ (1-Click)</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* 2. Symbol Field */}
                <Text style={styles.fieldLabel}>ชื่อย่อสินทรัพย์ (Symbol)</Text>
                <TextInput
                  style={[styles.input, styles.monoInput]}
                  value={symbol}
                  onChangeText={setSymbol}
                  placeholder="เช่น PTT, AAPL, SCBDV"
                  placeholderTextColor={colors.muted}
                />

                {/* Segment / Category Selector */}
                <View style={styles.sectorHeaderRow}>
                  <Text style={styles.fieldLabelNoMargin}>
                    {assetType === 'FUNDS' ? 'ประเภทกองทุน' : 'กลุ่มอุตสาหกรรม (Segment)'}
                  </Text>
                  {selectedSector ? (
                    <TouchableOpacity
                      style={styles.detectedSectorBadge}
                      onPress={() => setIsSectorPickerVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={getSectorDefinition(selectedSector, assetType).icon as any}
                        size={13}
                        color={colors.ink}
                      />
                      <Text
                        style={styles.detectedSectorBadgeText}
                        numberOfLines={1}
                      >
                        {getSectorDefinition(selectedSector, assetType).label}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={12}
                        color={colors.ink}
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
                        selectedSector === sec.id && styles.sectorChipActive,
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
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[styles.currencyBtnText, currency === 'THB' && styles.currencyBtnTextActive]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.85}
                        >
                          🇹🇭 บาทไทย (THB)
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.currencyBtn, currency === 'USD' && styles.currencyBtnActive]}
                        onPress={() => handleCurrencyToggle('USD')}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[styles.currencyBtnText, currency === 'USD' && styles.currencyBtnTextActive]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.85}
                        >
                          🇺🇸 ดอลลาร์ (USD)
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* USD Exchange Rate Box */}
                    {currency === 'USD' && (
                      <View style={styles.usdExchangeBox}>
                        <View style={styles.usdExchangeHeader}>
                          <Ionicons name="swap-horizontal" size={16} color={colors.ink} />
                          <Text style={styles.usdExchangeTitle}>อัตราแลกเปลี่ยน (1 USD = กี่บาท)</Text>
                          {isFetchingRate && <ActivityIndicator size="small" color={colors.ink} />}
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
                            placeholderTextColor={colors.muted}
                          />
                          <TouchableOpacity
                            style={styles.fetchRateBtn}
                            onPress={refreshExchangeRate}
                            disabled={isFetchingRate}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="refresh" size={14} color={colors.accent} />
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
                    activeOpacity={0.8}
                  >
                    {isRefreshingPrice ? (
                      <ActivityIndicator size="small" color={colors.ink} />
                    ) : (
                      <>
                        <Ionicons name="sync-outline" size={14} color={colors.ink} />
                        <Text style={styles.refreshPriceBtnText}>
                          {assetType === 'FUNDS' ? 'ดึง NAV ล่าสุด' : 'ดึงราคาล่าสุด'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.input, styles.monoInput]}
                  value={currentPrice}
                  onChangeText={setCurrentPrice}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                />
                {priceFeedback ? <Text style={styles.feedbackNote}>{priceFeedback}</Text> : null}

                {/* 4. Holdings: Shares & Cost Price */}
                <View style={styles.twoColumnRow}>
                  <View style={styles.columnItem}>
                    <View style={styles.labelRow}>
                      <Text style={styles.fieldLabel}>
                        {assetType === 'FUNDS' ? 'จำนวนหน่วยลงทุน (Units)' : 'จำนวนหุ้น/หน่วยที่ถือ'}
                      </Text>
                      {txCount > 1 && (
                        <View style={styles.minimalLockBadge}>
                          <Ionicons name="lock-closed" size={10} color={colors.ink} />
                          <Text style={styles.minimalLockBadgeText}>DCA</Text>
                        </View>
                      )}
                    </View>
                    <TextInput
                      style={[styles.input, styles.monoInput, txCount > 1 && styles.inputDisabled]}
                      value={shares}
                      onChangeText={setShares}
                      editable={txCount <= 1}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                  <View style={styles.columnItem}>
                    <View style={styles.labelRow}>
                      <Text style={styles.fieldLabel}>
                        {assetType === 'FUNDS' ? 'NAV ต้นทุนเฉลี่ย (฿)' : `ต้นทุนเฉลี่ยต่อหุ้น (${currency === 'USD' ? '$' : '฿'})`}
                      </Text>
                      {txCount > 1 && (
                        <View style={styles.minimalLockBadge}>
                          <Ionicons name="lock-closed" size={10} color={colors.ink} />
                          <Text style={styles.minimalLockBadgeText}>ถัวเฉลี่ย</Text>
                        </View>
                      )}
                    </View>
                    <TextInput
                      style={[styles.input, styles.monoInput, txCount > 1 && styles.inputDisabled]}
                      value={costPrice}
                      onChangeText={setCostPrice}
                      editable={txCount <= 1}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                </View>

                {txCount > 1 && (
                  <TouchableOpacity
                    style={styles.minimalDcaRow}
                    onPress={() => {
                      onClose();
                      onNavigateToTransactions?.(symbol);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.minimalDcaLeft}>
                      <Ionicons name="receipt-outline" size={15} color="#1F7A52" />
                      <Text style={styles.minimalDcaText}>
                        มีประวัติซื้อสะสม {txCount} รายการ • ดูประวัติแต่ละไม้
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={colors.ink} />
                  </TouchableOpacity>
                )}

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
                      activeOpacity={0.8}
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
                  style={[styles.input, styles.monoInput]}
                  value={taxRatePercent}
                  onChangeText={setTaxRatePercent}
                  keyboardType="decimal-pad"
                  placeholder="ระบุเปอร์เซ็นต์ภาษี เช่น 0 หรือ 10"
                  placeholderTextColor={colors.muted}
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
                      style={[styles.input, styles.monoInput]}
                      value={expectedDpu}
                      onChangeText={setExpectedDpu}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
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
                        placeholderTextColor={colors.muted}
                      />
                      <TouchableOpacity
                        style={styles.calendarIconBtn}
                        onPress={() => setIsCalendarVisible(true)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="calendar-outline" size={18} color={colors.ink} />
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
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color={colors.accent} />
                    <Text style={styles.saveButtonText}>บันทึกการแก้ไข</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Secondary Action Row: Sell / Withdraw & Delete Asset */}
              <View style={styles.secondaryActionRow}>
                <TouchableOpacity
                  style={[styles.sellButton, (isSubmitting || isDeleting) && styles.buttonDisabled]}
                  onPress={() => setIsSellModalVisible(true)}
                  disabled={isSubmitting || isDeleting}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={assetType === 'CASH' ? 'cash-outline' : 'trending-down-outline'}
                    size={17}
                    color={colors.ink}
                  />
                  <Text style={styles.sellButtonText}>
                    {assetType === 'CASH' ? 'ถอนเงินฝาก' : 'ขายสินทรัพย์'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.deleteButtonRedSmall, isDeleting && styles.buttonDisabled]}
                  onPress={handleDelete}
                  disabled={isSubmitting || isDeleting}
                  activeOpacity={0.85}
                >
                  {isDeleting ? (
                    <ActivityIndicator color={colors.lossOnLight} size="small" />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={17} color={colors.lossOnLight} />
                      <Text style={styles.deleteButtonRedSmallText}>ลบสินทรัพย์</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
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

      <SellAssetModal
        visible={isSellModalVisible}
        asset={asset}
        currency={currency}
        exchangeRate={exchangeRate}
        onClose={() => setIsSellModalVisible(false)}
        onSuccess={() => {
          setIsSellModalVisible(false);
          onSuccess();
          onClose();
        }}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderTopWidth: borderWidth,
    borderTopColor: colors.ink,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
  },
  grabHandle: {
    width: 44,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.shadow,
    marginTop: 8,
    marginBottom: 4,
    alignSelf: 'center',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.thai,
    marginTop: 2,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: '#EAF3EE',
    borderRadius: 12,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    marginBottom: 12,
  },
  loadingText: {
    fontSize: 13,
    color: colors.ink,
    fontFamily: fonts.thai,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
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
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    backgroundColor: colors.accent,
  },
  refreshPriceBtnText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 15,
    fontFamily: fonts.thai,
    color: colors.ink,
    marginBottom: 14,
  },
  monoInput: {
    fontFamily: fonts.mono,
    fontWeight: '700',
  },
  dateInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 48,
    marginBottom: 14,
  },
  dateTextInput: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
    fontFamily: fonts.mono,
    fontWeight: '700',
    paddingVertical: 0,
  },
  calendarIconBtn: {
    padding: 6,
  },
  feedbackNote: {
    fontSize: 12,
    color: '#1F7A52',
    fontFamily: fonts.thai,
    fontWeight: '600',
    marginTop: -8,
    marginBottom: 12,
  },
  assetTypeSegmentContainer: {
    flexDirection: 'row',
    gap: 4,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    padding: 4,
    marginTop: 4,
    marginBottom: 16,
  },
  assetTypeSegmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: radii.pill,
    gap: 8,
  },
  assetTypeSegmentTabActive: {
    backgroundColor: colors.ink,
  },
  assetTypeSegmentText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  assetTypeSegmentTextActive: {
    color: colors.accent,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  columnItem: {
    flex: 1,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    shadowColor: colors.shadow,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
    marginBottom: 16,
    gap: 6,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.thai,
    fontWeight: '500',
  },
  previewValue: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
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
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  detectedSectorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    flexShrink: 1,
    shadowColor: colors.shadow,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  detectedSectorBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
    flexShrink: 1,
  },
  profitColor: {
    color: '#1F7A52',
  },
  lossColor: {
    color: colors.lossOnLight,
  },
  taxPresetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  taxPresetBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 22,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taxPresetBtnActive: {
    backgroundColor: colors.ink,
  },
  taxPresetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  taxPresetBtnTextActive: {
    color: colors.accent,
  },
  dividendSection: {
    backgroundColor: '#EAF3EE',
    borderRadius: 20,
    padding: 14,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    marginBottom: 16,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
    marginBottom: 10,
  },
  dividendHelpText: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: fonts.thai,
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
    backgroundColor: colors.ink,
    minHeight: 54,
    borderRadius: radii.pill,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    gap: 8,
    elevation: 4,
    shadowColor: colors.shadow,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  saveButtonText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sectorChipsScroll: {
    marginBottom: 14,
  },
  sectorChip: {
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    marginRight: 8,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectorChipActive: {
    backgroundColor: colors.ink,
  },
  sectorChipText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  sectorChipTextActive: {
    color: colors.accent,
  },
  currencyToggleContainer: {
    flexDirection: 'row',
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    padding: 4,
    gap: 4,
    marginTop: 2,
    marginBottom: 14,
  },
  currencyBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  currencyBtnActive: {
    backgroundColor: colors.ink,
  },
  currencyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  currencyBtnTextActive: {
    color: colors.accent,
  },
  usdExchangeBox: {
    backgroundColor: '#EAF3EE',
    borderRadius: 18,
    padding: 12,
    marginBottom: 14,
    borderWidth: borderWidth,
    borderColor: colors.ink,
  },
  usdExchangeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  usdExchangeTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
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
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 15,
    fontFamily: fonts.mono,
    fontWeight: '700',
    color: colors.ink,
  },
  fetchRateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 14,
    borderWidth: borderWidth,
    borderColor: colors.ink,
  },
  fetchRateBtnText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.accent,
  },
  usdConvertedHint: {
    fontSize: 11,
    fontFamily: fonts.mono,
    fontWeight: '600',
    color: '#1F7A52',
    marginTop: 2,
    lineHeight: 16,
  },
  splitBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 18,
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
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  splitBadge: {
    backgroundColor: colors.ink,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  splitBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.accent,
  },
  splitSubtitle: {
    fontSize: 12,
    fontFamily: fonts.thai,
    color: colors.ink,
    marginTop: 2,
    lineHeight: 16,
  },
  applySplitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: borderWidth,
    borderColor: colors.ink,
  },
  applySplitButtonText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
  },
  inputDisabled: {
    backgroundColor: '#EAF3EE',
    color: colors.muted,
  },
  minimalLockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EAF3EE',
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  minimalLockBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  minimalDcaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EAF3EE',
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: -4,
    marginBottom: 14,
  },
  minimalDcaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  minimalDcaText: {
    fontSize: 12,
    color: colors.ink,
    fontFamily: fonts.thaiBold,
    fontWeight: '700',
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  sellButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EAF3EE',
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: radii.pill,
    height: 46,
    shadowColor: colors.shadow,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  sellButtonText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  deleteButtonRedSmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: radii.pill,
    height: 46,
    shadowColor: colors.shadow,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  deleteButtonRedSmallText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.lossOnLight,
  },
});

