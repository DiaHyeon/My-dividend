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
import { AssetType } from '../types/database';
import { scheduleXdReminder } from '../services/notificationService';
import { searchStocks, fetchStockPrice, fetchExchangeRate, fetchDividendAnalysis, StockSuggestion, DividendAnalysis } from '../services/stockService';
import { getSectorsForType, detectSector, setAssetSector } from '../services/sectorService';
import { evaluateCashTax, calculateAnnualGrossInterest } from '../services/taxService';
import { setAssetCurrency } from '../services/currencyService';
import { CashAssetForm } from './CashAssetForm';

interface AddAssetModalProps {
  visible?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
  showFAB?: boolean;
}

const ASSET_TYPES: { label: string; value: AssetType; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'หุ้น (STOCKS)', value: 'STOCKS', icon: 'trending-up' },
  { label: 'กองทุน (FUNDS)', value: 'FUNDS', icon: 'pie-chart' },
  { label: 'เงินฝาก (CASH)', value: 'CASH', icon: 'wallet' },
];

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
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
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
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalVisible(false);
    }
  };

  const resetForm = () => {
    setSymbol('');
    setShares('');
    setCostPrice('');
    setCurrentPrice('');
    setExpectedDpu('');
    setAssetType('STOCKS');
    setSuggestions([]);
    setShowSuggestions(false);
    setPriceNote('');
    setCurrency('THB');
    setDividendAnalysis(null);
    setIsFetchingDividends(false);
    setTaxRatePercent('10');
    setSelectedSector('Technology');
    setDepositAmount('');
    setInterestRate('1.5');
    setInterestFrequency('MONTHLY');
    setIsAutoCashTax(true);
    setDepositDate(new Date().toISOString().split('T')[0]);
  };

  const handleAssetTypeSelect = (newType: AssetType) => {
    setAssetType(newType);
    if (newType === 'CASH') {
      setCurrency('THB');
      setSelectedSector('DigitalSavings');
      setIsAutoCashTax(true);
      const dep = parseFloat(depositAmount) || 0;
      const rate = parseFloat(interestRate) || 0;
      const evalResult = evaluateCashTax(dep, rate, 'DigitalSavings');
      setTaxRatePercent(evalResult.suggestedTaxRatePercent.toString());
    } else if (newType === 'FUNDS') {
      setTaxRatePercent('10');
      setSelectedSector('Equity');
    } else {
      setTaxRatePercent('10');
      setSelectedSector(detectSector(symbol, 'STOCKS'));
    }
  };

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

  const handleSymbolChange = async (text: string) => {
    setSymbol(text);
    if (assetType === 'STOCKS' && text.trim().length >= 1) {
      const results = await searchStocks(text);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSelectedSector(detectSector(text, 'STOCKS'));
    } else if (assetType === 'CASH') {
      setSelectedSector(detectSector(text, 'CASH'));
    } else if (assetType === 'FUNDS') {
      setSelectedSector(detectSector(text, 'FUNDS'));
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = async (item: StockSuggestion) => {
    setSymbol(item.symbol);
    setShowSuggestions(false);
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

  const ensureAuthenticated = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { error } = await supabase.auth.signInWithPassword({
        email: 'demo@mydividend.app',
        password: 'Password123!',
      });
      if (error) {
        console.warn('Auto sign-in fallback notice:', error.message);
      }
    }
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

        // Insert into assets table
        const { data: asset, error: assetError } = await supabase
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

        if (assetError || !asset) throw new Error(assetError?.message || 'ไม่สามารถบันทึกเงินฝากได้');

        // Insert into transactions table
        const todayDate = (depositDate && depositDate.trim()) || new Date().toISOString().split('T')[0];
        const { error: txError } = await supabase.from('transactions').insert({
          asset_id: asset.id,
          type: 'BUY',
          shares: Number(parsedDeposit.toFixed(4)),
          price_per_share: 1.0000,
          transaction_date: todayDate,
        });

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

        Alert.alert('สำเร็จ', `เพิ่มบัญชีเงินฝาก ${trimmedAccount} จำนวน ฿${parsedDeposit.toLocaleString()} เรียบร้อยแล้ว`);
        resetForm();
        handleClose();
        onSuccess?.();
      } catch (err: any) {
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

      // 1. Insert new record to assets table (prices in THB for unified portfolio)
      const { data: asset, error: assetError } = await supabase
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

      if (assetError || !asset) {
        throw new Error(assetError?.message || 'ไม่สามารถเพิ่มสินทรัพย์ได้');
      }

      // 2. Insert initial BUY record to transactions table
      const todayDate = new Date().toISOString().split('T')[0];
      const { error: txError } = await supabase.from('transactions').insert({
        asset_id: asset.id,
        type: 'BUY',
        shares: Number(parsedShares.toFixed(4)),
        price_per_share: Number(convertedCostPrice.toFixed(4)),
        transaction_date: todayDate,
      });

      if (txError) {
        throw new Error(txError.message || 'ไม่สามารถบันทึกรายการซื้อเริ่มต้นได้');
      }

      // 3. Insert projected DPU to dividend_schedules if STOCKS and DPU > 0
      if (assetType === 'STOCKS' && parsedDpu > 0) {
        const targetXdDate = xdDate || todayDate;

        if (dividendAnalysis?.hasDividends && dividendAnalysis.projectedNextXdDates.length > 1) {
          // Multi-cycle projected schedule (quarterly / semi-annual)
          const schedules = dividendAnalysis.projectedNextXdDates.map((dateStr) => ({
            asset_id: asset.id,
            dpu: Number(convertedDpu.toFixed(4)),
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
            dpu: Number(convertedDpu.toFixed(4)),
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

      const alertMsg = currency === 'USD'
        ? `เพิ่มสินทรัพย์ ${trimmedSymbol} เข้าสู่พอร์ตแล้ว (ซื้อ $${parsedCostPrice.toFixed(2)} แปลงเป็น ฿${convertedCostPrice.toFixed(2)} ที่อัตรา ฿${rate.toFixed(2)}/USD)`
        : `เพิ่มสินทรัพย์ ${trimmedSymbol} เข้าสู่พอร์ตเรียบร้อยแล้ว`;

      Alert.alert('สำเร็จ', alertMsg);
      resetForm();
      handleClose();
      onSuccess?.();
    } catch (err: any) {
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
              {/* Asset Type Selector */}
              <Text style={styles.label}>ประเภทสินทรัพย์</Text>
              <View style={styles.typeSelectorContainer}>
                {ASSET_TYPES.map((item) => {
                  const isSelected = assetType === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      style={[styles.typeButton, isSelected && styles.typeButtonSelected]}
                      onPress={() => handleAssetTypeSelect(item.value)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={item.icon}
                        size={16}
                        color={isSelected ? '#FFFFFF' : '#64748B'}
                        style={styles.typeIcon}
                      />
                      <Text style={[styles.typeButtonText, isSelected && styles.typeButtonTextSelected]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* IF CASH: SHOW CASH & INTEREST FORM */}
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
                    <Text style={styles.label}>ชื่อย่อ / รหัสสินทรัพย์ (Symbol) *</Text>
                    <TextInput
                      style={styles.input}
                      value={symbol}
                      onChangeText={handleSymbolChange}
                      onFocus={() => {
                        if (assetType === 'STOCKS' && symbol.trim().length >= 1) {
                          searchStocks(symbol).then((res) => {
                            setSuggestions(res);
                            setShowSuggestions(res.length > 0);
                          });
                        }
                      }}
                      placeholder="เช่น PTT, MCD, AAPL หรือชื่อสินทรัพย์นอกตลาด"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />

                    {/* Suggestions Dropdown */}
                    {showSuggestions && suggestions.length > 0 && (
                      <View style={styles.suggestionsContainer}>
                        <View style={styles.suggestionsHeader}>
                          <Text style={styles.suggestionsHeaderText}>แนะนำหุ้นตลาด US & SET</Text>
                          <TouchableOpacity onPress={() => setShowSuggestions(false)}>
                            <Ionicons name="close-circle" size={16} color="#94A3B8" />
                          </TouchableOpacity>
                        </View>
                        {suggestions.map((item) => (
                          <TouchableOpacity
                            key={item.rawSymbol}
                            style={styles.suggestionItem}
                            onPress={() => handleSelectSuggestion(item)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.suggestionLeft}>
                              <View style={styles.suggestionTitleRow}>
                                <Text style={styles.suggestionSymbol}>{item.symbol}</Text>
                                <Text style={styles.suggestionExchange}>• {item.exchange}</Text>
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
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Segment Selector for Stocks/Funds */}
                  <Text style={styles.label}>กลุ่มอุตสาหกรรม / ประเภท (Segment)</Text>
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

                  {/* Shares and Cost Price (Row) */}
                  <View style={styles.row}>
                    <View style={styles.flexHalf}>
                      <Text style={styles.label}>จำนวนหุ้น / หน่วย *</Text>
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
                      <Text style={styles.label}>
                        ราคาต้นทุน ({currency === 'USD' ? 'ดอลลาร์ $' : 'บาท ฿'}) *
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

                  {/* Current Price */}
                  <View style={styles.currentPriceHeaderRow}>
                    <Text style={styles.label}>
                      ราคาตลาดปัจจุบัน ({currency === 'USD' ? 'ดอลลาร์ $' : 'บาท ฿'})
                    </Text>
                    {isFetchingPrice && (
                      <View style={styles.fetchingPriceIndicator}>
                        <ActivityIndicator size="small" color="#059669" />
                        <Text style={styles.fetchingPriceText}>ดึงราคาล่าสุด...</Text>
                      </View>
                    )}
                  </View>
                  <TextInput
                    style={styles.input}
                    value={currentPrice}
                    onChangeText={setCurrentPrice}
                    placeholder="หากเว้นว่างจะใช้ราคาต้นทุน"
                    placeholderTextColor="#94A3B8"
                    keyboardType="decimal-pad"
                  />
                  {priceNote ? (
                    <View style={styles.priceNoteRow}>
                      <Ionicons name="information-circle-outline" size={14} color="#059669" />
                      <Text style={styles.priceNoteText}>{priceNote}</Text>
                    </View>
                  ) : null}

                  {/* Conditional DPU field - ONLY for STOCKS */}
                  {assetType === 'STOCKS' && (
                    <View style={styles.dpuSection}>
                      <View style={styles.dpuHeader}>
                        <View style={styles.dpuHeaderLeft}>
                          <Ionicons name="gift-outline" size={18} color="#059669" />
                          <Text style={styles.dpuSectionTitle}>ข้อมูลเงินปันผลคาดการณ์ (Dividend)</Text>
                        </View>
                        {isFetchingDividends && (
                          <View style={styles.fetchingPriceIndicator}>
                            <ActivityIndicator size="small" color="#059669" />
                            <Text style={styles.fetchingPriceText}>วิเคราะห์ปันผล...</Text>
                          </View>
                        )}
                      </View>

                      {/* Dividend Analysis Highlight Badge */}
                      {dividendAnalysis && dividendAnalysis.hasDividends && (
                        <View style={styles.divHighlightCard}>
                          <View style={styles.divHighlightTop}>
                            <Ionicons name="analytics-outline" size={16} color="#047857" />
                            <Text style={styles.divHighlightTitle}>วิเคราะห์ปันผลอัตโนมัติ</Text>
                            <View style={styles.divFreqBadge}>
                              <Text style={styles.divFreqText}>{dividendAnalysis.frequencyLabel}</Text>
                            </View>
                          </View>

                          <View style={styles.divStatsGrid}>
                            <View style={styles.divStatBox}>
                              <Text style={styles.divStatLabel}>รอบล่าสุดต่อหุ้น</Text>
                              <Text style={styles.divStatValue}>
                                {currency === 'USD' ? '$' : '฿'}{dividendAnalysis.latestDpu.toFixed(4)}
                              </Text>
                            </View>
                            <View style={styles.divStatDivider} />
                            <View style={styles.divStatBox}>
                              <Text style={styles.divStatLabel}>คาดการณ์ทั้งปี (Annual)</Text>
                              <Text style={styles.divStatValueHighlight}>
                                {currency === 'USD' ? '$' : '฿'}{dividendAnalysis.annualProjectedDpu.toFixed(4)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      )}

                      <Text style={styles.label}>เงินปันผลคาดการณ์ต่อหุ้น (DPU ฿)</Text>
                      <TextInput
                        style={styles.input}
                        value={expectedDpu}
                        onChangeText={setExpectedDpu}
                        placeholder="0.0000"
                        placeholderTextColor="#94A3B8"
                        keyboardType="decimal-pad"
                      />

                      <Text style={styles.label}>วันขึ้นเครื่องหมาย XD คาดการณ์ (YYYY-MM-DD)</Text>
                      <TextInput
                        style={styles.input}
                        value={xdDate}
                        onChangeText={setXdDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#94A3B8"
                      />

                      {/* Withholding Tax Selector */}
                      <View style={styles.taxSection}>
                        <View style={styles.taxHeaderRow}>
                          <View style={styles.taxHeaderLeft}>
                            <Ionicons name="receipt-outline" size={16} color="#0F172A" />
                            <Text style={styles.labelNoMargin}>
                              ภาษีหัก ณ ที่จ่าย (Withholding Tax)
                            </Text>
                          </View>
                          <View style={styles.taxCurrentBadge}>
                            <Text style={styles.taxCurrentBadgeText}>
                              {parseFloat(taxRatePercent) || 0}%
                            </Text>
                          </View>
                        </View>

                        {/* Quick Tax Selector Pills */}
                        <View style={styles.taxPillRow}>
                          {[
                            { label: '0% ยกเว้น', value: '0' },
                            { label: '10% หุ้นไทย', value: '10' },
                            { label: '15% US (W-8BEN)', value: '15' },
                            { label: '30% ทั่วไป', value: '30' },
                          ].map((pill) => (
                            <TouchableOpacity
                              key={pill.value}
                              style={[
                                styles.taxPill,
                                taxRatePercent === pill.value && styles.taxPillActive,
                              ]}
                              onPress={() => setTaxRatePercent(pill.value)}
                            >
                              <Text
                                style={[
                                  styles.taxPillText,
                                  taxRatePercent === pill.value && styles.taxPillTextActive,
                                ]}
                              >
                                {pill.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <TextInput
                          style={styles.input}
                          value={taxRatePercent}
                          onChangeText={setTaxRatePercent}
                          placeholder="เช่น 10 หรือ 15"
                          placeholderTextColor="#94A3B8"
                          keyboardType="decimal-pad"
                        />
                        <Text style={styles.taxHintText}>
                          🇹🇭 หุ้นไทยมาตรฐาน 10% • 🇺🇸 หุ้นสหรัฐฯ มาตรฐาน 15% (อนุสัญญา W-8BEN)
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
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
    </KeyboardAvoidingView >
      </Modal >
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
  typeSelectorContainer: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 6,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  typeButtonSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  typeIcon: {
    marginRight: 8,
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  typeButtonTextSelected: {
    color: '#FFFFFF',
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
  suggestionExchange: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
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
});



export default AddAssetModal;
