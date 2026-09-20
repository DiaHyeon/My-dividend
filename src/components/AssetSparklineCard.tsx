import React, { useState, useEffect, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  LayoutChangeEvent,
  Dimensions,
} from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { AssetSummary } from '../types/database';
import { isKnownUSSymbol } from '../services/currencyService';
import { fetch7DayPriceHistory, HistoryResult } from '../services/historyService';
import { usePrivacyMode } from '../services/privacyService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AssetSparklineCardProps {
  item: AssetSummary;
  exchangeRate?: number;
  onPressEdit: (item: AssetSummary) => void;
  refreshTrigger?: number;
}

/**
 * ฟังก์ชันสร้างชุดข้อมูลจำลองแบบคงที่ (Deterministic) สำหรับวาดกราฟเส้น Sparkline
 * ตามสัญลักษณ์สินทรัพย์และผลกำไร/ขาดทุน
 */
function generateSparklineData(item: AssetSummary): number[] {
  const plPercent = Number(item.unrealized_pl_percent) || 0;
  const currentPrice = Number(item.current_price) || 100;
  const costPrice = Number(item.weighted_average_cost) || currentPrice;
  const isCash = item.asset_type === 'CASH';

  // ถ้าเป็นเงินฝาก: แสดงกราฟสะสมดอกเบี้ยค่อยๆ ไต่ระดับขึ้นอย่างราบเรียบ
  if (isCash) {
    const points: number[] = [];
    const base = 100;
    for (let i = 0; i < 12; i++) {
      points.push(base + i * 1.8 + Math.sin(i * 0.5) * 0.3);
    }
    return points;
  }

  // สร้าง Seed จากตัวอักษรของ Symbol เพื่อให้กราฟของหุ้นตัวนั้นๆ นิ่ง ไม่เปลี่ยนไปมาทุก Render
  let seed = 0;
  for (let i = 0; i < item.symbol.length; i++) {
    seed += item.symbol.charCodeAt(i) * (i + 1);
  }

  const pseudoRandom = (step: number) => {
    const x = Math.sin(seed + step * 997) * 10000;
    return x - Math.floor(x);
  };

  const numPoints = 14;
  const points: number[] = [];
  const startVal = costPrice > 0 ? costPrice : currentPrice * 0.9;
  const endVal = currentPrice;

  for (let i = 0; i < numPoints; i++) {
    const progress = i / (numPoints - 1);
    // Interpolate จากต้นทุนไปสู่ราคาปัจจุบัน
    const trend = startVal + (endVal - startVal) * progress;
    // เพิ่มความผันผวนตามธรรมชาติของตลาด แต่ปลายทางเข้าสู่ราคาปัจจุบัน
    const dampening = Math.sin(progress * Math.PI); // ปลายสุดสองข้างความผันผวนต่ำ
    const wave = (pseudoRandom(i) - 0.48) * (Math.abs(endVal - startVal) * 0.4 + 2) * dampening;
    points.push(trend + wave);
  }

  // จุดสุดท้ายคือราคาปัจจุบันอย่างแน่นอน
  points[numPoints - 1] = endVal;
  return points;
}

/**
 * คำนวณเส้น SVG Path (Stroke) และ Area Path (Fill) แบบ Monotone Spline
 */
function buildSparklinePaths(
  data: number[],
  width: number,
  height: number
): { linePath: string; areaPath: string; lastPoint: { x: number; y: number } } {
  if (!data || data.length < 2 || width <= 0 || height <= 0) {
    return { linePath: '', areaPath: '', lastPoint: { x: 0, y: 0 } };
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const padTop = 6;
  const padBottom = 8;
  const plotHeight = Math.max(10, height - padTop - padBottom);

  const coords = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = padTop + (1 - (val - min) / range) * plotHeight;
    return { x, y };
  });

  // สร้างเส้น Cubic Bezier Spline ราบเรียบ
  let linePath = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;

  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const prev = coords[i - 1] || curr;
    const nextNext = coords[i + 2] || next;

    const cp1x = curr.x + (next.x - prev.x) / 5;
    const cp1y = curr.y + (next.y - prev.y) / 5;
    const cp2x = next.x - (nextNext.x - curr.x) / 5;
    const cp2y = next.y - (nextNext.y - curr.y) / 5;

    linePath += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
  }

  const lastCoord = coords[coords.length - 1];
  const firstCoord = coords[0];

  // ปิดพื้นที่ด้านล่างสำหรับการระบาย Gradient
  const areaPath = `${linePath} L ${lastCoord.x.toFixed(1)} ${height} L ${firstCoord.x.toFixed(1)} ${height} Z`;

  return { linePath, areaPath, lastPoint: lastCoord };
}

export const AssetSparklineCard: React.FC<AssetSparklineCardProps> = memo(({
  item,
  exchangeRate = 34.0,
  onPressEdit,
  refreshTrigger = 0,
}) => {
  const [cardWidth, setCardWidth] = useState<number>(SCREEN_WIDTH - 32);
  const { isPrivate: isPrivateMode } = usePrivacyMode();

  const onLayoutCard = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - cardWidth) > 2) {
      setCardWidth(w);
    }
  };

  const isUS = useMemo(
    () => item.asset_type === 'STOCKS' && isKnownUSSymbol(item.symbol),
    [item.symbol, item.asset_type]
  );
  const isCash = item.asset_type === 'CASH';
  const isFund = item.asset_type === 'FUNDS';

  const rate = exchangeRate > 0 ? exchangeRate : 34.0;
  const currentPriceTHB = Number(item.current_price) || 0;
  const costPriceTHB = Number(item.weighted_average_cost) || 0;
  const currentPriceUSD = isUS ? currentPriceTHB / rate : 0;
  const costPriceUSD = isUS ? costPriceTHB / rate : 0;

  const marketValue = Number(item.market_value) || 0;
  const unrealizedPL = Number(item.unrealized_pl) || 0;
  const plPercent = Number(item.unrealized_pl_percent) || 0;
  const isPositive = unrealizedPL >= 0;

  // ดึงข้อมูลราคาปิด 7 วันย้อนหลังจริง (ระบบ Once-a-Day Cache + On-Demand Refresh)
  const [history, setHistory] = useState<HistoryResult | null>(null);

  useEffect(() => {
    let isMounted = true;
    const force = refreshTrigger > 0;
    fetch7DayPriceHistory(item, force).then((res) => {
      if (isMounted) {
        setHistory(res);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [item.id, item.symbol, item.current_price, item.asset_type, refreshTrigger]);

  // ใช้ข้อมูลราคาจริง 7 วัน ถ้าโหลดเสร็จ หรือ fallback จากตัวเลขพอร์ต
  const sparklineData = useMemo(() => {
    if (history && Array.isArray(history.points) && history.points.length >= 2) {
      return history.points;
    }
    return generateSparklineData(item);
  }, [history, item]);

  // ผลตอบแทนในรอบ 7 วัน
  const change7d = history ? history.change7dPct : (isPositive ? 1.2 : -1.2);
  const is7dPositive = change7d >= 0;

  // กำหนดสีกราฟตามผลงาน 7 วันล่าสุด
  const color = isCash
    ? '#0D9488' // Teal
    : is7dPositive
    ? '#10B981' // Emerald Green
    : '#EF4444'; // Red

  const chartHeight = 54;
  const { linePath, areaPath, lastPoint } = useMemo(() => {
    return buildSparklinePaths(sparklineData, cardWidth, chartHeight);
  }, [sparklineData, cardWidth, chartHeight]);

  const gradientId = useMemo(() => {
    return `spark-grad-${item.id.replace(/[^a-zA-Z0-9]/g, '')}`;
  }, [item.id]);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      onPress={() => onPressEdit(item)}
      onLayout={onLayoutCard}
    >
      {/* 1. Header: Symbol, Badges, Edit Button */}
      <View style={styles.header}>
        <View style={styles.symbolRow}>
          <Text style={styles.symbolText} numberOfLines={1}>
            {item.symbol}
          </Text>

          {isUS && (
            <View style={styles.usBadge}>
              <Text style={styles.usBadgeText}>USD $</Text>
            </View>
          )}

          <View
            style={[
              styles.typeBadge,
              item.asset_type === 'STOCKS'
                ? styles.stocksBadge
                : isFund
                ? styles.fundsBadge
                : styles.cashBadge,
            ]}
          >
            <Text
              style={[
                styles.typeBadgeText,
                item.asset_type === 'STOCKS'
                  ? styles.stocksBadgeText
                  : isFund
                  ? styles.fundsBadgeText
                  : styles.cashBadgeText,
              ]}
            >
              {item.asset_type === 'STOCKS' ? 'หุ้น' : isFund ? 'กองทุน' : 'เงินฝาก'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => onPressEdit(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="pencil" size={11} color="#059669" />
          <Text style={styles.editBtnText}>แก้ไข</Text>
        </TouchableOpacity>
      </View>

      {/* 2. Hero Metric Row (ตรงตามสไตล์ที่ขอ: ซ้าย มูลค่ารวม / ขวา กำไรและ %) */}
      <View style={styles.heroRow}>
        <View style={styles.heroValueCol}>
          <Text style={styles.marketValueText}>
            {isPrivateMode
              ? '฿••••••'
              : `฿${marketValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </Text>
        </View>

        <View style={styles.heroChangeCol}>
          {!isCash ? (
            <View style={styles.plContainer}>
              <Text style={[styles.plAmountText, isPositive ? styles.textPositive : styles.textNegative]}>
                {isPrivateMode
                  ? '฿••••••'
                  : `${isPositive ? '+' : ''}฿${Math.abs(unrealizedPL).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </Text>
              <Text style={[styles.plPercentText, isPositive ? styles.textPositive : styles.textNegative]}>
                ({isPositive ? '+' : ''}{plPercent.toFixed(1)}%)
              </Text>
            </View>
          ) : (
            <View style={styles.plContainer}>
              <Text style={styles.cashInflowRateText}>
                {(Number(item.current_price) * 100).toFixed(2)}% p.a.
              </Text>
              <Text style={styles.cashTaxBadgeText}>
                (ภาษี {Number(item.tax_rate) > 0 ? `${(Number(item.tax_rate) * 100).toFixed(0)}%` : '0%'})
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* 3. Contextual Details Strip (ข้อมูลเสริมที่มีประโยชน์สำหรับนักลงทุน) */}
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>จำนวนที่ถือ</Text>
          <Text style={styles.metaValue} numberOfLines={1}>
            {isCash
              ? (isPrivateMode ? 'เงินต้น ฿••••••' : `เงินต้น ฿${marketValue.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`)
              : isFund
              ? `${Number(item.net_shares).toLocaleString('th-TH', { minimumFractionDigits: 4 })} หน่วย`
              : `${Number(item.net_shares).toLocaleString('th-TH')} หุ้น`}
          </Text>
        </View>

        <View style={styles.metaDivider} />

        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>
            {isFund ? 'NAV / ทุน' : isCash ? 'รอบดอกเบี้ย' : 'ราคาตลาด / ทุน'}
          </Text>
          <Text style={styles.metaValue} numberOfLines={1}>
            {isCash
              ? 'เงินฝากดิจิทัล/ประจำ'
              : `฿${currentPriceTHB.toFixed(2)} / ฿${costPriceTHB.toFixed(2)}`}
          </Text>
        </View>

        {isUS && (
          <>
            <View style={styles.metaDivider} />
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>ราคา USD</Text>
              <Text style={styles.metaValue} numberOfLines={1}>
                ${currentPriceUSD.toFixed(2)} (${costPriceUSD.toFixed(2)})
              </Text>
            </View>
          </>
        )}
      </View>

      {/* 3.5 7-Day Trend Header Tag */}
      <View style={styles.chartTagRow}>
        <View style={styles.chartTagBadge}>
          <Ionicons
            name={isCash ? 'cash-outline' : is7dPositive ? 'trending-up' : 'trending-down'}
            size={11}
            color={color}
          />
          <Text style={styles.chartTagText}>แนวโน้ม 7 วัน</Text>
          {history?.isReal && (
            <View style={[styles.realIndicatorDot, { backgroundColor: color }]} />
          )}
        </View>

        <Text
          style={[
            styles.chartChangeText,
            isCash ? styles.textCash : is7dPositive ? styles.textPositive : styles.textNegative,
          ]}
        >
          {isCash ? 'สะสมดอกเบี้ย' : `${is7dPositive ? '+' : ''}${change7d.toFixed(2)}%`}
        </Text>
      </View>

      {/* 4. Mini Sparkline Area Chart (แนบชิดขอบล่างของ Card อย่างสวยงาม) */}
      <View style={styles.chartContainer}>
        {cardWidth > 0 && linePath ? (
          <Svg width={cardWidth} height={chartHeight}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={color} stopOpacity="0.32" />
                <Stop offset="80%" stopColor={color} stopOpacity="0.04" />
                <Stop offset="100%" stopColor={color} stopOpacity="0.0" />
              </LinearGradient>
            </Defs>

            {/* เติมสีพื้นหลัง Area Gradient */}
            <Path d={areaPath} fill={`url(#${gradientId})`} />

            {/* เส้นแนวโน้มหลัก */}
            <Path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* จุดปลายสุด Glow Dot */}
            <Circle
              cx={lastPoint.x}
              cy={lastPoint.y}
              r={3}
              fill={color}
            />
            <Circle
              cx={lastPoint.x}
              cy={lastPoint.y}
              r={5.5}
              fill={color}
              fillOpacity={0.25}
            />
          </Svg>
        ) : (
          <View style={{ height: chartHeight }} />
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  symbolText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  usBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  usBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  stocksBadge: {
    backgroundColor: '#EFF6FF',
  },
  stocksBadgeText: {
    color: '#2563EB',
  },
  fundsBadge: {
    backgroundColor: '#F5F3FF',
  },
  fundsBadgeText: {
    color: '#7C3AED',
  },
  cashBadge: {
    backgroundColor: '#ECFDF5',
  },
  cashBadgeText: {
    color: '#059669',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  editBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
    minHeight: 36,
  },
  heroValueCol: {
    flexShrink: 1,
  },
  marketValueText: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  heroChangeCol: {
    alignItems: 'flex-end',
  },
  plContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  plAmountText: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '700',
  },
  plPercentText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  textPositive: {
    color: '#10B981',
  },
  textNegative: {
    color: '#EF4444',
  },
  cashInflowRateText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D9488',
  },
  cashTaxBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    marginHorizontal: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    marginTop: 2,
    marginBottom: 4,
  },
  metaItem: {
    flex: 1,
  },
  metaDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
  },
  metaLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 1,
  },
  metaValue: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  chartContainer: {
    width: '100%',
    height: 54,
    marginTop: 0,
    overflow: 'hidden',
  },
  chartTagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },
  chartTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chartTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.1,
  },
  realIndicatorDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginLeft: 2,
  },
  chartChangeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textCash: {
    color: '#0D9488',
  },
});
