// หน้าต่าง Bottom Sheet Modal สำหรับนำเข้าสินทรัพย์ผ่านไฟล์ CSV พร้อมระบบตรวจสอบข้อมูล ตัวอย่างแม่แบบ และแถบแสดงความคืบหน้า
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import {
  parseAndValidateCsv,
  importAssetRows,
  generateCsvTemplate,
  ParseResult,
  ImportSummary,
} from '../services/csvService';
import { portfolioEvents } from '../services/eventService';
import { colors, borderWidth, radii, fonts } from '../theme/tokens';
import { DashedDivider } from './ui/DashedDivider';

interface ImportCsvModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ImportCsvModal: React.FC<ImportCsvModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'FILE' | 'PASTE'>('FILE');
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string>('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    symbol: string;
  } | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [showTemplateGuide, setShowTemplateGuide] = useState<boolean>(false);

  const resetState = () => {
    setFileName(null);
    setCsvText('');
    setParseResult(null);
    setIsProcessingFile(false);
    setIsImporting(false);
    setImportProgress(null);
    setImportSummary(null);
    setShowTemplateGuide(false);
  };

  const handleClose = () => {
    if (isImporting) return;
    resetState();
    onClose();
  };

  const handleProcessText = (content: string) => {
    if (!content.trim()) {
      setParseResult(null);
      return;
    }
    const result = parseAndValidateCsv(content);
    setParseResult(result);
  };

  const handlePickDocument = async () => {
    try {
      setIsProcessingFile(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          'text/plain',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        setFileName(file.name);

        let content = '';
        if ((file as any).file && typeof (file as any).file.text === 'function') {
          content = await (file as any).file.text();
        } else if (file.uri) {
          const res = await fetch(file.uri);
          content = await res.text();
        }

        if (content) {
          setCsvText(content);
          handleProcessText(content);
        } else {
          Alert.alert('ไฟล์ว่างเปล่า', 'ไม่พบข้อมูลในไฟล์ที่เลือก');
        }
      }
    } catch (err: any) {
      Alert.alert('เลือกไฟล์ไม่สำเร็จ', err.message || 'ไม่สามารถเปิดไฟล์ได้');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleDownloadTemplate = () => {
    const templateContent = generateCsvTemplate();
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'my_dividend_template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      Share.share({
        title: 'My Dividend CSV Template',
        message: templateContent,
      });
    }
  };

  const handleExecuteImport = async () => {
    if (!parseResult || parseResult.validRows.length === 0) {
      Alert.alert('ไม่มีข้อมูลที่ถูกต้อง', 'กรุณาตรวจสอบรูปแบบไฟล์ CSV อีกครั้ง');
      return;
    }

    setIsImporting(true);
    setImportProgress({
      current: 0,
      total: parseResult.validRows.length,
      symbol: parseResult.validRows[0].symbol,
    });

    try {
      const summary = await importAssetRows(parseResult.validRows, (progress) => {
        setImportProgress(progress);
      });
      setImportSummary(summary);
      portfolioEvents.emitRefresh();
      onSuccess();
    } catch (err: any) {
      Alert.alert('นำเข้าล้มเหลว', err.message || 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Grab Handle */}
          <View style={styles.grabHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconContainer}>
                <Ionicons name="cloud-upload-outline" size={20} color="#1F7A52" />
              </View>
              <View>
                <Text style={styles.title}>นำเข้าสินทรัพย์ด้วย CSV</Text>
                <Text style={styles.subtitle}>
                  พอร์ต Streaming, Dime, InnovestX หรือไฟล์ CSV
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
              disabled={isImporting}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={18} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <DashedDivider color="#A9CDB9" marginVertical={0} />

          {/* Success Summary View */}
          {importSummary ? (
            <View style={styles.summaryContainer}>
              <View style={styles.successIconCircle}>
                <Ionicons name="checkmark-circle" size={54} color="#10B981" />
              </View>
              <Text style={styles.summaryTitle}>นำเข้าสินทรัพย์เรียบร้อยแล้ว!</Text>
              <Text style={styles.summarySubtitle}>
                บันทึกเข้าพอร์ตสำเร็จ {importSummary.successCount} รายการ
                {importSummary.failedCount > 0
                  ? ` (ไม่สำเร็จ ${importSummary.failedCount} รายการ)`
                  : ''}
              </Text>

              <View style={styles.summaryStatsRow}>
                <View style={styles.summaryStatBox}>
                  <Text style={styles.summaryStatValue}>
                    {importSummary.successCount}
                  </Text>
                  <Text style={styles.summaryStatLabel}>สำเร็จ</Text>
                </View>
                <View style={styles.summaryStatBox}>
                  <Text
                    style={[
                      styles.summaryStatValue,
                      importSummary.failedCount > 0 && { color: '#EF4444' },
                    ]}
                  >
                    {importSummary.failedCount}
                  </Text>
                  <Text style={styles.summaryStatLabel}>ข้อผิดพลาด</Text>
                </View>
              </View>

              {importSummary.errors.length > 0 && (
                <View style={styles.errorLogsBox}>
                  <Text style={styles.errorLogsTitle}>รายการที่ผิดพลาด:</Text>
                  {importSummary.errors.map((err, idx) => (
                    <Text key={idx} style={styles.errorLogText}>
                      • {err}
                    </Text>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleClose}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>เสร็จสิ้น (ไปดูที่พอร์ต)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollArea}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Tab Switcher: File vs Paste */}
              <View style={styles.tabSwitcher}>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'FILE' && styles.tabButtonActive]}
                  onPress={() => setActiveTab('FILE')}
                  activeOpacity={0.7}
                  disabled={isImporting}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={16}
                    color={activeTab === 'FILE' ? colors.accent : colors.muted}
                  />
                  <Text
                    style={[
                      styles.tabButtonText,
                      activeTab === 'FILE' && styles.tabButtonTextActive,
                    ]}
                  >
                    เลือกไฟล์ CSV
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'PASTE' && styles.tabButtonActive]}
                  onPress={() => setActiveTab('PASTE')}
                  activeOpacity={0.7}
                  disabled={isImporting}
                >
                  <Ionicons
                    name="clipboard-outline"
                    size={16}
                    color={activeTab === 'PASTE' ? colors.accent : colors.muted}
                  />
                  <Text
                    style={[
                      styles.tabButtonText,
                      activeTab === 'PASTE' && styles.tabButtonTextActive,
                    ]}
                  >
                    วางข้อความ CSV
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Action helpers row */}
              <View style={styles.actionHelpersRow}>
                <TouchableOpacity
                  style={styles.helperChip}
                  onPress={() => setShowTemplateGuide(!showTemplateGuide)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="information-circle-outline" size={15} color="#1F7A52" />
                  <Text style={styles.helperChipText}>รูปแบบหัวคอลัมน์</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.helperChip}
                  onPress={handleDownloadTemplate}
                  activeOpacity={0.7}
                >
                  <Ionicons name="download-outline" size={15} color="#1F7A52" />
                  <Text style={[styles.helperChipText, { color: '#1F7A52' }]}>
                    ดาวน์โหลด Template ตัวอย่าง
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Template Guide Collapsible */}
              {showTemplateGuide && (
                <View style={styles.templateGuideCard}>
                  <Text style={styles.guideTitle}>คอลัมน์ที่รองรับในไฟล์ CSV:</Text>
                  <Text style={styles.guideItem}>
                    • <Text style={styles.guideCode}>symbol</Text> (จำเป็น): ชื่อย่อหุ้น, กองทุน หรือบัญชีเงินฝาก
                  </Text>
                  <Text style={styles.guideItem}>
                    • <Text style={styles.guideCode}>shares</Text> (จำเป็น): จำนวนหุ้น หรือยอดเงินฝาก
                  </Text>
                  <Text style={styles.guideItem}>
                    • <Text style={styles.guideCode}>cost_price</Text>: ราคาต้นทุนต่อหน่วย (เงินฝากใส่ 1.0)
                  </Text>
                  <Text style={styles.guideItem}>
                    • <Text style={styles.guideCode}>asset_type</Text>: STOCKS, FUNDS หรือ CASH (ตรวจจับให้อัตโนมัติ)
                  </Text>
                  <Text style={styles.guideItem}>
                    • <Text style={styles.guideCode}>currency</Text>: THB หรือ USD (ค่าเริ่มต้น THB)
                  </Text>
                  <Text style={styles.guideItem}>
                    • <Text style={styles.guideCode}>transaction_date</Text>: วันที่ซื้อ (YYYY-MM-DD)
                  </Text>
                </View>
              )}

              {/* Tab 1: File Picker */}
              {activeTab === 'FILE' && (
                <View style={styles.filePickerArea}>
                  <TouchableOpacity
                    style={[
                      styles.dropzone,
                      fileName ? styles.dropzoneSelected : null,
                    ]}
                    onPress={handlePickDocument}
                    disabled={isProcessingFile || isImporting}
                    activeOpacity={0.8}
                  >
                    {isProcessingFile ? (
                      <View style={styles.dropzoneContent}>
                        <ActivityIndicator size="small" color="#4338CA" />
                        <Text style={styles.dropzoneTitle}>กำลังอ่านไฟล์...</Text>
                      </View>
                    ) : fileName ? (
                      <View style={styles.dropzoneContent}>
                        <View style={styles.fileIconBadge}>
                          <Ionicons name="checkmark-circle" size={28} color="#10B981" />
                        </View>
                        <Text style={styles.fileNameText} numberOfLines={1}>
                          {fileName}
                        </Text>
                        <Text style={styles.fileChangeHint}>แตะเพื่อเปลี่ยนไฟล์ใหม่</Text>
                      </View>
                    ) : (
                      <View style={styles.dropzoneContent}>
                        <View style={styles.uploadIconBadge}>
                          <Ionicons name="cloud-upload-outline" size={28} color="#1F7A52" />
                        </View>
                        <Text style={styles.dropzoneTitle}>แตะเพื่อเลือกไฟล์ CSV</Text>
                        <Text style={styles.dropzoneSub}>
                          รองรับ .csv, .txt หรือไฟล์ Export จากโบรกเกอร์
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Tab 2: Paste CSV */}
              {activeTab === 'PASTE' && (
                <View style={styles.pasteArea}>
                  <TextInput
                    style={styles.pasteInput}
                    placeholder="วางข้อความ CSV ที่นี่ เช่น:&#10;symbol,shares,cost_price,currency&#10;PTT,1000,32.50,THB&#10;AAPL,10,185.00,USD"
                    placeholderTextColor="#94A3B8"
                    value={csvText}
                    onChangeText={(txt) => {
                      setCsvText(txt);
                      handleProcessText(txt);
                    }}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {csvText.length > 0 && (
                    <TouchableOpacity
                      style={styles.clearTextBtn}
                      onPress={() => {
                        setCsvText('');
                        setParseResult(null);
                      }}
                    >
                      <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      <Text style={styles.clearTextBtnLabel}>ล้างข้อความ</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Live Preview & Validation Results */}
              {parseResult && (
                <View style={styles.previewSection}>
                  {/* Status Pills */}
                  <View style={styles.previewHeaderRow}>
                    <Text style={styles.previewSectionTitle}>
                      พรีวิวรายการที่จะนำเข้า ({parseResult.validRows.length} รายการ)
                    </Text>
                    <View style={styles.badgeSuccess}>
                      <Text style={styles.badgeSuccessText}>
                        ✓ พร้อมนำเข้า {parseResult.validRows.length}
                      </Text>
                    </View>
                  </View>

                  {/* Issues Alert */}
                  {parseResult.issues.length > 0 && (
                    <View style={styles.issuesCard}>
                      <View style={styles.issuesHeader}>
                        <Ionicons name="alert-circle" size={16} color="#D97706" />
                        <Text style={styles.issuesTitle}>
                          พบข้อความแจ้งเตือน {parseResult.issues.length} จุด:
                        </Text>
                      </View>
                      {parseResult.issues.slice(0, 3).map((issue, idx) => (
                        <Text key={idx} style={styles.issueText}>
                          • แถวที่ {issue.rowNumber}: {issue.message}
                        </Text>
                      ))}
                      {parseResult.issues.length > 3 && (
                        <Text style={styles.issueTextMore}>
                          + อีก {parseResult.issues.length - 3} ข้อความ...
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Preview Rows List */}
                  {parseResult.validRows.slice(0, 6).map((row, idx) => (
                    <View key={idx} style={styles.previewRowCard}>
                      <View style={styles.previewRowLeft}>
                        <View style={styles.symbolBadgeRow}>
                          <Text style={styles.previewSymbol}>{row.symbol}</Text>
                          <View
                            style={[
                              styles.assetTypeTag,
                              row.asset_type === 'STOCKS' && styles.tagStock,
                              row.asset_type === 'FUNDS' && styles.tagFund,
                              row.asset_type === 'CASH' && styles.tagCash,
                            ]}
                          >
                            <Text
                              style={[
                                styles.assetTypeText,
                                row.asset_type === 'STOCKS' && styles.textStock,
                                row.asset_type === 'FUNDS' && styles.textFund,
                                row.asset_type === 'CASH' && styles.textCash,
                              ]}
                            >
                              {row.asset_type === 'STOCKS'
                                ? 'หุ้น'
                                : row.asset_type === 'FUNDS'
                                ? 'กองทุน'
                                : 'เงินฝาก'}
                            </Text>
                          </View>
                          {row.currency === 'USD' && (
                            <View style={styles.tagUsd}>
                              <Text style={styles.textUsd}>USD</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.previewMeta}>
                          {row.transaction_date}
                        </Text>
                      </View>

                      <View style={styles.previewRowRight}>
                        <Text style={styles.previewShares}>
                          {row.shares.toLocaleString()} {row.asset_type === 'CASH' ? 'บาท' : 'หุ้น'}
                        </Text>
                        <Text style={styles.previewCost}>
                          ต้นทุน @ {row.currency === 'USD' ? '$' : '฿'}
                          {row.cost_price.toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  ))}

                  {parseResult.validRows.length > 6 && (
                    <Text style={styles.moreRowsNotice}>
                      ... และอีก {parseResult.validRows.length - 6} รายการด้านล่าง
                    </Text>
                  )}
                </View>
              )}

              {/* Progress Bar while importing */}
              {isImporting && importProgress && (
                <View style={styles.importingBox}>
                  <View style={styles.importingHeader}>
                    <ActivityIndicator size="small" color="#4338CA" />
                    <Text style={styles.importingTitle}>
                      กำลังนำเข้า {importProgress.symbol}... ({importProgress.current} /{' '}
                      {importProgress.total})
                    </Text>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.round(
                            (importProgress.current / importProgress.total) * 100
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.importingSub}>
                    ระบบกำลังดึงราคาตลาดปิดล่าสุดและคำนวณรอบปันผลให้อัตโนมัติ
                  </Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* Footer Actions */}
          {!importSummary && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleClose}
                disabled={isImporting}
              >
                <Text style={styles.cancelButtonText}>ยกเลิก</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  (!parseResult || parseResult.validRows.length === 0 || isImporting) &&
                    styles.confirmButtonDisabled,
                ]}
                onPress={handleExecuteImport}
                disabled={
                  !parseResult || parseResult.validRows.length === 0 || isImporting
                }
                activeOpacity={0.8}
              >
                {isImporting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    <Text style={styles.confirmButtonText}>
                      ยืนยันนำเข้า{' '}
                      {parseResult && parseResult.validRows.length > 0
                        ? `(${parseResult.validRows.length} ตัว)`
                        : ''}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderTopWidth: borderWidth,
    borderLeftWidth: borderWidth,
    borderRightWidth: borderWidth,
    borderColor: colors.ink,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  grabHandle: {
    width: 44,
    height: 5,
    borderRadius: radii.pill,
    backgroundColor: '#A9CDB9',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconContainer: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    backgroundColor: '#EAF3EE',
    borderWidth: borderWidth,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.thai,
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    maxHeight: 460,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: radii.pill,
    padding: 3,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: radii.pill,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: colors.ink,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.muted,
  },
  tabButtonTextActive: {
    color: colors.accent,
  },
  actionHelpersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  helperChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  helperChipText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  templateGuideCard: {
    backgroundColor: '#EAF3EE',
    borderRadius: 16,
    padding: 12,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    marginBottom: 12,
  },
  guideTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
    marginBottom: 6,
  },
  guideItem: {
    fontSize: 12,
    color: colors.ink,
    fontFamily: fonts.thai,
    marginBottom: 3,
    lineHeight: 18,
  },
  guideCode: {
    fontWeight: '700',
    color: '#1F7A52',
    fontFamily: fonts.mono,
  },
  filePickerArea: {
    marginBottom: 14,
  },
  dropzone: {
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderStyle: 'dashed',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  dropzoneSelected: {
    borderStyle: 'solid',
    backgroundColor: '#EAF3EE',
  },
  dropzoneContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadIconBadge: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: '#EAF3EE',
    borderWidth: borderWidth,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  fileIconBadge: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dropzoneTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  dropzoneSub: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.thai,
    marginTop: 4,
    textAlign: 'center',
  },
  fileNameText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
    maxWidth: 240,
  },
  fileChangeHint: {
    fontSize: 11,
    color: '#1F7A52',
    fontFamily: fonts.thaiBold,
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  pasteArea: {
    marginBottom: 14,
  },
  pasteInput: {
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 16,
    padding: 12,
    fontSize: 13,
    color: colors.ink,
    fontFamily: fonts.mono,
    minHeight: 110,
  },
  clearTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 6,
  },
  clearTextBtnLabel: {
    fontSize: 11,
    color: colors.lossOnLight,
    fontFamily: fonts.thaiBold,
    fontWeight: '700',
  },
  previewSection: {
    marginTop: 6,
    marginBottom: 14,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  previewSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  badgeSuccess: {
    backgroundColor: '#EAF3EE',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: borderWidth,
    borderColor: colors.ink,
  },
  badgeSuccessText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: '#1F7A52',
  },
  issuesCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: borderWidth,
    borderColor: colors.ink,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },
  issuesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  issuesTitle: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  issueText: {
    fontSize: 11.5,
    color: colors.ink,
    fontFamily: fonts.thai,
    marginTop: 2,
  },
  issueTextMore: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: fonts.thaiBold,
    fontWeight: '600',
    marginTop: 3,
  },
  previewRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: borderWidth,
    borderColor: colors.ink,
  },
  previewRowLeft: {
    flex: 1,
  },
  symbolBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewSymbol: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  assetTypeTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  tagStock: {
    backgroundColor: '#EAF3EE',
  },
  tagFund: {
    backgroundColor: '#E0F2FE',
  },
  tagCash: {
    backgroundColor: '#FEF3C7',
  },
  assetTypeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
  },
  textStock: {
    color: '#1F7A52',
  },
  textFund: {
    color: '#0284C7',
  },
  textCash: {
    color: colors.ink,
  },
  tagUsd: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  textUsd: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  previewMeta: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: fonts.thai,
    marginTop: 2,
  },
  previewRowRight: {
    alignItems: 'flex-end',
  },
  previewShares: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: colors.ink,
  },
  previewCost: {
    fontSize: 11.5,
    color: colors.muted,
    fontFamily: fonts.mono,
    marginTop: 2,
  },
  moreRowsNotice: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 6,
  },
  importingBox: {
    backgroundColor: '#EAF3EE',
    borderRadius: 16,
    padding: 14,
    marginTop: 8,
    borderWidth: borderWidth,
    borderColor: colors.ink,
  },
  importingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  importingTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#A9CDB9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.ink,
    borderRadius: 4,
  },
  importingSub: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.mono,
    marginTop: 6,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  confirmButton: {
    flex: 2,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    shadowColor: colors.shadow,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.accent,
  },
  summaryContainer: {
    padding: 24,
    alignItems: 'center',
  },
  successIconCircle: {
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.ink,
  },
  summarySubtitle: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.thai,
    marginTop: 4,
    textAlign: 'center',
  },
  summaryStatsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 18,
    marginBottom: 16,
  },
  summaryStatBox: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    minWidth: 100,
    shadowColor: colors.shadow,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  summaryStatValue: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: fonts.mono,
    color: '#1F7A52',
  },
  summaryStatLabel: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: fonts.thaiBold,
    marginTop: 2,
  },
  errorLogsBox: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    padding: 10,
    marginBottom: 16,
    borderWidth: borderWidth,
    borderColor: colors.lossOnLight,
  },
  errorLogsTitle: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.lossOnLight,
    marginBottom: 4,
  },
  errorLogText: {
    fontSize: 11,
    color: colors.lossOnLight,
    fontFamily: fonts.mono,
    marginTop: 2,
  },
  primaryButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    borderWidth: borderWidth,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.thaiBold,
    color: colors.accent,
  },
});
