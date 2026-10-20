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
import { resolveIsUSStock, getAssetAverageCostUSD } from '../services/currencyService';
import { fetch7DayPriceHistory, HistoryResult } from '../services/historyService';
import { usePrivacyMode } from '../services/privacyService';
import { colors, fonts, radii } from '../theme/tokens';
import { CalmText } from './ui/CalmText';
import { DashedDivider } from './ui/DashedDivider';
import { HardShadow } from './ui/HardShadow';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AssetSparklineCardProps {
  item: AssetSummary;
  exchangeRate?: number;
  onPressEdit: (item: AssetSummary) => void;
  refreshTrigger?: number;
  cumulativeDividends?: number;
  totalReturn?: number;
  totalReturnPercent?: number;
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

  // สำหรับหุ้นและกองทุน: เมื่อยังไม่มีข้อมูลประวัติราคา 7 วันจริง ให้แสดงเส้นตรงระดับราคาปัจจุบันอย่างซื่อตรง ไม่สร้างคลื่นสุ่มหลอกตา
  const numPoints = 8;
  const points: number[] = [];
  for (let i = 0; i < numPoints; i++) {
    points.push(currentPrice);
  }
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
  cumulativeDividends,
  totalReturn,
  totalReturnPercent,
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
    () => resolveIsUSStock(item),
    [item.currency, item.symbol, item.asset_type, item.id]
  );
  const isCash = item.asset_type === 'CASH';
  const isFund = item.asset_type === 'FUNDS';

  const [exactUsdCost, setExactUsdCost] = useState<number | null>(null);

  useEffect(() => {
    if (!isUS || !item.id) return;
    let isMounted = true;
    getAssetAverageCostUSD(item.id).then((val) => {
      if (isMounted && val !== null && val > 0) {
        setExactUsdCost(val);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [isUS, item.id]);

  const rate = exchangeRate > 0 ? exchangeRate : 34.0;
  const currentPriceTHB = Number(item.current_price) || 0;
  const costPriceTHB = Number(item.weighted_average_cost) || 0;
  const currentPriceUSD = isUS ? currentPriceTHB / rate : 0;
  const costPriceUSD = isUS ? (exactUsdCost ?? (costPriceTHB / rate)) : 0;

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

  // ผลตอบแทนในรอบ 7 วัน (แสดงค่าจริงเท่านั้น หากไม่มีข้อมูลให้เป็น null ไม่สร้างตัวเลขสมมุติ)
  const change7d = history ? history.change7dPct : null;
  const is7dPositive = change7d !== null ? change7d >= 0 : isPositive;

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
    <HardShadow size="md" radius={radii.card} style={styles.cardWrapper}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => onPressEdit(item)}
        onLayout={onLayoutCard}
      >
        {/* 1. Header: Symbol, Badges, Edit Button */}
        <View style={styles.header}>
          <View style={styles.symbolRow}>
            <CalmText variant="display" size={24} color={colors.ink} numberOfLines={1}>
              {item.symbol}
            </CalmText>

            {isUS && (
              <View style={styles.usBadge}>
                <CalmText variant="mono" size={10} color={colors.ink}>
                  USD $
                </CalmText>
              </View>
            )}

            <View style={styles.typeBadge}>
              <CalmText variant="mono" size={10} color={colors.muted}>
                {item.asset_type === 'STOCKS' ? 'หุ้น' : isFund ? 'กองทุน' : 'เงินฝาก'}
              </CalmText>
            </View>
          </View>

          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => onPressEdit(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`แก้ไข ${item.symbol}`}
          >
            <CalmText variant="mono" size={11} color={colors.ink}>
              แก้ไข
            </CalmText>
          </TouchableOpacity>
        </View>

        {/* 2. Hero Metric Row (ซ้าย: มูลค่ารวม / ขวา: กำไรและ %) */}
        <View style={styles.heroRow}>
          <View style={styles.heroValueCol}>
            <CalmText variant="display" size={28} color={colors.ink}>
              {isPrivateMode
                ? '฿••••••'
                : `฿${marketValue.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </CalmText>
          </View>

          <View style={styles.heroChangeCol}>
            {!isCash ? (
              <CalmText
                variant="mono"
                size={12}
                color={isPositive ? colors.gainOnLight : colors.lossOnLight}
              >
                {isPrivateMode
                  ? (isPositive ? '+••%' : '-••%')
                  : `${isPositive ? '+' : ''}฿${Math.abs(unrealizedPL).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${isPositive ? '+' : ''}${plPercent.toFixed(1)}%)`}
              </CalmText>
            ) : (
              <View style={styles.cashInflowRow}>
                <CalmText variant="mono" size={12} color={colors.gainOnLight}>
                  {(Number(item.current_price) * 100).toFixed(2)}% p.a.
                </CalmText>
                <CalmText variant="mono" size={10} color={colors.muted}>
                  {' '}(ภาษี {Number(item.tax_rate) > 0 ? `${(Number(item.tax_rate) * 100).toFixed(0)}%` : '0%'})
                </CalmText>
              </View>
            )}
          </View>
        </View>

        {/* Divider */}
        <DashedDivider color={colors.shadow} marginVertical={12} />

        {/* 3. Contextual Details Strip: 3-column grid */}
        <View style={styles.metaGrid}>
          <View style={styles.metaCol}>
            <CalmText variant="monoRegular" size={10} color={colors.muted}>
              จำนวนที่ถือ
            </CalmText>
            <CalmText variant="mono" size={13} color={colors.ink} numberOfLines={1}>
              {isCash
                ? (isPrivateMode ? 'เงินต้น ฿••••••' : `เงินต้น ฿${marketValue.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`)
                : isFund
                ? (isPrivateMode ? '•••• หน่วย' : `${Number(item.net_shares).toLocaleString('th-TH', { minimumFractionDigits: 4 })} หน่วย`)
                : (isPrivateMode ? '•••• หุ้น' : `${Number(item.net_shares).toLocaleString('th-TH')} หุ้น`)}
            </CalmText>
          </View>

          <View style={styles.metaCol}>
            <CalmText variant="monoRegular" size={10} color={colors.muted}>
              {isFund ? 'NAV ทุน' : isCash ? 'รอบดอกเบี้ย' : 'ต้นทุน'}
            </CalmText>
            <CalmText variant="mono" size={13} color={colors.ink} numberOfLines={1}>
              {isCash
                ? 'ดิจิทัล/ประจำ'
                : isUS
                ? `$${costPriceUSD.toFixed(2)}`
                : isFund
                ? `฿${costPriceTHB.toFixed(4)}`
                : `฿${costPriceTHB.toFixed(2)}`}
            </CalmText>
          </View>

          {!isCash && (
            <View style={styles.metaCol}>
              <CalmText variant="monoRegular" size={10} color={colors.muted}>
                {isFund ? 'NAV ตลาด' : 'ราคาตลาด'}
              </CalmText>
              <CalmText variant="mono" size={13} color={colors.ink} numberOfLines={1}>
                {isUS
                  ? `$${currentPriceUSD.toFixed(2)}`
                  : isFund
                  ? `฿${currentPriceTHB.toFixed(4)}`
                  : `฿${currentPriceTHB.toFixed(2)}`}
              </CalmText>
            </View>
          )}
        </View>

        {/* 3.4 Minimal Total Return Strip */}
        {cumulativeDividends !== undefined && cumulativeDividends > 0 && (
          <View style={styles.totalReturnStrip}>
            <View style={styles.totalReturnLeft}>
              <Ionicons name="sparkles" size={11} color={colors.accent} />
              <CalmText variant="mono" size={11} color={colors.ink}>
                ปันผลสะสม {isPrivateMode ? '฿••••' : `฿${cumulativeDividends.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`}
              </CalmText>
            </View>
            <CalmText
              variant="mono"
              size={11}
              color={(totalReturnPercent ?? 0) >= 0 ? colors.gainOnLight : colors.lossOnLight}
            >
              Total Return: {(totalReturnPercent ?? 0) >= 0 ? '+' : ''}{(totalReturnPercent ?? 0).toFixed(1)}%
            </CalmText>
          </View>
        )}

        {/* 3.5 7-Day Trend Header */}
        <DashedDivider color={colors.shadow} marginVertical={10} />
        <View style={styles.chartTagRow}>
          <View style={styles.chartTagBadge}>
            <CalmText variant="mono" size={11} color={colors.muted}>
              7 DAYS {isCash ? '(ดอกเบี้ย)' : 'ราคาย้อนหลัง'}
            </CalmText>
            {history?.isReal && (
              <View style={[styles.realIndicatorDot, { backgroundColor: colors.accent }]} />
            )}
          </View>

          <CalmText
            variant="mono"
            size={11}
            color={isCash ? colors.gainOnLight : change7d === null ? colors.muted : is7dPositive ? colors.gainOnLight : colors.lossOnLight}
          >
            {isCash ? 'สะสมดอกเบี้ย' : change7d !== null ? `${is7dPositive ? '+' : ''}${change7d.toFixed(2)}%` : '--'}
          </CalmText>
        </View>

        {/* 4. Mini Sparkline Area Chart */}
        <View style={styles.chartContainer}>
          {cardWidth > 0 && linePath ? (
            <Svg width={cardWidth} height={chartHeight}>
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={is7dPositive ? colors.accent : colors.lossOnDark} stopOpacity="0.45" />
                  <Stop offset="100%" stopColor={is7dPositive ? colors.accent : colors.lossOnDark} stopOpacity="0.05" />
                </LinearGradient>
              </Defs>

              <Path d={areaPath} fill={`url(#${gradientId})`} />

              <Path
                d={linePath}
                fill="none"
                stroke={colors.ink}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <Circle cx={lastPoint.x} cy={lastPoint.y} r={3.5} fill={colors.ink} />
            </Svg>
          ) : (
            <View style={{ height: chartHeight }} />
          )}
        </View>
      </TouchableOpacity>
    </HardShadow>
  );
});

const styles = StyleSheet.create({
  cardWrapper: {
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: colors.ink,
    overflow: 'hidden',
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  symbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  usBadge: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeBadge: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  editBtn: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.surface,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 16,
    marginTop: 6,
  },
  heroValueCol: {
    flexShrink: 1,
  },
  heroChangeCol: {
    alignItems: 'flex-end',
  },
  cashInflowRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  metaGrid: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  metaCol: {
    flex: 1,
    gap: 2,
  },
  totalReturnStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EAF3EE',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginHorizontal: 16,
    marginTop: 10,
  },
  totalReturnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chartTagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  chartTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  realIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 2,
  },
  chartContainer: {
    width: '100%',
    height: 54,
    marginTop: 2,
    overflow: 'hidden',
  },
});
