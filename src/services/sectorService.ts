import AsyncStorage from '@react-native-async-storage/async-storage';
import { AssetType } from '../types/database';

export interface SectorDefinition {
  id: string;
  label: string;
  enLabel: string;
  color: string;
  icon: string;
}

// 1. Stock Sectors (10 GICS standard sectors + Other)
export const STOCK_SECTORS: SectorDefinition[] = [
  { id: 'Technology', label: 'เทคโนโลยีสารสนเทศ', enLabel: 'Technology', color: '#3B82F6', icon: 'hardware-chip-outline' },
  { id: 'Energy', label: 'พลังงาน & สาธารณูปโภค', enLabel: 'Energy & Utilities', color: '#F59E0B', icon: 'flash-outline' },
  { id: 'Financials', label: 'การเงิน & ธนาคาร', enLabel: 'Financials', color: '#10B981', icon: 'card-outline' },
  { id: 'Healthcare', label: 'การแพทย์ & สุขภาพ', enLabel: 'Healthcare', color: '#EC4899', icon: 'medkit-outline' },
  { id: 'ConsumerStaples', label: 'สินค้าจำเป็น & ค้าปลีก', enLabel: 'Consumer Staples', color: '#8B5CF6', icon: 'cart-outline' },
  { id: 'ConsumerDiscretionary', label: 'สินค้าฟุ่มเฟือย & บริการ', enLabel: 'Consumer Discretionary', color: '#F97316', icon: 'airplane-outline' },
  { id: 'Industrials', label: 'อุตสาหกรรม & คมนาคม', enLabel: 'Industrials', color: '#64748B', icon: 'construct-outline' },
  { id: 'Materials', label: 'วัสดุ & สินค้าโภคภัณฑ์', enLabel: 'Materials', color: '#EAB308', icon: 'cube-outline' },
  { id: 'RealEstate', label: 'อสังหาริมทรัพย์ & REITs', enLabel: 'Real Estate', color: '#14B8A6', icon: 'business-outline' },
  { id: 'Telecom', label: 'สื่อสาร & โทรคมนาคม', enLabel: 'Telecommunications', color: '#06B6D4', icon: 'cellular-outline' },
  { id: 'Other', label: 'กลุ่มอื่นๆ', enLabel: 'Other', color: '#94A3B8', icon: 'grid-outline' },
];

// 2. Fund Sectors (7 AIMC standard categories + Other, including Fixed Income)
export const FUND_SECTORS: SectorDefinition[] = [
  { id: 'FixedIncome', label: 'ตราสารหนี้ & พันธบัตร', enLabel: 'Fixed Income & Bonds', color: '#059669', icon: 'shield-checkmark-outline' },
  { id: 'Equity', label: 'ตราสารทุน (หุ้น)', enLabel: 'Equity Fund', color: '#2563EB', icon: 'trending-up-outline' },
  { id: 'Mixed', label: 'กองทุนรวมผสม', enLabel: 'Mixed & Balanced', color: '#7C3AED', icon: 'pie-chart-outline' },
  { id: 'Property', label: 'อสังหาฯ & โครงสร้างพื้นฐาน', enLabel: 'Property & Infrastructure', color: '#0D9488', icon: 'business-outline' },
  { id: 'Commodity', label: 'สินค้าโภคภัณฑ์ (ทอง/น้ำมัน)', enLabel: 'Commodities', color: '#D97706', icon: 'diamond-outline' },
  { id: 'Foreign', label: 'กองทุนต่างประเทศ (FIF)', enLabel: 'Foreign Investment (FIF)', color: '#4F46E5', icon: 'globe-outline' },
  { id: 'MoneyMarket', label: 'กองทุนตลาดเงิน', enLabel: 'Money Market', color: '#0284C7', icon: 'cash-outline' },
  { id: 'Other', label: 'กองทุนอื่นๆ', enLabel: 'Other Funds', color: '#94A3B8', icon: 'grid-outline' },
];

// 3. Cash Sectors (Pure Bank Accounts & Digital Savings only)
export const CASH_SECTORS: SectorDefinition[] = [
  { id: 'DigitalSavings', label: 'เงินฝากดิจิทัลดอกเบี้ยสูง', enLabel: 'Digital High-Yield Savings', color: '#059669', icon: 'phone-portrait-outline' },
  { id: 'FixedDeposit', label: 'เงินฝากประจำ', enLabel: 'Fixed Deposit', color: '#2563EB', icon: 'lock-closed-outline' },
  { id: 'Savings', label: 'เงินฝากออมทรัพย์ทั่วไป', enLabel: 'Regular Savings', color: '#6366F1', icon: 'wallet-outline' },
  { id: 'OtherBank', label: 'บัญชีเงินฝากอื่นๆ', enLabel: 'Other Bank Accounts', color: '#64748B', icon: 'business-outline' },
];

const ASSET_SECTOR_STORAGE_KEY = '@my_dividend_asset_sectors';

// Built-in Auto-classifier
export const detectSector = (symbol: string, assetType: AssetType): string => {
  const upper = symbol.trim().toUpperCase();

  if (assetType === 'CASH') {
    if (upper.includes('DIME') || upper.includes('KEPT') || upper.includes('ALPHA') || upper.includes('E-SAVING') || upper.includes('ESAVING') || upper.includes('DIGITAL')) {
      return 'DigitalSavings';
    }
    if (upper.includes('ประจำ') || upper.includes('FIXED') || upper.includes('TERM')) {
      return 'FixedDeposit';
    }
    return 'Savings';
  }

  if (assetType === 'FUNDS') {
    if (upper.includes('FIXED') || upper.includes('BOND') || upper.includes('DEBENTURE') || upper.includes('ตราสารหนี้') || upper.includes('พันธบัตร')) {
      return 'FixedIncome';
    }
    if (upper.includes('GOLD') || upper.includes('OIL') || upper.includes('COMMODITY') || upper.includes('ทอง')) {
      return 'Commodity';
    }
    if (upper.includes('PROP') || upper.includes('REIT') || upper.includes('INFRA') || upper.includes('อสังหา')) {
      return 'Property';
    }
    if (upper.includes('MIX') || upper.includes('BALANCED') || upper.includes('ผสม')) {
      return 'Mixed';
    }
    if (upper.includes('MONEY') || upper.includes('CASH') || upper.includes('ตลาดเงิน')) {
      return 'MoneyMarket';
    }
    if (upper.includes('US') || upper.includes('GLOBAL') || upper.includes('WORLD') || upper.includes('CHINA') || upper.includes('VIET') || upper.includes('EURO') || upper.includes('FIF')) {
      return 'Foreign';
    }
    return 'Equity';
  }

  // STOCKS auto detection
  // Energy & Utilities
  if (['PTT', 'PTTEP', 'GULF', 'BGRIM', 'TOP', 'EA', 'SPRC', 'IRPC', 'BANPU', 'RATCH', 'EGCO', 'XOM', 'CVX', 'COP', 'SHEL'].includes(upper)) {
    return 'Energy';
  }
  // Technology
  if (['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'META', 'TSLA', 'DELTA', 'HANA', 'KCE', 'CCET', 'AMD', 'INTC', 'ASML', 'AVGO', 'CRM', 'ORCL'].includes(upper)) {
    return 'Technology';
  }
  // Financials
  if (['SCB', 'KBANK', 'BBL', 'KTB', 'TTB', 'TISCO', 'KKP', 'JPM', 'BAC', 'WFC', 'C', 'GS', 'MS', 'V', 'MA', 'AXP'].includes(upper)) {
    return 'Financials';
  }
  // Healthcare
  if (['BDMS', 'BH', 'BCH', 'PR9', 'CHG', 'VIBHA', 'JNJ', 'PFE', 'UNH', 'LLY', 'ABBV', 'MRK', 'TMO'].includes(upper)) {
    return 'Healthcare';
  }
  // Consumer Staples
  if (['CPALL', 'CPF', 'CRC', 'CBG', 'OSP', 'TKN', 'BJC', 'MAKRO', 'CPAXT', 'KO', 'PEP', 'PG', 'WMT', 'COST', 'MDLZ'].includes(upper)) {
    return 'ConsumerStaples';
  }
  // Consumer Discretionary
  if (['AOT', 'MINT', 'CENTEL', 'ERW', 'COM7', 'HMPRO', 'DOHOME', 'GLOBAL', 'AMZN', 'NKE', 'MCD', 'SBUX', 'DIS', 'HD', 'LOW', 'BKNG', 'TJX'].includes(upper)) {
    return 'ConsumerDiscretionary';
  }
  // Industrials & Transport
  if (['BEM', 'BTS', 'SCGP', 'BA', 'AAV', 'III', 'WICE', 'CAT', 'GE', 'HON', 'UPS', 'FDX', 'LMT', 'RTX', 'UNP'].includes(upper)) {
    return 'Industrials';
  }
  // Materials & Chemicals
  if (['IVL', 'PTTGC', 'SCC', 'VNT', 'STA', 'NER', 'LIN', 'APD', 'SHW', 'ECL'].includes(upper)) {
    return 'Materials';
  }
  // Real Estate & REITs
  if (['CPN', 'SPALI', 'LH', 'AP', 'SIRI', 'ORI', 'QH', 'ANAN', 'O', 'PLD', 'AMT', 'CCI', 'EQIX'].includes(upper)) {
    return 'RealEstate';
  }
  // Telecommunications
  if (['ADVANC', 'TRUE', 'INTUCH', 'DIF', 'JASIF', 'VZ', 'T', 'TMUS'].includes(upper)) {
    return 'Telecom';
  }

  return 'Other';
};

export const getSectorsForType = (assetType: AssetType): SectorDefinition[] => {
  switch (assetType) {
    case 'CASH':
      return CASH_SECTORS;
    case 'FUNDS':
      return FUND_SECTORS;
    case 'STOCKS':
    default:
      return STOCK_SECTORS;
  }
};

export const getSectorDefinition = (sectorId: string, assetType: AssetType): SectorDefinition => {
  const list = getSectorsForType(assetType);
  const found = list.find((s) => s.id === sectorId);
  if (found) return found;
  return list[list.length - 1]; // Return Other
};

export const getAssetSector = async (
  assetId: string,
  symbol: string,
  assetType: AssetType
): Promise<string> => {
  try {
    const detected = detectSector(symbol, assetType);
    const raw = await AsyncStorage.getItem(ASSET_SECTOR_STORAGE_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      if (map[assetId]) {
        // Self-heal: If cached sector was mistakenly set to 'Other' but detectSector identifies a specific sector
        if (map[assetId] === 'Other' && detected !== 'Other') {
          map[assetId] = detected;
          await AsyncStorage.setItem(ASSET_SECTOR_STORAGE_KEY, JSON.stringify(map));
          return detected;
        }
        return map[assetId];
      }
      // If not cached yet, save detected
      if (detected !== 'Other') {
        map[assetId] = detected;
        await AsyncStorage.setItem(ASSET_SECTOR_STORAGE_KEY, JSON.stringify(map));
      }
      return detected;
    }
  } catch (err) {
    console.warn('Error reading asset sector cache:', err);
  }
  return detectSector(symbol, assetType);
};

export const setAssetSector = async (assetId: string, sectorId: string): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(ASSET_SECTOR_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[assetId] = sectorId;
    await AsyncStorage.setItem(ASSET_SECTOR_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Error saving asset sector cache:', err);
  }
};
