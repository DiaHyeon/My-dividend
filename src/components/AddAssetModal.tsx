import React, { useState } from 'react';
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
import { Asset, AssetType } from '../types/database';
import { scheduleXdReminder } from '../services/notificationService';
import { searchStocks, fetchStockPrice, fetchExchangeRate, fetchDividendAnalysis, StockSuggestion, DividendAnalysis } from '../services/stockService';
import { searchThaiFunds, fetchFundNav, fetchFundDividendAnalysis, FundSuggestion, POPULAR_THAI_FUNDS, fetchFundCategory, detectFundClass } from '../services/fundService';
import { getSectorsForType, detectSector, setAssetSector, getSectorDefinition } from '../services/sectorService';
import { evaluateCashTax, calculateAnnualGrossInterest } from '../services/taxService';
import { setAssetCurrency, saveTransactionCurrencyMeta } from '../services/currencyService';
import { ensureAuthenticated } from '../services/authService';
import { CashAssetForm } from './CashAssetForm';
import { CalendarPickerModal } from './CalendarPickerModal';
import { SectorPickerModal } from './SectorPickerModal';

interface AddAssetModalProps {
  visible?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
  showFAB?: boolean;
}

const ASSET_TYPES: { label: string; shortLabel: string; value: AssetType; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'หุ้น (STOCKS)', shortLabel: 'หุ้น', value: 'STOCKS', icon: 'trending-up' },
  { label: 'กองทุน (FUNDS)', shortLabel: 'กองทุน', value: 'FUNDS', icon: 'pie-chart' },
  { label: 'เงินฝาก (CASH)', shortLabel: 'เงินฝาก', value: 'CASH', icon: 'wallet' },
];

const formatReviewDate = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d} ${months[m] || ''} ${y + 543}`;
  }
  return dateStr;
};

export const AddAssetModal: React.FC<AddAssetModalProps> = ({
  visible: controlledVisible,
  onClose: controlledOnClose,
  onSuccess,
  showFAB = true,
}) => {
  const [internalVisible, setInternalVisible] = useState(false);
  const isVisible = controlledVisible !== undefined ? controlledVisible : internalVisible;

  const [assetType, setAssetType] = useState<AssetType>('STOCKS');
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [expectedDpu, setExpectedDpu] = useState('');
  const [xdDate, setXdDate] = useState(() => {
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    return nextMonth.toISOString().split('T')[0];
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState<(StockSuggestion | FundSuggestion)[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [priceNote, setPriceNote] = useState('');
  const [currency, setCurrency] = useState<'THB' | 'USD'>('THB');
  const [exchangeRate, setExchangeRate] = useState('34.00');
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [dividendAnalysis, setDividendAnalysis] = useState<DividendAnalysis | null>(null);
  const [isFetchingDividends, setIsFetchingDividends] = useState(false);
  const [taxRatePercent, setTaxRatePercent] = useState('10');
  const [selectedSector, setSelectedSector] = useState<string>('Technology');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [interestRate, setInterestRate] = useState<string>('1.5');
  const [interestFrequency, setInterestFrequency] = useState<'MONTHLY' | 'SEMI_ANNUAL' | 'ANNUAL'>('MONTHLY');
  const [isAutoCashTax, setIsAutoCashTax] = useState(true);
  const [depositDate, setDepositDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [purchaseDate, setPurchaseDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<'purchaseDate' | 'xdDate'>('purchaseDate');
  const [isSectorPickerVisible, setIsSectorPickerVisible] = useState(false);
  const [isReviewVisible, setIsReviewVisible] = useState(false);

  // Existing Asset Detection State
  const [existingHolding, setExistingHolding] = useState<{
    id: string;
    shares: number;
    avgCost: number;
  } | null>(null);

  // Live Check: Check if asset already exists in portfolio
  React.useEffect(() => {
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed || trimmed.length < 2) {
      setExistingHolding(null);
      return;
    }

    let isMounted = true;
    const checkExisting = async () => {
      try {
        const { data, error } = await supabase
          .from('view_asset_summary')
          .select('id, net_shares, weighted_average_cost')
          .ilike('symbol', trimmed)
          .eq('asset_type', assetType)
          .limit(1);

        if (isMounted) {
          if (!error && data && data.length > 0 && Number(data[0].net_shares) > 0) {
            setExistingHolding({
              id: data[0].id,
              shares: Number(data[0].net_shares),
              avgCost: Number(data[0].weighted_average_cost) || 0,
            });
          } else {
            setExistingHolding(null);
          }
        }
      } catch {
        if (isMounted) setExistingHolding(null);
      }
    };

    const timer = setTimeout(checkExisting, 350);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [symbol, assetType]);

  // Auto-calculate tax rate for CASH when deposit amount, interest rate or segment changes
  React.useEffect(() => {
    if (assetType === 'CASH' && isAutoCashTax) {
      const dep = parseFloat(depositAmount) || 0;
      const rate = parseFloat(interestRate) || 0;
      const evalResult = evaluateCashTax(dep, rate, selectedSector);
      setTaxRatePercent(evalResult.suggestedTaxRatePercent.toString());
    }
  }, [assetType, depositAmount, interestRate, selectedSector, isAutoCashTax]);

  const handleOpen = () => {
    setInternalVisible(true);
  };

  const handleClose = () => {
    resetForm();
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalVisible(false);
    }
  };

  const resetForm = (preserveAssetType: boolean = false) => {
    setSymbol('');
    setShares('');
    setCostPrice('');
    setCurrentPrice('');
    setExpectedDpu('');
    setExistingHolding(null);
    if (!preserveAssetType) {
      setAssetType('STOCKS');
    }
    setSuggestions([]);
    setShowSuggestions(false);
    setPriceNote('');
    setCurrency('THB');
    setDividendAnalysis(null);
    setIsFetchingDividends(false);
    setIsFetchingPrice(false);
    setTaxRatePercent(assetType === 'STOCKS' ? '10' : '0');
    setSelectedSector(assetType === 'FUNDS' ? 'ThaiEquity' : 'Technology');
    setDepositAmount('');
    setInterestRate('1.5');
    setInterestFrequency('MONTHLY');
    setIsAutoCashTax(true);
    setDepositDate(new Date().toISOString().split('T')[0]);
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    setXdDate(nextMonth.toISOString().split('T')[0]);
    setIsCalendarVisible(false);
    setIsSectorPickerVisible(false);
    setIsReviewVisible(false);
  };

  const handleAssetTypeSelect = (newType: AssetType) => {
    if (newType === assetType) return;

    setAssetType(newType);

    // Completely clear all previous inputs so types never collide or mix
    setSymbol('');
    setShares('');
    setCostPrice('');
    setCurrentPrice('');
    setExpectedDpu('');
    setPriceNote('');
    setSuggestions([]);
    setShowSuggestions(false);
    setDividendAnalysis(null);
    setIsFetchingDividends(false);
    setIsFetchingPrice(false);

    // Reset default projected XD date
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    setXdDate(nextMonth.toISOString().split('T')[0]);

    if (newType === 'CASH') {
      setCurrency('THB');
      setSelectedSector('DigitalSavings');
      setIsAutoCashTax(true);
      setDepositAmount('');
      setInterestRate('1.5');
      setInterestFrequency('MONTHLY');
      setDepositDate(new Date().toISOString().split('T')[0]);
      const evalResult = evaluateCashTax(0, 1.5, 'DigitalSavings');
      setTaxRatePercent(evalResult.suggestedTaxRatePercent.toString());
    } else if (newType === 'FUNDS') {
      setCurrency('THB');
      setTaxRatePercent('10');
      setSelectedSector('Equity');
    } else {
      // STOCKS
      setCurrency('THB');
      setTaxRatePercent('10');
      setSelectedSector('Technology');
    }
  };

  // Live Dividend Preview Calculation
  const dividendPreview = React.useMemo(() => {
    const parsedS = parseFloat(shares) || 0;
    const parsedD = parseFloat(expectedDpu) || 0;
    const taxPct = parseFloat(taxRatePercent) || 0;
    const taxFactor = taxPct > 0 ? 1 - taxPct / 100 : 1;
    const currSym = currency === 'USD' ? '$' : '฿';

    if (parsedS <= 0 || parsedD <= 0) {
      return null;
    }

    // 1. Gross & Net per payout cycle
    const grossPerCycle = parsedS * parsedD;
    const netPerCycle = grossPerCycle * taxFactor;

    // 2. Frequency & Full Annual projection
    const freq =
      dividendAnalysis?.frequency ||
      dividendAnalysis?.projectedNextXdDates?.length ||
      1;
    const annualDpu =
      dividendAnalysis?.annualProjectedDpu || parsedD * freq;
    const grossAnnual = parsedS * annualDpu;
    const netAnnual = grossAnnual * taxFactor;

    // 3. Purchase date & remaining cycles this year (Cutoff calculation)
    const effectiveDate =
      purchaseDate && purchaseDate.trim()
        ? purchaseDate.trim()
        : new Date().toISOString().split('T')[0];
    const purchaseYear = effectiveDate.substring(0, 4);

    let remainingRounds = 0;
    let remainingDates: string[] = [];

    if (
      dividendAnalysis?.hasDividends &&
      dividendAnalysis.projectedNextXdDates?.length > 0
    ) {
      // Check which projected XD dates are on or after purchase date in the purchase year
      remainingDates = dividendAnalysis.projectedNextXdDates.filter(
        (d) => d >= effectiveDate && d.startsWith(purchaseYear)
      );
      remainingRounds = remainingDates.length;
    } else if (xdDate) {
      // Single schedule
      const isEligible = xdDate >= effectiveDate && xdDate.startsWith(purchaseYear);
      remainingRounds = isEligible ? 1 : 0;
      if (isEligible) remainingDates = [xdDate];
    }

    const grossRemaining = remainingRounds * grossPerCycle;
    const netRemaining = grossRemaining * taxFactor;

    return {
      grossPerCycle,
      netPerCycle,
      freq,
      grossAnnual,
      netAnnual,
      remainingRounds,
      remainingDates,
      grossRemaining,
      netRemaining,
      currSym,
      taxPct,
      effectiveDate,
    };
  }, [shares, expectedDpu, taxRatePercent, currency, purchaseDate, dividendAnalysis, xdDate]);

  const refreshExchangeRate = async () => {
    setIsFetchingRate(true);
    const rate = await fetchExchangeRate();
    setExchangeRate(rate.toFixed(2));
    setIsFetchingRate(false);
  };

  const handleCurrencyChange = async (newCurr: 'THB' | 'USD') => {
    setCurrency(newCurr);
    if (newCurr === 'USD') {
      setTaxRatePercent('15');
      if (!exchangeRate || exchangeRate === '34.00') {
        await refreshExchangeRate();
      }
    } else if (newCurr === 'THB' && taxRatePercent === '15') {
      setTaxRatePercent('10');
    }
  };

  // Calendar picker actions
  const openCalendar = (target: 'purchaseDate' | 'xdDate') => {
    setCalendarTarget(target);
    setIsCalendarVisible(true);
  };

  const handleSelectCalendarDate = (isoDate: string) => {
    if (calendarTarget === 'purchaseDate') {
      setPurchaseDate(isoDate);
    } else {
      setXdDate(isoDate);
    }
    setIsCalendarVisible(false);
  };


  const handleSymbolChange = async (text: string) => {
    setSymbol(text);
    if (assetType === 'STOCKS' && text.trim().length >= 1) {
      const results = await searchStocks(text);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSelectedSector(detectSector(text, 'STOCKS'));
    } else if (assetType === 'FUNDS') {
      const results = await searchThaiFunds(text);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSelectedSector(detectSector(text, 'FUNDS'));
    } else if (assetType === 'CASH') {
      setSelectedSector(detectSector(text, 'CASH'));
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = async (item: StockSuggestion | FundSuggestion) => {
    setSymbol(item.symbol);
    setShowSuggestions(false);

    // FUNDS FLOW (Thai Mutual Funds via SEC)
    if (assetType === 'FUNDS' || ('amc' in item)) {
      const fundItem = item as FundSuggestion;
      const initialSector = fundItem.category || detectSector(fundItem.symbol, 'FUNDS');
      setSelectedSector(initialSector);
      setCurrency('THB');
      setTaxRatePercent('10');
      setIsFetchingPrice(true);
      setIsFetchingDividends(true);
      setDividendAnalysis(null);
      setPriceNote(`กำลังดึง NAV ล่าสุดของ ${fundItem.symbol} จาก ก.ล.ต...`);

      const [navResult, divAnalysis, secCategory] = await Promise.all([
        fetchFundNav(fundItem.projId, fundItem.symbol),
        fetchFundDividendAnalysis(fundItem.projId, fundItem.symbol),
        !fundItem.category ? fetchFundCategory(fundItem.symbol) : Promise.resolve(null),
      ]);

      const finalSector = secCategory || initialSector;
      setSelectedSector(finalSector);
      const catDef = getSectorDefinition(finalSector, 'FUNDS');

      setIsFetchingPrice(false);
      setIsFetchingDividends(false);
      setDividendAnalysis(divAnalysis);

      const classMeta = detectFundClass(fundItem.symbol, fundItem.name);
      const classBadge = classMeta.isDividend
        ? '🟡 [Class D จ่ายปันผล]'
        : classMeta.type === 'ACCUMULATION'
        ? '⚪ [Class A สะสมมูลค่า]'
        : classMeta.type === 'TAX_SAVING'
        ? `🟣 [ลดหย่อนภาษี ${classMeta.tokenText}]`
        : `[${classMeta.label}]`;

      if (navResult && navResult.latestNav) {
        const navStr = navResult.latestNav.toFixed(4);
        setCurrentPrice(navStr);
        if (!costPrice.trim()) {
          setCostPrice(navStr);
        }
        setPriceNote(`🇹🇭 ${fundItem.exchange || fundItem.amc} • ${classBadge} • ประเภท: ${catDef.label} • NAV ล่าสุด: ฿${navStr}${navResult.navDate ? ` (${navResult.navDate})` : ''}`);
      } else {
        setPriceNote(`🇹🇭 ${fundItem.exchange || fundItem.amc} • ${classBadge} • ประเภท: ${catDef.label} • ${fundItem.name}`);
      }

      if (divAnalysis && divAnalysis.hasDividends) {
        setExpectedDpu(divAnalysis.latestDpu.toString());
        if (divAnalysis.projectedNextXdDates.length > 0) {
          setXdDate(divAnalysis.projectedNextXdDates[0]);
        }
      } else {
        setExpectedDpu('0');
      }
      return;
    }

    // STOCKS FLOW (US & Thai Stocks via Yahoo Finance)
    setSelectedSector(detectSector(item.symbol, 'STOCKS'));
    setIsFetchingPrice(true);
    setIsFetchingDividends(true);
    setDividendAnalysis(null);
    setPriceNote(`กำลังดึงราคาและวิเคราะห์ปันผลของ ${item.symbol}...`);

    if (item.market === 'US') {
      setCurrency('USD');
      setTaxRatePercent('15');
      refreshExchangeRate();
    } else {
      setCurrency('THB');
      setTaxRatePercent('10');
    }

    const [price, divAnalysis] = await Promise.all([
      fetchStockPrice(item.symbol, item.rawSymbol),
      fetchDividendAnalysis(item.symbol, item.rawSymbol),
    ]);

    setIsFetchingPrice(false);
    setIsFetchingDividends(false);
    setDividendAnalysis(divAnalysis);

    if (price !== null) {
      const priceStr = price.toString();
      setCurrentPrice(priceStr);
      if (!costPrice.trim()) {
        setCostPrice(priceStr);
      }
      setPriceNote(
        `${item.market === 'US' ? '🇺🇸 ' + item.exchange : '🇹🇭 ' + item.exchange} • ราคาปิดล่าสุด: ${item.currency === 'USD' ? '$' : '฿'}${price.toFixed(2)}`
      );
    } else {
      setPriceNote(`${item.market === 'US' ? '🇺🇸 ' + item.exchange : '🇹🇭 ' + item.exchange} • ${item.name}`);
    }

    if (divAnalysis.hasDividends) {
      setExpectedDpu(divAnalysis.latestDpu.toString());
      if (divAnalysis.projectedNextXdDates.length > 0) {
        setXdDate(divAnalysis.projectedNextXdDates[0]);
      }
    } else {
      setExpectedDpu('0');
    }
  };

  const handleOpenReview = () => {
    if (assetType === 'CASH') {
      const trimmedAccount = symbol.trim();
      const parsedDeposit = parseFloat(depositAmount);

      if (!trimmedAccount) {
        Alert.alert('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกชื่อบัญชี หรือสถาบันการเงิน');
        return;
      }
      if (isNaN(parsedDeposit) || parsedDeposit <= 0) {
        Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกจำนวนเงินฝากที่มากกว่า 0');
        return;
      }
      setIsReviewVisible(true);
      return;
    }

    const trimmedSymbol = symbol.trim().toUpperCase();
    const parsedShares = parseFloat(shares);
    const parsedCostPrice = parseFloat(costPrice);
    const parsedCurrentPrice = currentPrice.trim() ? parseFloat(currentPrice) : parsedCostPrice;

    if (!trimmedSymbol) {
      Alert.alert('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกชื่อย่อสินทรัพย์ (Symbol)');
      return;
    }

    if (isNaN(parsedShares) || parsedShares <= 0) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกจำนวนหุ้น/หน่วยที่มากกว่า 0');
      return;
    }

    if (isNaN(parsedCostPrice) || parsedCostPrice < 0) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกราคาต้นทุนให้ถูกต้อง');
      return;
    }

    if (isNaN(parsedCurrentPrice) || parsedCurrentPrice < 0) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกราคาปัจจุบันให้ถูกต้อง');
      return;
    }

    setIsReviewVisible(true);
  };

  const handleSubmit = async () => {
    // 1. CASH / BANK DEPOSIT SUBMIT FLOW
    if (assetType === 'CASH') {
      const trimmedAccount = symbol.trim();
      const parsedDeposit = parseFloat(depositAmount);
      const parsedRate = parseFloat(interestRate);

      if (!trimmedAccount) {
        Alert.alert('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกชื่อบัญชี หรือสถาบันการเงิน');
        return;
      }
      if (isNaN(parsedDeposit) || parsedDeposit <= 0) {
        Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกจำนวนเงินฝากที่มากกว่า 0');
        return;
      }

      setIsSubmitting(true);
      try {
        await ensureAuthenticated();
        const taxRate = (parseFloat(taxRatePercent) || 0) / 100;

        // Check if cash account already exists
        const { data: existingCashAssets } = await supabase
          .from('assets')
          .select('*')
          .ilike('symbol', trimmedAccount)
          .eq('asset_type', 'CASH')
          .eq('is_archived', false)
          .order('created_at', { ascending: true })
          .limit(1);

        let asset: Asset | null = existingCashAssets && existingCashAssets.length > 0 ? existingCashAssets[0] : null;
        const isExistingCash = !!asset;

        if (asset) {
          await supabase
            .from('assets')
            .update({ tax_rate: Number(taxRate.toFixed(4)) })
            .eq('id', asset.id);
        } else {
          // Insert into assets table
          const { data: newAsset, error: assetError } = await supabase
            .from('assets')
            .insert({
              symbol: trimmedAccount,
              asset_type: 'CASH',
              current_price: 1.0000,
              tax_rate: Number(taxRate.toFixed(4)),
              is_archived: false,
            })
            .select()
            .single();

          if (assetError || !newAsset) throw new Error(assetError?.message || 'ไม่สามารถบันทึกเงินฝากได้');
          asset = newAsset;
        }

        // Insert into transactions table with resilient fallback for exchange_rate
        const todayDate = (depositDate && depositDate.trim()) || new Date().toISOString().split('T')[0];
        const txPayload: any = {
          asset_id: asset.id,
          type: 'BUY',
          shares: Number(parsedDeposit.toFixed(4)),
          price_per_share: 1.0000,
          transaction_date: todayDate,
          exchange_rate: 1.0000,
        };

        let { error: txError } = await supabase.from('transactions').insert(txPayload);
        if (txError && (txError.message?.includes('exchange_rate') || txError.code === '42703' || txError.message?.includes('schema cache'))) {
          // Fallback retry without exchange_rate column
          delete txPayload.exchange_rate;
          const retry = await supabase.from('transactions').insert(txPayload);
          txError = retry.error;
        }

        if (txError) throw new Error(txError.message || 'ไม่สามารถบันทึกยอดเงินฝากได้');


        // Insert interest schedules
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

        // Save sector & currency
        await setAssetSector(asset.id, selectedSector || 'DigitalSavings');
        await setAssetCurrency(asset.id, 'THB');

        const alertMsg = isExistingCash
          ? `บันทึกรายการฝากเงินเพิ่มในบัญชี ${trimmedAccount} จำนวน ฿${parsedDeposit.toLocaleString()} เรียบร้อยแล้ว (ระบบรวมยอดเงินฝากให้อัตโนมัติ)`
          : `เพิ่มบัญชีเงินฝาก ${trimmedAccount} จำนวน ฿${parsedDeposit.toLocaleString()} เรียบร้อยแล้ว`;
        Alert.alert('สำเร็จ', alertMsg);
        resetForm();
        handleClose();
        onSuccess?.();
      } catch (err: any) {
        setIsReviewVisible(false);
        Alert.alert('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกเงินฝากได้');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // 2. STOCKS & FUNDS SUBMIT FLOW
    const trimmedSymbol = symbol.trim().toUpperCase();
    const parsedShares = parseFloat(shares);
    const parsedCostPrice = parseFloat(costPrice);
    const parsedCurrentPrice = currentPrice.trim() ? parseFloat(currentPrice) : parsedCostPrice;
    const parsedDpu = expectedDpu.trim() ? parseFloat(expectedDpu) : 0;

    if (!trimmedSymbol) {
      Alert.alert('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกชื่อย่อสินทรัพย์ (Symbol)');
      return;
    }

    if (isNaN(parsedShares) || parsedShares <= 0) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกจำนวนหุ้น/หน่วยที่มากกว่า 0');
      return;
    }

    if (isNaN(parsedCostPrice) || parsedCostPrice < 0) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกราคาต้นทุนให้ถูกต้อง');
      return;
    }

    if (isNaN(parsedCurrentPrice) || parsedCurrentPrice < 0) {
      Alert.alert('ข้อมูลไม่ถูกต้อง', 'กรุณากรอกราคาปัจจุบันให้ถูกต้อง');
      return;
    }

    setIsSubmitting(true);

    try {
      await ensureAuthenticated();

      const rate = currency === 'USD' ? (parseFloat(exchangeRate) || 34.0) : 1.0;
      const convertedCostPrice = parsedCostPrice * rate;
      const convertedCurrentPrice = parsedCurrentPrice * rate;
      const convertedDpu = parsedDpu * rate;

      const parsedTaxPercent = parseFloat(taxRatePercent);
      const calculatedTaxRate = isNaN(parsedTaxPercent) || parsedTaxPercent < 0
        ? (currency === 'USD' ? 0.1500 : 0.1000)
        : Number((parsedTaxPercent / 100).toFixed(4));

      // 1. Check if asset already exists in portfolio (non-archived)
      const { data: existingAssets } = await supabase
        .from('assets')
        .select('*')
        .ilike('symbol', trimmedSymbol)
        .eq('asset_type', assetType)
        .eq('is_archived', false)
        .order('created_at', { ascending: true })
        .limit(1);

      let asset: Asset | null = existingAssets && existingAssets.length > 0 ? existingAssets[0] : null;
      const isExisting = !!asset;

      if (asset) {
        // Asset already exists: update latest current_price and tax_rate
        const { data: updatedAsset, error: updateErr } = await supabase
          .from('assets')
          .update({
            current_price: Number(convertedCurrentPrice.toFixed(4)),
            tax_rate: calculatedTaxRate,
          })
          .eq('id', asset.id)
          .select()
          .single();

        if (!updateErr && updatedAsset) {
          asset = updatedAsset;
        }
      } else {
        // Insert new record to assets table (prices in THB for unified portfolio)
        const { data: newAsset, error: assetError } = await supabase
          .from('assets')
          .insert({
            symbol: trimmedSymbol,
            asset_type: assetType,
            current_price: Number(convertedCurrentPrice.toFixed(4)),
            tax_rate: calculatedTaxRate,
            is_archived: false,
          })
          .select()
          .single();

        if (assetError || !newAsset) {
          throw new Error(assetError?.message || 'ไม่สามารถเพิ่มสินทรัพย์ได้');
        }
        asset = newAsset;
      }

      // 2. Insert BUY record to transactions table with resilient fallback for exchange_rate
      const todayDate = new Date().toISOString().split('T')[0];
      const effectiveTxDate = purchaseDate && purchaseDate.trim() ? purchaseDate.trim() : todayDate;
      const txPayload: any = {
        asset_id: asset.id,
        type: 'BUY',
        shares: Number(parsedShares.toFixed(4)),
        price_per_share: Number(convertedCostPrice.toFixed(4)),
        transaction_date: effectiveTxDate,
        exchange_rate: Number(rate.toFixed(4)),
      };

      let { data: insertedTx, error: txError } = await supabase
        .from('transactions')
        .insert(txPayload)
        .select()
        .single();

      if (txError && (txError.message?.includes('exchange_rate') || txError.code === '42703' || txError.message?.includes('schema cache'))) {
        // Fallback retry without exchange_rate column
        delete txPayload.exchange_rate;
        const retry = await supabase
          .from('transactions')
          .insert(txPayload)
          .select()
          .single();
        insertedTx = retry.data;
        txError = retry.error;
      }

      if (txError) {
        throw new Error(txError.message || 'ไม่สามารถบันทึกรายการซื้อได้');
      }


      if (insertedTx && insertedTx.id) {
        await saveTransactionCurrencyMeta(insertedTx.id, {
          originalPrice: parsedCostPrice,
          currency: currency,
          fxRate: parseFloat(exchangeRate) || 34.00,
          assetId: asset.id,
        });
      }

      // 3. Insert projected DPU to dividend_schedules if (STOCKS or FUNDS) and DPU > 0 (store native DPU for Floating FX)
      if ((assetType === 'STOCKS' || assetType === 'FUNDS') && parsedDpu > 0) {
        const targetXdDate = xdDate || effectiveTxDate;

        if (dividendAnalysis?.hasDividends && dividendAnalysis.projectedNextXdDates.length > 1) {
          // Multi-cycle projected schedule (quarterly / semi-annual)
          const schedules = dividendAnalysis.projectedNextXdDates.map((dateStr) => ({
            asset_id: asset.id,
            dpu: Number(parsedDpu.toFixed(4)),
            xd_date: dateStr,
            is_projected: true,
          }));

          const { error: divError } = await supabase.from('dividend_schedules').insert(schedules);
          if (divError) {
            console.warn('Dividend schedule multi-insert notice:', divError.message);
          } else {
            await scheduleXdReminder(trimmedSymbol, dividendAnalysis.projectedNextXdDates[0]);
          }
        } else {
          // Single schedule
          const { error: divError } = await supabase.from('dividend_schedules').insert({
            asset_id: asset.id,
            dpu: Number(parsedDpu.toFixed(4)),
            xd_date: targetXdDate,
            is_projected: true,
          });

          if (divError) {
            console.warn('Dividend schedule insert notice:', divError.message);
          } else {
            await scheduleXdReminder(trimmedSymbol, targetXdDate);
          }
        }
      }

      // Save sector & currency
      const finalSector = selectedSector && selectedSector !== 'Other'
        ? selectedSector
        : detectSector(trimmedSymbol, assetType);
      await setAssetSector(asset.id, finalSector);
      await setAssetCurrency(asset.id, currency);

      const alertMsg = isExisting
        ? `บันทึกรายการซื้อเพิ่มใน ${trimmedSymbol} เรียบร้อยแล้ว (ระบบรวมจำนวนหุ้นและเฉลี่ยต้นทุนให้อัตโนมัติ)`
        : currency === 'USD'
        ? `เพิ่มสินทรัพย์ ${trimmedSymbol} เข้าสู่พอร์ตแล้ว (ซื้อ $${parsedCostPrice.toFixed(2)} แปลงเป็น ฿${convertedCostPrice.toFixed(2)} ที่อัตรา ฿${rate.toFixed(2)}/USD)`
        : `เพิ่มสินทรัพย์ ${trimmedSymbol} เข้าสู่พอร์ตเรียบร้อยแล้ว`;

      Alert.alert('สำเร็จ', alertMsg);
      resetForm();
      handleClose();
      onSuccess?.();
    } catch (err: any) {
      setIsReviewVisible(false);
      Alert.alert('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {showFAB && (
        <TouchableOpacity
          style={styles.fab}
          onPress={handleOpen}
          activeOpacity={0.85}
          accessibilityLabel="เพิ่มสินทรัพย์"
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      <Modal
        visible={isVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'android' ? 'height' : 'padding'}
          style={styles.modalOverlay}
        >
          <View style={styles.sheetContainer}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>เพิ่มสินทรัพย์ใหม่</Text>
                <Text style={styles.sheetSubtitle}>บันทึกรายการเข้าพอร์ตการลงทุน</Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={styles.closeButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Minimal Segmented Asset Type Selector */}
              <View style={styles.typeSegmentContainer}>
                {ASSET_TYPES.map((item) => {
                  const isSelected = assetType === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      style={[styles.typeSegmentTab, isSelected && styles.typeSegmentTabSelected]}
                      onPress={() => handleAssetTypeSelect(item.value)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={item.icon}
                        size={15}
                        color={isSelected ? '#0F172A' : '#64748B'}
                      />
                      <Text style={[styles.typeSegmentText, isSelected && styles.typeSegmentTextSelected]}>
                        {item.shortLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* IF CASH: SHOW CASH & INTEREST FORM */}
              {existingHolding && assetType === 'CASH' && (
                <View style={styles.existingHoldingBanner}>
                  <View style={styles.existingHoldingHeader}>
                    <Ionicons name="layers" size={15} color="#2563EB" />
                    <Text style={styles.existingHoldingTitle}>
                      มีบัญชีนี้ในพอร์ตแล้ว (ยอดคงเหลือ ฿{existingHolding.shares.toLocaleString()})
                    </Text>
                  </View>
                  <Text style={styles.existingHoldingSubtitle}>
                    การบันทึกครั้งนี้จะถือเป็น{' '}
                    <Text style={{ fontWeight: '700', color: '#1E40AF' }}>การฝากเงินเพิ่ม (Deposit)</Text>{' '}
                    ระบบจะรวมยอดเงินฝากเข้าบัญชีเดิมให้อัตโนมัติ
                  </Text>
                </View>
              )}
              {assetType === 'CASH' ? (
                <CashAssetForm
                  accountName={symbol}
                  onChangeAccountName={handleSymbolChange}
                  selectedSector={selectedSector}
                  onChangeSector={setSelectedSector}
                  depositAmount={depositAmount}
                  onChangeDepositAmount={setDepositAmount}
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
                      const dep = parseFloat(depositAmount) || 0;
                      const rate = parseFloat(interestRate) || 0;
                      const evalResult = evaluateCashTax(dep, rate, selectedSector);
                      setTaxRatePercent(evalResult.suggestedTaxRatePercent.toString());
                    }
                  }}
                  depositDate={depositDate}
                  onChangeDepositDate={setDepositDate}
                />
              ) : (
                /* IF STOCKS OR FUNDS: SHOW STOCKS/FUNDS FORM */
                <View>
                  {/* Symbol with Suggestions */}
                  <View style={styles.symbolInputWrapper}>
                    <Text style={styles.label}>
                      {assetType === 'FUNDS' ? 'ชื่อย่อกองทุน (Fund Symbol) *' : 'ชื่อย่อ / รหัสสินทรัพย์ (Symbol) *'}
                    </Text>
                    <View style={styles.symbolSearchContainer}>
                      <Ionicons name="search" size={17} color="#94A3B8" style={styles.symbolSearchIcon} />
                      <TextInput
                        style={styles.symbolSearchInput}
                        value={symbol}
                        onChangeText={handleSymbolChange}
                        onFocus={() => {
                          if (assetType === 'STOCKS' && symbol.trim().length >= 1) {
                            searchStocks(symbol).then((res) => {
                              setSuggestions(res);
                              setShowSuggestions(res.length > 0);
                            });
                          } else if (assetType === 'FUNDS') {
                            searchThaiFunds(symbol).then((res) => {
                              setSuggestions(res);
                              setShowSuggestions(res.length > 0);
                            });
                          }
                        }}
                        onBlur={() => {
                          const clean = symbol.trim().toUpperCase();
                          if (clean && !isFetchingDividends && (!dividendAnalysis || !dividendAnalysis.hasDividends)) {
                            if (assetType === 'FUNDS') {
                              const matched = POPULAR_THAI_FUNDS.find(
                                (f) => f.symbol.toUpperCase() === clean
                              );
                              handleSelectSuggestion(
                                matched || {
                                  symbol: clean,
                                  rawSymbol: clean,
                                  name: clean,
                                  amc: 'กองทุนรวมไทย',
                                  exchange: 'SEC',
                                  market: 'TH',
                                  currency: 'THB',
                                  category: detectSector(clean, 'FUNDS'),
                                }
                              );
                            }
                          }
                        }}
                        placeholder={
                          assetType === 'FUNDS'
                            ? 'เช่น K-USA, SCBDV, B-INNOTECH, KF-GTECH'
                            : 'เช่น PTT, MCD, AAPL หรือชื่อสินทรัพย์นอกตลาด'
                        }
                        placeholderTextColor="#94A3B8"
                        autoCapitalize="characters"
                        autoCorrect={false}
                      />
                      {symbol.length > 0 && (
                        <TouchableOpacity
                          style={styles.symbolClearBtn}
                          onPress={() => resetForm(true)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="close-circle" size={19} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                      <View style={styles.suggestionsContainer}>
                        <View style={styles.suggestionsHeader}>
                          <Text style={styles.suggestionsHeaderText}>
                            {assetType === 'FUNDS' ? 'แนะนำกองทุนรวมไทย (ก.ล.ต.)' : 'แนะนำหุ้นตลาด US & SET'}
                          </Text>
                          <TouchableOpacity onPress={() => setShowSuggestions(false)}>
                            <Ionicons name="close-circle" size={16} color="#94A3B8" />
                          </TouchableOpacity>
                        </View>
                        {suggestions.map((item) => {
                          const isFund = assetType === 'FUNDS' || 'amc' in item;
                          const fundClass = isFund ? detectFundClass(item.symbol, item.name) : null;

                          return (
                            <TouchableOpacity
                              key={item.rawSymbol}
                              style={styles.suggestionItem}
                              onPress={() => handleSelectSuggestion(item)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.suggestionLeft}>
                                <View style={styles.suggestionTitleRow}>
                                  <Text style={styles.suggestionSymbol}>{item.symbol}</Text>
                                  {fundClass && (
                                    <View
                                      style={[
                                        styles.fundClassToken,
                                        {
                                          backgroundColor: fundClass.tokenBg,
                                          borderColor: fundClass.tokenBorder,
                                        },
                                        fundClass.isDividend && styles.fundClassTokenDividend,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.fundClassTokenText,
                                          { color: fundClass.tokenColor },
                                        ]}
                                      >
                                        {fundClass.tokenText}
                                      </Text>
                                    </View>
                                  )}
                                  {!isFund && <Text style={styles.suggestionExchange}>• {item.exchange}</Text>}
                                  {'category' in item && item.category ? (
                                    <View
                                      style={[
                                        styles.fundCatBadge,
                                        {
                                          backgroundColor:
                                            getSectorDefinition(item.category, 'FUNDS').color + '20',
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.fundCatBadgeText,
                                          {
                                            color: getSectorDefinition(item.category, 'FUNDS').color,
                                          },
                                        ]}
                                      >
                                        {getSectorDefinition(item.category, 'FUNDS').label.split(' ')[0]}
                                      </Text>
                                    </View>
                                  ) : null}
                                </View>
                                <Text style={styles.suggestionName} numberOfLines={1}>
                                  {item.name}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.marketBadge,
                                  item.market === 'US' ? styles.marketBadgeUS : styles.marketBadgeTH,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.marketBadgeText,
                                    item.market === 'US' ? styles.marketBadgeTextUS : styles.marketBadgeTextTH,
                                  ]}
                                >
                                  {item.market === 'US' ? `🇺🇸 ${item.exchange}` : `🇹🇭 ${item.exchange}`}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {/* Existing Holding / DCA Accumulation Notice */}
                  {existingHolding && (
                    <View style={styles.existingHoldingBanner}>
                      <View style={styles.existingHoldingHeader}>
                        <Ionicons name="layers" size={15} color="#2563EB" />
                        <Text style={styles.existingHoldingTitle}>
                          มีสินทรัพย์นี้ในพอร์ตแล้ว ({existingHolding.shares.toLocaleString()} หุ้น)
                        </Text>
                      </View>
                      <Text style={styles.existingHoldingSubtitle}>
                        ต้นทุนเฉลี่ยปัจจุบัน: ฿{existingHolding.avgCost.toFixed(2)} • การบันทึกครั้งนี้จะถือเป็น{' '}
                        <Text style={{ fontWeight: '700', color: '#1E40AF' }}>การซื้อเพิ่ม (DCA)</Text>{' '}
                        ระบบจะรวมจำนวนหุ้นและเฉลี่ยต้นทุนให้อัตโนมัติ
                      </Text>
                    </View>
                  )}

                  {/* Segment / Category Selector for Stocks/Funds (Auto by default + Clickable badge) */}
                  <View style={styles.sectorHeaderRow}>
                    <Text style={styles.labelNoMargin}>
                      {assetType === 'FUNDS' ? 'ประเภทกองทุน' : 'กลุ่มอุตสาหกรรม (Segment)'}
                    </Text>
                    {selectedSector ? (
                      <TouchableOpacity
                        style={[
                          styles.detectedSectorBadgeBtn,
                          {
                            backgroundColor:
                              getSectorDefinition(selectedSector, assetType).color + '14',
                            borderColor:
                              getSectorDefinition(selectedSector, assetType).color + '40',
                          },
                        ]}
                        onPress={() => setIsSectorPickerVisible(true)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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

                  {/* Currency Selector (THB vs USD) */}
                  {assetType === 'STOCKS' && (
                    <>
                      <Text style={styles.label}>สกุลเงินที่ซื้อ (Currency)</Text>
                      <View style={styles.currencyToggleContainer}>
                        <TouchableOpacity
                          style={[styles.currencyBtn, currency === 'THB' && styles.currencyBtnActive]}
                          onPress={() => handleCurrencyChange('THB')}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.currencyBtnText, currency === 'THB' && styles.currencyBtnTextActive]}>
                            🇹🇭 บาทไทย (THB ฿)
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.currencyBtn, currency === 'USD' && styles.currencyBtnActive]}
                          onPress={() => handleCurrencyChange('USD')}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.currencyBtnText, currency === 'USD' && styles.currencyBtnTextActive]}>
                            🇺🇸 ดอลลาร์สหรัฐ (USD $)
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* USD Exchange Rate & Live Conversion Box */}
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
                              value={exchangeRate}
                              onChangeText={setExchangeRate}
                              keyboardType="decimal-pad"
                              placeholder="34.00"
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
                              ≈ ฿{(parseFloat(costPrice) * (parseFloat(exchangeRate) || 34)).toFixed(2)} บาท/หุ้น
                              {shares.trim() && !isNaN(parseFloat(shares))
                                ? ` (ยอดรวม: ฿${(parseFloat(shares) * parseFloat(costPrice) * (parseFloat(exchangeRate) || 34)).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                                : ''}
                            </Text>
                          ) : null}
                        </View>
                      )}
                    </>
                  )}

                  {/* Row 1: Shares & Cost Price */}
                  <View style={styles.row}>
                    <View style={styles.flexHalf}>
                      <Text style={styles.labelCompact}>
                        {assetType === 'FUNDS' ? 'จำนวนหน่วย *' : 'จำนวนหุ้น *'}
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={shares}
                        onChangeText={setShares}
                        placeholder="0.0000"
                        placeholderTextColor="#94A3B8"
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.flexGap} />
                    <View style={styles.flexHalf}>
                      <Text style={styles.labelCompact}>
                        {assetType === 'FUNDS'
                          ? 'NAV ต้นทุน (฿) *'
                          : `ราคาต้นทุน (${currency === 'USD' ? '$' : '฿'}) *`}
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={costPrice}
                        onChangeText={setCostPrice}
                        placeholder="0.0000"
                        placeholderTextColor="#94A3B8"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>

                  {/* Row 2: Current Market Price & Purchase Date (with 📅 button) */}
                  <View style={styles.row}>
                    <View style={styles.flexHalf}>
                      <View style={styles.labelRowCompact}>
                        <Text style={styles.labelCompact}>
                          {assetType === 'FUNDS'
                            ? 'NAV ล่าสุด (฿)'
                            : `ราคาตลาด (${currency === 'USD' ? '$' : '฿'})`}
                        </Text>
                        {isFetchingPrice && <ActivityIndicator size="small" color="#059669" />}
                      </View>
                      <TextInput
                        style={styles.input}
                        value={currentPrice}
                        onChangeText={setCurrentPrice}
                        placeholder={assetType === 'FUNDS' ? 'NAV ต้นทุน' : 'ราคาต้นทุน'}
                        placeholderTextColor="#94A3B8"
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.flexGap} />
                    <View style={styles.flexHalf}>
                      <View style={styles.labelRowCompact}>
                        <Text style={styles.labelCompact}>วันที่เข้าซื้อ</Text>
                        <Text style={styles.dateHintMini}>สิทธิ์ XD</Text>
                      </View>
                      <View style={styles.datePickerInputContainer}>
                        <TextInput
                          style={styles.datePickerInputField}
                          value={purchaseDate}
                          onChangeText={setPurchaseDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#94A3B8"
                        />
                        <TouchableOpacity
                          style={styles.datePickerIconButton}
                          onPress={() => openCalendar('purchaseDate')}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="calendar-outline" size={17} color="#059669" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {priceNote ? (
                    <View style={styles.priceNoteRow}>
                      <Ionicons name="information-circle-outline" size={13} color="#059669" />
                      <Text style={styles.priceNoteText}>{priceNote}</Text>
                    </View>
                  ) : null}

                  {/* Conditional DPU field - for STOCKS & FUNDS */}
                  {(assetType === 'STOCKS' || assetType === 'FUNDS') && (
                    <View style={styles.dpuSectionCompact}>
                      {/* Row 3: Expected DPU & Expected XD Date (with 📅 button) */}
                      <View style={styles.row}>
                        <View style={styles.flexHalf}>
                          <Text style={styles.labelCompact}>
                            ปันผล/หุ้น ({currency === 'USD' ? '$' : '฿'})
                          </Text>
                          <TextInput
                            style={styles.input}
                            value={expectedDpu}
                            onChangeText={setExpectedDpu}
                            placeholder="0.0000"
                            placeholderTextColor="#94A3B8"
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={styles.flexGap} />
                        <View style={styles.flexHalf}>
                          <Text style={styles.labelCompact}>วัน XD คาดการณ์</Text>
                          <View style={styles.datePickerInputContainer}>
                            <TextInput
                              style={styles.datePickerInputField}
                              value={xdDate}
                              onChangeText={setXdDate}
                              placeholder="YYYY-MM-DD"
                              placeholderTextColor="#94A3B8"
                            />
                            <TouchableOpacity
                              style={styles.datePickerIconButton}
                              onPress={() => openCalendar('xdDate')}
                              activeOpacity={0.7}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="calendar-outline" size={17} color="#059669" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>

                      {/* Unified Smart Dividend Card */}
                      {dividendPreview ? (
                        <View style={styles.smartDivCard}>
                          <View style={styles.smartDivHeader}>
                            <View style={styles.smartDivHeaderLeft}>
                              <Ionicons name="calculator" size={14} color="#059669" />
                              <Text style={styles.smartDivTitle}>ประมาณการเงินปันผลสุทธิ</Text>
                            </View>
                            <View style={styles.smartDivBadge}>
                              <Text style={styles.smartDivBadgeText}>
                                {dividendAnalysis?.frequencyLabel || `${dividendPreview.freq} ครั้ง/ปี`}
                              </Text>
                            </View>
                          </View>

                          {/* Top Remaining Banner */}
                          <View style={styles.smartDivBanner}>
                            {dividendPreview.remainingRounds > 0 ? (
                              <>
                                <View style={styles.smartDivBannerRow}>
                                  <Text style={styles.smartDivBannerLabel}>
                                    ปันผลปีนี้ (เหลือ {dividendPreview.remainingRounds} รอบ)
                                  </Text>
                                  <Text style={styles.smartDivBannerValue}>
                                    {dividendPreview.currSym}
                                    {dividendPreview.netRemaining.toLocaleString('th-TH', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </Text>
                                </View>
                                <Text style={styles.smartDivBannerSub}>
                                  ยอดก่อนภาษี {dividendPreview.currSym}
                                  {dividendPreview.grossRemaining.toLocaleString('th-TH', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                  {dividendPreview.taxPct > 0 ? ` • หักภาษี ${dividendPreview.taxPct}%` : ''}
                                </Text>
                              </>
                            ) : (
                              <View style={styles.smartDivPassedBox}>
                                <Ionicons name="time-outline" size={13} color="#64748B" />
                                <Text style={styles.smartDivPassedText}>
                                  เข้าซื้อหลัง XD ปีนี้ • รอรับรอบถัดไปปีหน้า
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* Mini Stats Strip */}
                          <View style={styles.smartDivStatsRow}>
                            <View style={styles.smartDivStatCol}>
                              <Text style={styles.smartDivStatLabel}>รับต่อรอบ (สุทธิ)</Text>
                              <Text style={styles.smartDivStatValue}>
                                {dividendPreview.currSym}
                                {dividendPreview.netPerCycle.toLocaleString('th-TH', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </Text>
                            </View>
                            <View style={styles.smartDivDivider} />
                            <View style={styles.smartDivStatCol}>
                              <Text style={styles.smartDivStatLabel}>
                                คาดการณ์เต็มปี ({dividendPreview.freq} รอบ)
                              </Text>
                              <Text style={[styles.smartDivStatValue, { color: '#059669' }]}>
                                {dividendPreview.currSym}
                                {dividendPreview.netAnnual.toLocaleString('th-TH', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ) : dividendAnalysis && dividendAnalysis.hasDividends ? (
                        <View style={styles.smartDivCard}>
                          <View style={styles.smartDivHeader}>
                            <View style={styles.smartDivHeaderLeft}>
                              <Ionicons name="analytics-outline" size={14} color="#047857" />
                              <Text style={styles.smartDivTitle}>วิเคราะห์ปันผลอัตโนมัติ</Text>
                            </View>
                            <View style={styles.smartDivBadge}>
                              <Text style={styles.smartDivBadgeText}>{dividendAnalysis.frequencyLabel}</Text>
                            </View>
                          </View>
                          <View style={styles.smartDivStatsRow}>
                            <View style={styles.smartDivStatCol}>
                              <Text style={styles.smartDivStatLabel}>รอบล่าสุดต่อหุ้น</Text>
                              <Text style={styles.smartDivStatValue}>
                                {currency === 'USD' ? '$' : '฿'}{dividendAnalysis.latestDpu.toFixed(4)}
                              </Text>
                            </View>
                            <View style={styles.smartDivDivider} />
                            <View style={styles.smartDivStatCol}>
                              <Text style={styles.smartDivStatLabel}>คาดการณ์ทั้งปี (Annual)</Text>
                              <Text style={[styles.smartDivStatValue, { color: '#059669' }]}>
                                {currency === 'USD' ? '$' : '฿'}{dividendAnalysis.annualProjectedDpu.toFixed(4)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ) : null}

                      {/* Compact Withholding Tax Bar */}
                      <View style={styles.taxSectionCompact}>
                        <View style={styles.taxHeaderRowCompact}>
                          <View style={styles.taxHeaderLeftCompact}>
                            <Ionicons name="receipt-outline" size={13} color="#475569" />
                            <Text style={styles.labelCompact}>ภาษีหัก ณ ที่จ่าย (%)</Text>
                          </View>
                          <View style={styles.taxInputInlineWrapper}>
                            <TextInput
                              style={styles.taxInputInline}
                              value={taxRatePercent}
                              onChangeText={setTaxRatePercent}
                              placeholder="10"
                              placeholderTextColor="#94A3B8"
                              keyboardType="decimal-pad"
                            />
                            <Text style={styles.taxPercentSign}>%</Text>
                          </View>
                        </View>
                        <View style={styles.taxPillRowCompact}>
                          {[
                            { label: '10% หุ้นไทย', value: '10' },
                            { label: '15% US (W-8)', value: '15' },
                            { label: '0% กองทุน/ยกเว้น', value: '0' },
                          ].map((pill) => (
                            <TouchableOpacity
                              key={pill.value}
                              style={[
                                styles.taxPillCompact,
                                taxRatePercent === pill.value && styles.taxPillCompactActive,
                              ]}
                              onPress={() => setTaxRatePercent(pill.value)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.taxPillCompactText,
                                  taxRatePercent === pill.value && styles.taxPillCompactTextActive,
                                ]}
                              >
                                {pill.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleOpenReview}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" style={styles.submitIcon} />
                <Text style={styles.submitButtonText}>บันทึกสินทรัพย์</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Calendar Picker Modal Overlay */}
      <CalendarPickerModal
        visible={isCalendarVisible}
        target={calendarTarget}
        currentDate={calendarTarget === 'purchaseDate' ? purchaseDate : xdDate}
        title={calendarTarget === 'purchaseDate' ? 'เลือกวันที่เข้าซื้อ' : 'เลือกวัน XD คาดการณ์'}
        onClose={() => setIsCalendarVisible(false)}
        onSelectDate={handleSelectCalendarDate}
      />

      {/* Sector / Segment Picker Modal */}
      <SectorPickerModal
        visible={isSectorPickerVisible}
        assetType={assetType}
        selectedSector={selectedSector}
        onSelectSector={(secId) => setSelectedSector(secId)}
        onClose={() => setIsSectorPickerVisible(false)}
      />

      {/* 4. Minimal Review & Confirmation Modal */}
      <Modal
        visible={isReviewVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => !isSubmitting && setIsReviewVisible(false)}
      >
        <View style={styles.reviewModalOverlay}>
          <View style={styles.reviewCardContainer}>
            {/* Header */}
            <View style={styles.reviewHeader}>
              <View style={styles.reviewHeaderLeft}>
                <Ionicons name="shield-checkmark" size={20} color="#059669" />
                <Text style={styles.reviewTitle}>ตรวจทานก่อนบันทึก</Text>
              </View>
              <View style={[
                styles.reviewBadge,
                assetType === 'CASH'
                  ? styles.reviewBadgeCash
                  : existingHolding
                  ? styles.reviewBadgeDca
                  : styles.reviewBadgeBuy,
              ]}>
                <Text style={[
                  styles.reviewBadgeText,
                  assetType === 'CASH'
                    ? styles.reviewBadgeTextCash
                    : existingHolding
                    ? styles.reviewBadgeTextDca
                    : styles.reviewBadgeTextBuy,
                ]}>
                  {assetType === 'CASH' ? 'ฝากเงิน (DEPOSIT)' : existingHolding ? 'ซื้อเพิ่ม (DCA)' : 'ซื้อใหม่ (BUY)'}
                </Text>
              </View>
            </View>

            {/* Hero Value Highlight Box */}
            <View style={styles.reviewHeroBox}>
              <Text style={styles.reviewHeroLabel}>ยอดเงินลงทุนรวม (Total Value)</Text>
              <Text style={styles.reviewHeroValue}>
                ฿{(
                  assetType === 'CASH'
                    ? (parseFloat(depositAmount) || 0)
                    : (parseFloat(shares) || 0) * (parseFloat(costPrice) || 0) * (currency === 'USD' ? (parseFloat(exchangeRate) || 34.0) : 1.0)
                ).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              {currency === 'USD' && assetType !== 'CASH' && (
                <Text style={styles.reviewHeroSub}>
                  ${((parseFloat(shares) || 0) * (parseFloat(costPrice) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (เรท ฿{(parseFloat(exchangeRate) || 34.0).toFixed(2)}/$)
                </Text>
              )}
            </View>

            {/* Minimal 4-Row Summary List */}
            <View style={styles.reviewList}>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewRowLabel}>สินทรัพย์</Text>
                <Text style={styles.reviewRowValBold}>
                  {assetType === 'CASH' ? symbol.trim() : symbol.trim().toUpperCase()}
                  <Text style={styles.reviewRowValSub}>
                    {' • '}{assetType === 'STOCKS' ? 'หุ้น' : assetType === 'FUNDS' ? (
                      detectFundClass(symbol).isDividend ? 'กองทุน (ปันผล 🟡 D)' : 'กองทุน (สะสม ⚪ A)'
                    ) : 'เงินฝาก'}
                  </Text>
                </Text>
              </View>

              <View style={styles.reviewRow}>
                <Text style={styles.reviewRowLabel}>{assetType === 'CASH' ? 'ยอดเงินฝาก' : 'จำนวนหุ้น / หน่วย'}</Text>
                <Text style={styles.reviewRowValBold}>
                  {assetType === 'CASH'
                    ? `฿${(parseFloat(depositAmount) || 0).toLocaleString()} บาท`
                    : `${(parseFloat(shares) || 0).toLocaleString()} หุ้น`}
                </Text>
              </View>

              {assetType !== 'CASH' && (
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewRowLabel}>ราคาต้นทุน</Text>
                  <Text style={styles.reviewRowValBold}>
                    {currency === 'USD'
                      ? `$${(parseFloat(costPrice) || 0).toFixed(2)} (~฿${((parseFloat(costPrice) || 0) * (parseFloat(exchangeRate) || 34.0)).toFixed(2)})`
                      : `฿${(parseFloat(costPrice) || 0).toFixed(2)} / หุ้น`}
                  </Text>
                </View>
              )}

              <View style={styles.reviewRow}>
                <Text style={styles.reviewRowLabel}>วันที่ทำรายการ</Text>
                <Text style={styles.reviewRowValBold}>
                  {formatReviewDate(assetType === 'CASH' ? (depositDate || new Date().toISOString().split('T')[0]) : (purchaseDate || new Date().toISOString().split('T')[0]))}
                </Text>
              </View>

              {assetType === 'CASH' && (parseFloat(interestRate) || 0) > 0 && (
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewRowLabel}>อัตราดอกเบี้ย</Text>
                  <Text style={styles.reviewRowValBold}>
                    {(parseFloat(interestRate) || 0).toFixed(2)}% ต่อปี ({interestFrequency === 'MONTHLY' ? 'ทุกเดือน' : interestFrequency === 'SEMI_ANNUAL' ? 'ราย 6 เดือน' : 'รายปี'})
                  </Text>
                </View>
              )}

              {assetType !== 'CASH' && (parseFloat(expectedDpu) || 0) > 0 && (
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewRowLabel}>ปันผลคาดการณ์</Text>
                  <Text style={styles.reviewRowValBold}>
                    {currency === 'USD'
                      ? `$${(parseFloat(expectedDpu) || 0).toFixed(4)} (~฿${((parseFloat(expectedDpu) || 0) * (parseFloat(exchangeRate) || 34.0)).toFixed(2)})`
                      : `฿${(parseFloat(expectedDpu) || 0).toFixed(4)} / หุ้น`}
                  </Text>
                </View>
              )}
            </View>

            {/* Actions: Edit (Back) vs Confirm (Save) */}
            <View style={styles.reviewActionsRow}>
              <TouchableOpacity
                style={styles.reviewCancelBtn}
                onPress={() => setIsReviewVisible(false)}
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <Text style={styles.reviewCancelText}>กลับไปแก้ไข</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.reviewConfirmBtn, isSubmitting && styles.reviewConfirmBtnDisabled]}
                onPress={handleSubmit}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                    <Text style={styles.reviewConfirmText}>ยืนยันบันทึก</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    zIndex: 999,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
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
    backgroundColor: '#F1F5F9',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 10,
  },
  typeSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginTop: 4,
    marginBottom: 14,
    gap: 4,
  },
  typeSegmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
    gap: 6,
  },
  typeSegmentTabSelected: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  typeSegmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  typeSegmentTextSelected: {
    color: '#0F172A',
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flexHalf: {
    flex: 1,
  },
  flexGap: {
    width: 12,
  },
  dpuSection: {
    marginTop: 12,
    padding: 14,
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  dpuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  dpuSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  submitButton: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    elevation: 2,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  submitButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  submitIcon: {
    marginRight: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  symbolInputWrapper: {
    position: 'relative',
    zIndex: 50,
  },
  symbolSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 16,
  },
  symbolSearchIcon: {
    marginRight: 8,
  },
  symbolSearchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    paddingVertical: 0,
    height: '100%',
  },
  symbolClearBtn: {
    padding: 4,
    marginLeft: 6,
  },
  suggestionsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginTop: 6,
    marginBottom: 8,
    paddingVertical: 4,
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    zIndex: 100,
  },
  suggestionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  suggestionsHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  suggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  suggestionLeft: {
    flex: 1,
    marginRight: 8,
  },
  suggestionSymbol: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  suggestionName: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  marketBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  marketBadgeUS: {
    backgroundColor: '#EFF6FF',
  },
  marketBadgeTH: {
    backgroundColor: '#ECFDF5',
  },
  marketBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  marketBadgeTextUS: {
    color: '#2563EB',
  },
  marketBadgeTextTH: {
    color: '#059669',
  },
  currentPriceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fetchingPriceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fetchingPriceText: {
    fontSize: 11,
    color: '#059669',
  },
  priceNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  priceNoteText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '500',
  },
  suggestionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fundClassToken: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 2,
    marginRight: 1,
  },
  fundClassTokenDividend: {
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  fundClassTokenText: {
    fontSize: 10.5,
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
  },
  fundClassLabelMini: {
    fontSize: 10.5,
    fontWeight: '700',
    marginRight: 2,
  },
  suggestionExchange: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  fundCatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  fundCatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  sectorHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 6,
    gap: 8,
  },
  detectedSectorBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 1,
  },
  detectedSectorBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  currencyToggleContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
    marginBottom: 6,
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
  },
  usdExchangeBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 12,
    marginTop: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  usdExchangeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
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
  },
  usdExchangeInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#93C5FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    paddingVertical: 9,
    borderRadius: 10,
  },
  fetchRateBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  usdConvertedHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E40AF',
    marginTop: 6,
  },
  dpuHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  divHighlightCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  divHighlightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  divHighlightTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    flex: 1,
  },
  divFreqBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  divFreqText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  divStatsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  divStatBox: {
    flex: 1,
    alignItems: 'center',
  },
  divStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  divStatLabel: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 2,
    fontWeight: '600',
  },
  divStatValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  divStatValueHighlight: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  divScheduleHint: {
    fontSize: 11,
    color: '#047857',
    marginTop: 8,
    lineHeight: 16,
  },
  nonDivCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  nonDivTextCol: {
    flex: 1,
  },
  nonDivTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 2,
  },
  nonDivDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
  taxSection: {
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  taxHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  taxHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  labelNoMargin: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  taxCurrentBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  taxCurrentBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3730A3',
  },
  taxPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  taxPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  taxPillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  taxPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  taxPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  taxHintText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 15,
  },
  sectorChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
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
  cashPreviewTotalRow: {
    paddingTop: 6,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#D1FAE5',
  },
  cashPreviewLabel: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '500',
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
  cashTaxHeaderRow: {
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
  existingHoldingBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  existingHoldingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  existingHoldingTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  existingHoldingSubtitle: {
    fontSize: 11,
    color: '#3B82F6',
    lineHeight: 16,
  },
  labelRowCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  labelCompact: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  dateHintMini: {
    fontSize: 10.5,
    color: '#059669',
    fontWeight: '600',
  },
  datePickerInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
  },
  datePickerInputField: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  datePickerIconButton: {
    padding: 4,
    marginLeft: 4,
  },
  dpuSectionCompact: {
    marginTop: 4,
  },
  smartDivCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 10,
    marginTop: 8,
    marginBottom: 6,
  },
  smartDivHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  smartDivHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  smartDivTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  smartDivBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  smartDivBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  smartDivBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    marginBottom: 6,
  },
  smartDivBannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  smartDivBannerLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
  },
  smartDivBannerValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#047857',
  },
  smartDivBannerSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  smartDivPassedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  smartDivPassedText: {
    fontSize: 10.5,
    color: '#64748B',
  },
  smartDivStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  smartDivStatCol: {
    flex: 1,
  },
  smartDivStatLabel: {
    fontSize: 9.5,
    color: '#64748B',
    marginBottom: 1,
  },
  smartDivStatValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  smartDivDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 8,
  },
  taxSectionCompact: {
    marginTop: 6,
    marginBottom: 4,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  taxHeaderRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  taxHeaderLeftCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  taxInputInlineWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  taxInputInline: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    width: 32,
    textAlign: 'center',
    paddingVertical: 0,
  },
  taxPercentSign: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  taxPillRowCompact: {
    flexDirection: 'row',
    gap: 6,
  },
  taxPillCompact: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
  },
  taxPillCompactActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  taxPillCompactText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
  },
  taxPillCompactTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  reviewModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  reviewCardContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  reviewHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  reviewTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  reviewBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reviewBadgeBuy: {
    backgroundColor: '#ECFDF5',
  },
  reviewBadgeDca: {
    backgroundColor: '#F5F3FF',
  },
  reviewBadgeCash: {
    backgroundColor: '#EFF6FF',
  },
  reviewBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  reviewBadgeTextBuy: {
    color: '#059669',
  },
  reviewBadgeTextDca: {
    color: '#7C3AED',
  },
  reviewBadgeTextCash: {
    color: '#2563EB',
  },
  reviewHeroBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reviewHeroLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  reviewHeroValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  reviewHeroSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    marginTop: 2,
  },
  reviewList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 18,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  reviewRowLabel: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '500',
  },
  reviewRowValBold: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  reviewRowValSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  reviewActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  reviewCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewCancelText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#475569',
  },
  reviewConfirmBtn: {
    flex: 1.3,
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  reviewConfirmBtnDisabled: {
    opacity: 0.6,
  },
  reviewConfirmText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});



export default AddAssetModal;
