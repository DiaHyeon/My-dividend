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
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconContainer}>
                <Ionicons name="cloud-upload" size={22} color="#4338CA" />
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
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

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
                    color={activeTab === 'FILE' ? '#4338CA' : '#64748B'}
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
                    color={activeTab === 'PASTE' ? '#4338CA' : '#64748B'}
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
                  <Ionicons name="information-circle-outline" size={15} color="#4338CA" />
                  <Text style={styles.helperChipText}>รูปแบบหัวคอลัมน์</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.helperChip}
                  onPress={handleDownloadTemplate}
                  activeOpacity={0.7}
                >
                  <Ionicons name="download-outline" size={15} color="#059669" />
                  <Text style={[styles.helperChipText, { color: '#059669' }]}>
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
                          <Ionicons name="cloud-upload-outline" size={32} color="#4338CA" />
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
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
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
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 9,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#4338CA',
    fontWeight: '700',
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
    gap: 5,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  helperChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4338CA',
  },
  templateGuideCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  guideTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  guideItem: {
    fontSize: 11,
    color: '#475569',
    marginBottom: 3,
    lineHeight: 16,
  },
  guideCode: {
    fontWeight: '700',
    color: '#4338CA',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  filePickerArea: {
    marginBottom: 14,
  },
  dropzone: {
    borderWidth: 2,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  dropzoneSelected: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  dropzoneContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  fileIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  dropzoneTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  dropzoneSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
  },
  fileNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065F46',
    maxWidth: 240,
  },
  fileChangeHint: {
    fontSize: 11,
    color: '#059669',
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  pasteArea: {
    marginBottom: 14,
  },
  pasteInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 12,
    fontSize: 12,
    color: '#0F172A',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
    color: '#EF4444',
    fontWeight: '600',
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
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  badgeSuccess: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeSuccessText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  issuesCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
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
    color: '#B45309',
  },
  issueText: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 2,
  },
  issueTextMore: {
    fontSize: 11,
    color: '#B45309',
    fontWeight: '600',
    marginTop: 3,
  },
  previewRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  assetTypeTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  tagStock: {
    backgroundColor: '#EFF6FF',
  },
  tagFund: {
    backgroundColor: '#F5F3FF',
  },
  tagCash: {
    backgroundColor: '#ECFDF5',
  },
  assetTypeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  textStock: {
    color: '#1D4ED8',
  },
  textFund: {
    color: '#6D28D9',
  },
  textCash: {
    color: '#047857',
  },
  tagUsd: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  textUsd: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B45309',
  },
  previewMeta: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  previewRowRight: {
    alignItems: 'flex-end',
  },
  previewShares: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewCost: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  moreRowsNotice: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 6,
  },
  importingBox: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  importingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  importingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3730A3',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#C7D2FE',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4338CA',
    borderRadius: 3,
  },
  importingSub: {
    fontSize: 11,
    color: '#4F46E5',
    marginTop: 6,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  confirmButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#4338CA',
  },
  confirmButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryContainer: {
    padding: 24,
    alignItems: 'center',
  },
  successIconCircle: {
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  summarySubtitle: {
    fontSize: 13,
    color: '#64748B',
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
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 90,
  },
  summaryStatValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#10B981',
  },
  summaryStatLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  errorLogsBox: {
    width: '100%',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorLogsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
    marginBottom: 4,
  },
  errorLogText: {
    fontSize: 11,
    color: '#991B1B',
    marginTop: 2,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
