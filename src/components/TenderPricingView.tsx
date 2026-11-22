import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  Check,
  Download,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  Lock,
  PackagePlus,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import {
  BidProduct,
  CompanyProfile,
  CurrencyCode,
  STATUS_LABELS,
  Tender,
  TenderPricingItem,
  TenderPricingSheet,
  VatFinancingBasis,
} from '../types/tender';
import { formatCurrency, formatTurkishDate } from '../lib/trackingAndCalendar';
import {
  calcDeliveryFinancingPct,
  calcVat180FinancingPct,
  computeTenderPricingItem,
  createEmptyPricingItem,
  createPricingItemFromBidProduct,
  downloadTenderPricingCsv,
  printTenderPricingReport,
  round2,
  summarizePricingItems,
} from '../lib/tenderPricing';
import { downloadTenderPricingPdf } from '../lib/tenderPricingPdf';
import { TenderPricingSheetInput } from '../services/firestoreService';

interface TenderPricingViewProps {
  tenders: Tender[];
  bidProducts: BidProduct[];
  pricingSheets: TenderPricingSheet[];
  companyProfile: CompanyProfile | null;
  canManagePricing: boolean;
  canManageProducts: boolean;
  initialTenderId?: string | null;
  onSaveSheet: (input: TenderPricingSheetInput) => Promise<string | void>;
  onOpenTenderDetail: (tenderId: string) => void;
  onNewBidProductForTender: (tenderId: string) => void;
}

export const TenderPricingView: React.FC<TenderPricingViewProps> = ({
  tenders,
  bidProducts,
  pricingSheets,
  companyProfile,
  canManagePricing,
  canManageProducts,
  initialTenderId,
  onSaveSheet,
  onOpenTenderDetail,
  onNewBidProductForTender,
}) => {
  // Prioritize tenders with saved sheets or linked products when picking initial tender
  const sortedTenders = useMemo(() => {
    return [...tenders].sort((a, b) => {
      if (a.tenderDate !== b.tenderDate) {
        return (b.tenderDate || '').localeCompare(a.tenderDate || '');
      }
      return (a.trackingCode || '').localeCompare(b.trackingCode || '', 'tr');
    });
  }, [tenders]);

  const [selectedTenderId, setSelectedTenderId] = useState<string>('');
  const [currency, setCurrency] = useState<CurrencyCode>('TRY');
  const [annualFinancingRate, setAnnualFinancingRate] = useState<number>(48);
  const [defaultDeliveryDays, setDefaultDeliveryDays] = useState<number>(60);
  const [vatFinancingBasis, setVatFinancingBasis] = useState<VatFinancingBasis>('maliyet');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<TenderPricingItem[]>([]);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [pdfExporting, setPdfExporting] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState<boolean>(false);
  const [catalogSearch, setCatalogSearch] = useState<string>('');

  // Sync selected tender when initialTenderId changes or on initial load
  useEffect(() => {
    if (initialTenderId && sortedTenders.some((t) => t.id === initialTenderId)) {
      setSelectedTenderId(initialTenderId);
      return;
    }
    if (!selectedTenderId && sortedTenders.length > 0) {
      const preferred =
        sortedTenders.find((t) => pricingSheets.some((s) => s.tenderId === t.id)) ||
        sortedTenders.find((t) => bidProducts.some((p) => p.tenderId === t.id)) ||
        sortedTenders[0];
      if (preferred) setSelectedTenderId(preferred.id);
    }
  }, [initialTenderId, sortedTenders, pricingSheets, bidProducts, selectedTenderId]);

  const selectedTender = useMemo(
    () => sortedTenders.find((t) => t.id === selectedTenderId) || null,
    [sortedTenders, selectedTenderId]
  );

  const savedSheet = useMemo(
    () => pricingSheets.find((s) => s.tenderId === selectedTenderId) || null,
    [pricingSheets, selectedTenderId]
  );

  const tenderProducts = useMemo(
    () => bidProducts.filter((p) => p.tenderId === selectedTenderId),
    [bidProducts, selectedTenderId]
  );

  // Load saved sheet or seed from tender's bid products when tender switches (or when sheet first arrives while clean)
  useEffect(() => {
    if (!selectedTender) {
      setItems([]);
      setIsDirty(false);
      return;
    }
    if (isDirty) return;

    if (savedSheet) {
      setCurrency(savedSheet.currency || selectedTender.currency || 'TRY');
      setAnnualFinancingRate(Number(savedSheet.annualFinancingRate) || 48);
      setDefaultDeliveryDays(Number(savedSheet.defaultDeliveryDays) || 60);
      setVatFinancingBasis(savedSheet.vatFinancingBasis || 'maliyet');
      setNotes(savedSheet.notes || '');
      setItems(
        (savedSheet.items || []).map((it) =>
          computeTenderPricingItem(it, savedSheet.vatFinancingBasis || 'maliyet')
        )
      );
    } else {
      const defaultBasis: VatFinancingBasis = 'maliyet';
      const defaultRate = 48;
      const defaultDays = 60;
      setCurrency(selectedTender.currency || 'TRY');
      setAnnualFinancingRate(defaultRate);
      setDefaultDeliveryDays(defaultDays);
      setVatFinancingBasis(defaultBasis);
      setNotes('');
      setItems(
        tenderProducts.map((prod) =>
          createPricingItemFromBidProduct(prod, {
            annualFinancingRate: defaultRate,
            defaultDeliveryDays: defaultDays,
            vatFinancingBasis: defaultBasis,
          })
        )
      );
    }
  }, [selectedTender, savedSheet, tenderProducts, isDirty]);

  // Reset dirty flag when user manually switches tender
  const handleSelectTender = (nextId: string) => {
    setSelectedTenderId(nextId);
    setIsDirty(false);
    setSaveMessage(null);
    setSaveError(null);
    setCatalogPickerOpen(false);
  };

  // Detect tender products that are not yet added to the current pricing table
  const missingTenderProducts = useMemo(() => {
    const existingProdIds = new Set(items.map((it) => it.productId).filter(Boolean));
    return tenderProducts.filter((p) => !existingProdIds.has(p.id));
  }, [items, tenderProducts]);

  // Recompute all items whenever vatFinancingBasis changes
  const handleChangeVatBasis = (nextBasis: VatFinancingBasis) => {
    if (!canManagePricing) return;
    setVatFinancingBasis(nextBasis);
    setItems((prev) => prev.map((it) => computeTenderPricingItem(it, nextBasis)));
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleUpdateItem = (
    itemId: string,
    patch: Partial<TenderPricingItem>
  ) => {
    if (!canManagePricing) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        return computeTenderPricingItem({ ...it, ...patch }, vatFinancingBasis);
      })
    );
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleRemoveItem = (itemId: string) => {
    if (!canManagePricing) return;
    setItems((prev) => prev.filter((it) => it.id !== itemId));
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handlePullMissingProducts = () => {
    if (!canManagePricing || missingTenderProducts.length === 0) return;
    const additions = missingTenderProducts.map((prod) =>
      createPricingItemFromBidProduct(prod, {
        annualFinancingRate,
        defaultDeliveryDays,
        vatFinancingBasis,
      })
    );
    setItems((prev) => [...prev, ...additions]);
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleResetFromTenderProducts = () => {
    if (!canManagePricing || !selectedTender) return;
    const fresh = tenderProducts.map((prod) =>
      createPricingItemFromBidProduct(prod, {
        annualFinancingRate,
        defaultDeliveryDays,
        vatFinancingBasis,
      })
    );
    setItems(fresh);
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleAddEmptyItem = () => {
    if (!canManagePricing) return;
    setItems((prev) => [
      ...prev,
      createEmptyPricingItem({
        annualFinancingRate,
        defaultDeliveryDays,
        vatFinancingBasis,
      }),
    ]);
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleAddFromCatalogProduct = (prod: BidProduct) => {
    if (!canManagePricing) return;
    const newItem = createPricingItemFromBidProduct(prod, {
      annualFinancingRate,
      defaultDeliveryDays,
      vatFinancingBasis,
    });
    setItems((prev) => [...prev, newItem]);
    setCatalogPickerOpen(false);
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleApplyDeliveryFinancingToAll = () => {
    if (!canManagePricing) return;
    setItems((prev) =>
      prev.map((it) => {
        const nextDays = defaultDeliveryDays;
        const nextPct = calcDeliveryFinancingPct(annualFinancingRate, nextDays);
        return computeTenderPricingItem(
          {
            ...it,
            deliveryDays: nextDays,
            financingRate: nextPct,
          },
          vatFinancingBasis
        );
      })
    );
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleApplyVat180ToAll = () => {
    if (!canManagePricing) return;
    setItems((prev) =>
      prev.map((it) => {
        const nextVatFinPct = calcVat180FinancingPct(
          annualFinancingRate,
          it.vatRate,
          vatFinancingBasis
        );
        return computeTenderPricingItem(
          {
            ...it,
            vatFinancing180Enabled: true,
            vatFinancingRate: nextVatFinPct,
          },
          vatFinancingBasis
        );
      })
    );
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleSave = async () => {
    if (!canManagePricing || !selectedTender) return;
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      await onSaveSheet({
        tenderId: selectedTender.id,
        tenderTrackingCode: selectedTender.trackingCode,
        tenderTitle: selectedTender.title,
        currency,
        annualFinancingRate,
        defaultDeliveryDays,
        vatFinancingBasis,
        notes,
        items,
      });
      setIsDirty(false);
      setSaveMessage('Fiyat çalışması başarıyla kaydedildi.');
      setTimeout(() => setSaveMessage(null), 3500);
    } catch (err) {
      let rawMsg = '';
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message) as { error?: string };
          rawMsg = parsed?.error || err.message;
        } catch {
          rawMsg = err.message;
        }
      }
      if (
        rawMsg.includes('Quota exceeded') ||
        rawMsg.includes('Quota limit exceeded') ||
        rawMsg.includes('RESOURCE_EXHAUSTED')
      ) {
        setSaveError(
          'Firestore ücretsiz katman günlük okuma kotası dolduğu için kayıt tamamlanamadı. Kota ertesi gün sıfırlanır veya Firebase konsolundan veritabanı planı yükseltilerek hemen açılabilir.'
        );
      } else {
        setSaveError(rawMsg ? `Kayıt hatası: ${rawMsg}` : 'Fiyat çalışması kaydedilemedi.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedTender || items.length === 0 || pdfExporting) return;
    setPdfExporting(true);
    setSaveError(null);
    try {
      await downloadTenderPricingPdf({
        tender: selectedTender,
        items,
        currency,
        vatFinancingBasis,
        annualFinancingRate,
        defaultDeliveryDays,
        notes,
        companyName: companyProfile?.companyName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setSaveError(
        msg ? `PDF oluşturma hatası: ${msg}` : 'Fiyat çalışması PDF olarak indirilemedi.'
      );
    } finally {
      setPdfExporting(false);
    }
  };

  const totals = useMemo(() => summarizePricingItems(items), [items]);
  const avgProfitPct =
    totals.totalCost > 0
      ? round2((totals.totalProfit / totals.totalCost) * 100)
      : 0;
  const totalFinancingCombined = round2(
    totals.totalDeliveryFinancing + totals.totalVatFinancing
  );
  const estimatedDiff =
    selectedTender && selectedTender.estimatedAmount > 0
      ? round2(totals.totalBidNet - selectedTender.estimatedAmount)
      : null;

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    const list = bidProducts.filter((p) => {
      if (!q) return true;
      return (
        p.materialName.toLowerCase().includes(q) ||
        p.stockNumber.toLowerCase().includes(q) ||
        p.partNumber.toLowerCase().includes(q) ||
        p.supplierCompany.toLowerCase().includes(q) ||
        p.tenderTrackingCode.toLowerCase().includes(q)
      );
    });
    return list.slice(0, 30);
  }, [bidProducts, catalogSearch]);

  if (sortedTenders.length === 0) {
    return (
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-10 text-center space-y-3">
        <Calculator className="w-8 h-8 text-[#0066B3] mx-auto" />
        <h2 className="font-display text-base font-bold text-[#0B2239]">
          Fiyat Çalışması İçin İhale Bulunamadı
        </h2>
        <p className="text-xs text-[#4E5D6C] max-w-md mx-auto">
          Önce İhale Operasyonu bölümünden bir ihale oluşturun ve teklif edilecek ürünleri ihale içine ekleyin. Ardından her kalem için maliyet, kâr, teslim finansmanı, vergi, nakliye ve 180 gün KDV finansmanı hesaplaması yapabilirsiniz.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Yetki Bilgilendirme Bannerı (Salt-Okunur Kullanıcılar İçin) */}
      {!canManagePricing && (
        <div
          role="status"
          className="bg-white border border-[#DCE3EC] rounded-xl p-4 flex items-center gap-3 text-xs text-[#0B2239]"
        >
          <Lock className="w-4 h-4 text-[#0066B3] shrink-0" />
          <span>
            <strong>Yalnızca Görüntüleme Modu:</strong> Fiyat çalışma ekranında değişiklik yapma yetkiniz bulunmuyor. Düzenleme yetkisi Sistem Yöneticisi tarafından{' '}
            <strong>Kullanıcı Yetkilendirme</strong> ekranından (İhale Fiyat Çalışması Düzenleme izni) tanımlanabilir.
          </span>
        </div>
      )}

      {/* Sayfa İle Birlikte Sabit Kalan İşlem Çubuğu */}
      <div className="sticky top-0 lg:top-[75px] z-10 -mx-1 px-1 py-1 bg-[#F3F6FA]/95 backdrop-blur-md space-y-2">
        <div className="bg-white border border-[#DCE3EC] shadow-sm rounded-xl px-3.5 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="min-w-0 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {selectedTender && (
              <>
                <span className="font-mono text-xs font-bold text-[#0066B3] bg-[#F3F6FA] border border-[#DCE3EC] px-2 py-0.5 rounded-md shrink-0">
                  {selectedTender.trackingCode}
                </span>
                <span className="text-xs font-bold text-[#0B2239] truncate max-w-[240px] sm:max-w-[340px]">
                  {selectedTender.title}
                </span>
                <span className="hidden sm:inline text-[#DCE3EC]">|</span>
                <span className="text-xs text-[#4E5D6C] whitespace-nowrap">
                  Net Teklif:{' '}
                  <strong className="font-mono text-[#007A53] tabular-nums">
                    {formatCurrency(totals.totalBidNet, currency)}
                  </strong>
                </span>
                {isDirty && canManagePricing && (
                  <span className="text-[11px] font-semibold text-[#B45309] bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                    Kaydedilmemiş değişiklikler
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {selectedTender && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    downloadTenderPricingCsv(
                      selectedTender,
                      items,
                      currency,
                      vatFinancingBasis
                    )
                  }
                  disabled={items.length === 0}
                  className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-[#0066B3]" />
                  <span>CSV İndir</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={items.length === 0 || pdfExporting}
                  className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  <FileDown className="w-3.5 h-3.5 text-[#0066B3]" />
                  <span>{pdfExporting ? 'PDF Hazırlanıyor…' : 'PDF İndir'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    printTenderPricingReport(
                      selectedTender,
                      items,
                      currency,
                      vatFinancingBasis,
                      companyProfile?.companyName
                    )
                  }
                  disabled={items.length === 0}
                  className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap transition-colors"
                >
                  <Printer className="w-3.5 h-3.5 text-[#0066B3]" />
                  <span>Yazdır</span>
                </button>
              </>
            )}

            {canManagePricing && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !selectedTender}
                className="min-h-[40px] px-4 inline-flex items-center gap-2 bg-[#007A53] hover:bg-[#006344] text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>
                  {saving
                    ? 'Kaydediliyor…'
                    : isDirty
                    ? 'Çalışmayı Kaydet *'
                    : 'Çalışmayı Kaydet'}
                </span>
              </button>
            )}
          </div>
        </div>

        {saveMessage && (
          <div className="p-2.5 bg-white border border-[#007A53] shadow-sm rounded-lg text-xs font-medium text-[#007A53] flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{saveMessage}</span>
          </div>
        )}

        {saveError && (
          <div
            role="alert"
            className="p-2.5 bg-red-50 border border-red-200 shadow-sm rounded-lg text-xs font-medium text-red-700 flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
      </div>

      {/* Üst İhale Seçimi ve Parametre Çubuğu */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1.5">
            <label
              htmlFor="pricing-tender-select"
              className="block text-xs font-semibold text-[#0B2239]"
            >
              Çalışılacak İhale Seçimi *
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <select
                id="pricing-tender-select"
                value={selectedTenderId}
                onChange={(e) => handleSelectTender(e.target.value)}
                className="flex-1 min-h-[44px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-sm font-medium text-[#0B2239] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {sortedTenders.map((t) => {
                  const pCount = bidProducts.filter((p) => p.tenderId === t.id).length;
                  const hasSaved = pricingSheets.some((s) => s.tenderId === t.id);
                  return (
                    <option key={t.id} value={t.id}>
                      {t.trackingCode} · {t.title} ({t.authority}) — {pCount} Ürün
                      {hasSaved ? ' [Kayıtlı Çalışma]' : ''}
                    </option>
                  );
                })}
              </select>

              {selectedTender && (
                <button
                  type="button"
                  onClick={() => onOpenTenderDetail(selectedTender.id)}
                  className="min-h-[44px] px-3.5 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#0066B3]" />
                  <span>İhale Detayını Aç</span>
                </button>
              )}
            </div>
            {selectedTender && (
              <div className="text-xs text-[#4E5D6C] flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                <span>
                  Durum:{' '}
                  <strong className="text-[#0B2239]">
                    {STATUS_LABELS[selectedTender.status]}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  İhale Tarihi:{' '}
                  <strong className="font-mono text-[#0B2239]">
                    {formatTurkishDate(selectedTender.tenderDate)}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Yaklaşık Maliyet:{' '}
                  <strong className="font-mono text-[#0B2239] tabular-nums">
                    {formatCurrency(selectedTender.estimatedAmount, selectedTender.currency)}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  İhale Ürün Kartı:{' '}
                  <strong className="font-mono text-[#0066B3] tabular-nums">
                    {tenderProducts.length} kalem
                  </strong>
                </span>
                {savedSheet && (
                  <>
                    <span>·</span>
                    <span className="text-[#007A53] font-semibold">
                      Kayıtlı fiyat çalışması yüklendi
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Genel Parametre & İhaleden Çekme Çubuğu */}
        <div className="pt-4 border-t border-[#DCE3EC] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
              Çalışma Para Birimi
            </label>
            <select
              value={currency}
              disabled={!canManagePricing}
              onChange={(e) => {
                setCurrency(e.target.value as CurrencyCode);
                setIsDirty(true);
              }}
              className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-semibold text-[#0B2239] disabled:bg-[#F3F6FA]"
            >
              <option value="TRY">TRY (₺ Türk Lirası)</option>
              <option value="USD">USD ($ Amerikan Doları)</option>
              <option value="EUR">EUR (€ Euro)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
              Yıllık Finansman Oranı (%)
            </label>
            <input
              type="number"
              min="0"
              max="500"
              step="0.5"
              disabled={!canManagePricing}
              value={annualFinancingRate}
              onChange={(e) => {
                setAnnualFinancingRate(Math.max(0, Number(e.target.value) || 0));
                setIsDirty(true);
              }}
              className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-mono tabular-nums text-[#0B2239] disabled:bg-[#F3F6FA]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
              Varsayılan Teslim Süresi (Gün)
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                max="3650"
                step="1"
                disabled={!canManagePricing}
                value={defaultDeliveryDays}
                onChange={(e) => {
                  setDefaultDeliveryDays(
                    Math.max(0, Math.round(Number(e.target.value) || 0))
                  );
                  setIsDirty(true);
                }}
                className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-mono tabular-nums text-[#0B2239] disabled:bg-[#F3F6FA]"
              />
              {canManagePricing && (
                <button
                  type="button"
                  onClick={handleApplyDeliveryFinancingToAll}
                  title="Yıllık oran ve teslim gününe göre tüm kalemlerin teslim finansman yüzdesini güncelle"
                  className="min-h-[40px] px-2.5 bg-[#F3F6FA] hover:bg-[#DCE3EC]/60 border border-[#DCE3EC] text-[#0B2239] text-[11px] font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                >
                  Tümüne Uygula
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
              KDV Finansmanı (180 Gün) Hesap Bazı
            </label>
            <div className="flex items-center gap-1.5">
              <select
                value={vatFinancingBasis}
                disabled={!canManagePricing}
                onChange={(e) =>
                  handleChangeVatBasis(e.target.value as VatFinancingBasis)
                }
                className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-medium text-[#0B2239] disabled:bg-[#F3F6FA]"
              >
                <option value="maliyet">Maliyet Tutarı (%)</option>
                <option value="kdv_tutari">KDV Tutarı (%)</option>
              </select>
              {canManagePricing && (
                <button
                  type="button"
                  onClick={handleApplyVat180ToAll}
                  title="180 gün / 365 gün bazında tüm satırların KDV finansman yüzdesini otomatik hesapla"
                  className="min-h-[40px] px-2.5 bg-[#F3F6FA] hover:bg-[#DCE3EC]/60 border border-[#DCE3EC] text-[#0066B3] text-[11px] font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                >
                  180G Hesapla
                </button>
              )}
            </div>
          </div>
        </div>

        {/* İhale Ürünleri Çekme & Kalem Ekleme Araç Şeridi */}
        {canManagePricing && selectedTender && (
          <div className="pt-3 border-t border-[#DCE3EC] flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {missingTenderProducts.length > 0 && (
                <button
                  type="button"
                  onClick={handlePullMissingProducts}
                  className="min-h-[40px] px-3.5 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>
                    İhaleden Yeni Ürünleri Çek (+{missingTenderProducts.length})
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={handleResetFromTenderProducts}
                disabled={tenderProducts.length === 0}
                className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#4E5D6C]" />
                <span>İhale Ürünlerinden Yeniden Çek ({tenderProducts.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setCatalogPickerOpen((v) => !v)}
                className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#0066B3]" />
                <span>Ürün Havuzundan Seç</span>
              </button>

              <button
                type="button"
                onClick={handleAddEmptyItem}
                className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-[#007A53]" />
                <span>Manuel Kalem Ekle</span>
              </button>
            </div>

            {canManageProducts && (
              <button
                type="button"
                onClick={() => onNewBidProductForTender(selectedTender.id)}
                className="min-h-[40px] px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0066B3] hover:bg-[#F3F6FA] rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <PackagePlus className="w-4 h-4" />
                <span>İhaleye Yeni Ürün Kartı Oluştur</span>
              </button>
            )}
          </div>
        )}

        {/* Ürün Havuzu Seçici */}
        {catalogPickerOpen && canManagePricing && (
          <div className="p-4 bg-[#F3F6FA] border border-[#DCE3EC] rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs font-bold text-[#0B2239]">
                Kayıtlı Ürün Kartlarından Kalem Aktar
              </div>
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Malzeme adı, stok no, parça no veya tedarikçi ara..."
                className="sm:w-80 min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            {filteredCatalog.length === 0 ? (
              <div className="text-xs text-[#4E5D6C] py-3">
                Aramaya uygun ürün kartı bulunamadı.
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto divide-y divide-[#DCE3EC] bg-white border border-[#DCE3EC] rounded-lg">
                {filteredCatalog.map((prod) => (
                  <div
                    key={prod.id}
                    className="px-3 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[#F3F6FA]/70"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#0B2239] truncate">
                        {prod.materialName}
                      </div>
                      <div className="text-[11px] text-[#4E5D6C] truncate">
                        {prod.tenderTrackingCode ? `${prod.tenderTrackingCode} · ` : ''}
                        {prod.stockNumber ? `Stok: ${prod.stockNumber} · ` : ''}
                        {prod.partNumber ? `Parça: ${prod.partNumber} · ` : ''}
                        {prod.supplierCompany}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
                        {formatCurrency(prod.offeredSalePrice, prod.currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddFromCatalogProduct(prod)}
                        className="min-h-[34px] px-3 bg-[#0066B3] hover:bg-[#00508E] text-white text-[11px] font-semibold rounded-md cursor-pointer whitespace-nowrap"
                      >
                        Cetvele Ekle
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </section>

      {/* 5 Sütunlu Kurumsal Maliyet & Teklif KPI Özeti */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl grid grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-[#DCE3EC]">
        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">Toplam Maliyet</div>
          <div className="mt-1.5 text-lg sm:text-xl font-bold text-[#0B2239] font-mono tabular-nums">
            {formatCurrency(totals.totalCost, currency)}
          </div>
          <div className="mt-1 text-[11px] text-[#4E5D6C] font-mono tabular-nums">
            {items.length} kalem girdi toplamı
          </div>
        </div>

        <div className="p-4 sm:p-5 border-l border-[#DCE3EC] lg:border-l-0">
          <div className="text-xs text-[#4E5D6C]">Toplam Kâr</div>
          <div className="mt-1.5 text-lg sm:text-xl font-bold text-[#007A53] font-mono tabular-nums">
            {formatCurrency(totals.totalProfit, currency)}
          </div>
          <div className="mt-1 text-[11px] text-[#4E5D6C] font-mono tabular-nums">
            Ort. Kâr Marjı: %{avgProfitPct.toFixed(2)}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">Finansman Yükü (Teslim + 180G)</div>
          <div className="mt-1.5 text-lg sm:text-xl font-bold text-[#0B2239] font-mono tabular-nums">
            {formatCurrency(totalFinancingCombined, currency)}
          </div>
          <div className="mt-1 text-[11px] text-[#4E5D6C] font-mono tabular-nums">
            Teslim: {formatCurrency(totals.totalDeliveryFinancing, currency)} · 180G KDV:{' '}
            {formatCurrency(totals.totalVatFinancing, currency)}
          </div>
        </div>

        <div className="p-4 sm:p-5 border-l border-[#DCE3EC] lg:border-l-0">
          <div className="text-xs text-[#4E5D6C]">Vergiler + Nakliye / Kargo</div>
          <div className="mt-1.5 text-lg sm:text-xl font-bold text-[#0B2239] font-mono tabular-nums">
            {formatCurrency(totals.totalTaxes + totals.totalShipping, currency)}
          </div>
          <div className="mt-1 text-[11px] text-[#4E5D6C] font-mono tabular-nums">
            Vergi: {formatCurrency(totals.totalTaxes, currency)} · Nakliye:{' '}
            {formatCurrency(totals.totalShipping, currency)}
          </div>
        </div>

        <div className="col-span-2 lg:col-span-1 p-4 sm:p-5 bg-[#0B2239] text-white rounded-b-xl lg:rounded-b-none lg:rounded-r-xl">
          <div className="text-xs text-slate-300">Net Teklif Toplamı (KDV Hariç)</div>
          <div className="mt-1.5 text-lg sm:text-xl font-bold text-[#34D399] font-mono tabular-nums">
            {formatCurrency(totals.totalBidNet, currency)}
          </div>
          <div className="mt-1 text-[11px] text-slate-300 font-mono tabular-nums">
            KDV Dahil: {formatCurrency(totals.totalBidGross, currency)}
          </div>
          {estimatedDiff !== null && selectedTender && (
            <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-300">
              Yaklaşık Maliyet Farkı:{' '}
              <span
                className={
                  estimatedDiff <= 0 ? 'text-[#34D399] font-bold' : 'text-[#FBBF24] font-bold'
                }
              >
                {estimatedDiff > 0 ? '+' : ''}
                {formatCurrency(estimatedDiff, currency)}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Kalem Bazlı Hesaplama Tablosu */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#DCE3EC] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-sm font-bold text-[#0B2239]">
              Kalem Bazlı Maliyet ve Fiyat Çalışma Cetveli ({items.length})
            </h3>
            <p className="text-xs text-[#4E5D6C] mt-0.5">
              Her ürün kendi satırı içinde bağımsız hesaplanır: Maliyet + Kâr (%) + Teslim Finansmanı (%) + Vergiler (%) + Nakliye (Tutar) + KDV Finansmanı (180 Gün %).
            </p>
          </div>
          <div className="text-[11px] text-[#4E5D6C] font-mono">
            Baz: {vatFinancingBasis === 'kdv_tutari' ? 'KDV Tutarı (%)' : 'Maliyet Tutarı (%)'}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-semibold text-[#0B2239]">
              Bu ihalede henüz fiyat çalışma kalemi bulunmuyor.
            </p>
            <p className="text-xs text-[#4E5D6C] max-w-lg mx-auto">
              İhaleye ürün kartı eklediğinizde ürünler otomatik çekilir veya yukarıdaki butonlardan manuel kalem ya da ürün havuzundan kalem ekleyebilirsiniz.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Auto-Fit Full-Row Table (Zero Horizontal Cutoff) */}
            <div className="hidden lg:block w-full">
              <table className="w-full table-fixed text-left border-collapse text-xs">
                <colgroup>
                  <col className="w-[2.5%]" />
                  <col className={canManagePricing ? 'w-[20.5%]' : 'w-[23%]'} />
                  <col className="w-[9.5%]" />
                  <col className="w-[7.5%]" />
                  <col className="w-[13%]" />
                  <col className="w-[7.5%]" />
                  <col className="w-[8.5%]" />
                  <col className="w-[11%]" />
                  <col className="w-[7%]" />
                  <col className="w-[10.5%]" />
                  {canManagePricing && <col className="w-[2.5%]" />}
                </colgroup>
                <thead>
                  <tr className="bg-[#0B2239] text-[10px] xl:text-[11px] font-semibold text-slate-200 border-b border-[#DCE3EC] leading-tight">
                    <th className="py-2.5 px-1.5 text-center">#</th>
                    <th className="py-2.5 px-1.5">Ürün / Malzeme &amp; Miktar</th>
                    <th className="py-2.5 px-1.5">Maliyet ({currency})</th>
                    <th className="py-2.5 px-1.5">Kâr (%)</th>
                    <th className="py-2.5 px-1.5">Teslim Gün &amp; Fin. (%)</th>
                    <th className="py-2.5 px-1.5">Vergi (%)</th>
                    <th className="py-2.5 px-1.5">Nakliye ({currency})</th>
                    <th className="py-2.5 px-1.5">180G KDV Fin. (%)</th>
                    <th className="py-2.5 px-1.5">KDV (%)</th>
                    <th className="py-2.5 px-1.5 text-right">Teklif Tutarı</th>
                    {canManagePricing && <th className="py-2.5 px-1"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE3EC]">
                  {items.map((item, idx) => {
                    const suggestedDeliveryPct = calcDeliveryFinancingPct(
                      annualFinancingRate,
                      item.deliveryDays
                    );
                    const suggestedVat180Pct = calcVat180FinancingPct(
                      annualFinancingRate,
                      item.vatRate,
                      vatFinancingBasis
                    );
                    return (
                      <tr key={item.id} className="hover:bg-[#F3F6FA]/50 align-top">
                        <td className="py-2.5 px-1.5 font-mono text-[11px] text-[#4E5D6C] text-center pt-3.5">
                          {idx + 1}
                        </td>

                        {/* Ürün & Miktar */}
                        <td className="py-2.5 px-1.5 space-y-1">
                          <input
                            type="text"
                            disabled={!canManagePricing}
                            maxLength={200}
                            value={item.materialName}
                            title={item.materialName}
                            onChange={(e) =>
                              handleUpdateItem(item.id, { materialName: e.target.value })
                            }
                            className="w-full min-w-0 min-h-[34px] px-2 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-semibold text-[#0B2239] disabled:bg-[#F3F6FA]"
                          />
                          {(item.stockNumber || item.partNumber || item.supplierCompany) && (
                            <div
                              className="text-[10px] text-[#4E5D6C] truncate"
                              title={`${item.stockNumber ? `Stok: ${item.stockNumber} · ` : ''}${item.partNumber ? `Parça: ${item.partNumber} · ` : ''}${item.supplierCompany}`}
                            >
                              {item.stockNumber ? `Stok: ${item.stockNumber} · ` : ''}
                              {item.partNumber ? `Parça: ${item.partNumber} · ` : ''}
                              {item.supplierCompany}
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-1">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              disabled={!canManagePricing}
                              value={item.quantity}
                              onChange={(e) =>
                                handleUpdateItem(item.id, {
                                  quantity: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              aria-label="Miktar"
                              title="Miktar"
                              className="w-full min-w-0 min-h-[30px] px-1.5 py-0.5 bg-white border border-[#DCE3EC] rounded-md text-[11px] font-mono tabular-nums text-[#0B2239] disabled:bg-[#F3F6FA]"
                            />
                            <input
                              type="text"
                              maxLength={30}
                              disabled={!canManagePricing}
                              value={item.unit}
                              onChange={(e) =>
                                handleUpdateItem(item.id, { unit: e.target.value })
                              }
                              aria-label="Birim"
                              title="Birim"
                              className="w-full min-w-0 min-h-[30px] px-1.5 py-0.5 bg-white border border-[#DCE3EC] rounded-md text-[11px] text-[#0B2239] disabled:bg-[#F3F6FA]"
                            />
                          </div>
                        </td>

                        {/* Maliyet Tutarı */}
                        <td className="py-2.5 px-1.5 space-y-1">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={!canManagePricing}
                            value={item.unitCost}
                            onChange={(e) =>
                              handleUpdateItem(item.id, {
                                unitCost: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            aria-label="Birim Maliyet"
                            title="Birim Maliyet"
                            className="w-full min-w-0 min-h-[34px] px-1.5 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-mono tabular-nums text-[#0B2239] disabled:bg-[#F3F6FA]"
                          />
                          <div className="text-[10px] xl:text-[11px] font-mono tabular-nums text-[#4E5D6C] leading-tight break-words">
                            Top: {formatCurrency(item.costTotal, currency)}
                          </div>
                        </td>

                        {/* Kâr % */}
                        <td className="py-2.5 px-1.5 space-y-1">
                          <input
                            type="number"
                            min="0"
                            max="1000"
                            step="0.1"
                            disabled={!canManagePricing}
                            value={item.profitRate}
                            onChange={(e) =>
                              handleUpdateItem(item.id, {
                                profitRate: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            aria-label="Kâr Yüzdesi"
                            className="w-full min-w-0 min-h-[34px] px-1.5 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-mono tabular-nums text-[#0B2239] disabled:bg-[#F3F6FA]"
                          />
                          <div className="text-[10px] xl:text-[11px] font-mono tabular-nums text-[#007A53] font-semibold leading-tight break-words">
                            +{formatCurrency(item.profitAmount, currency)}
                          </div>
                        </td>

                        {/* Teslim Süresine Göre Finansman % */}
                        <td className="py-2.5 px-1.5 space-y-1">
                          <div className="grid grid-cols-2 gap-1">
                            <input
                              type="number"
                              min="0"
                              max="3650"
                              step="1"
                              disabled={!canManagePricing}
                              value={item.deliveryDays}
                              onChange={(e) =>
                                handleUpdateItem(item.id, {
                                  deliveryDays: Math.max(
                                    0,
                                    Math.round(Number(e.target.value) || 0)
                                  ),
                                })
                              }
                              title="Teslim Süresi (Gün)"
                              className="w-full min-w-0 min-h-[34px] px-1.5 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-mono tabular-nums text-[#0B2239] disabled:bg-[#F3F6FA]"
                            />
                            <input
                              type="number"
                              min="0"
                              max="500"
                              step="0.01"
                              disabled={!canManagePricing}
                              value={item.financingRate}
                              onChange={(e) =>
                                handleUpdateItem(item.id, {
                                  financingRate: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              title="Teslim Finansman Yüzdesi (%)"
                              className="w-full min-w-0 min-h-[34px] px-1.5 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-mono tabular-nums text-[#0B2239] disabled:bg-[#F3F6FA]"
                            />
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] xl:text-[11px] font-mono tabular-nums text-[#4E5D6C] leading-tight">
                            <span>+{formatCurrency(item.financingAmount, currency)}</span>
                            {canManagePricing && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateItem(item.id, {
                                    financingRate: suggestedDeliveryPct,
                                  })
                                }
                                title={`Yıllık %${annualFinancingRate} üzerinden ${item.deliveryDays} gün = %${suggestedDeliveryPct} uygula`}
                                className="text-[10px] text-[#0066B3] hover:underline cursor-pointer"
                              >
                                %{suggestedDeliveryPct}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Vergiler % */}
                        <td className="py-2.5 px-1.5 space-y-1">
                          <input
                            type="number"
                            min="0"
                            max="500"
                            step="0.1"
                            disabled={!canManagePricing}
                            value={item.taxRate}
                            onChange={(e) =>
                              handleUpdateItem(item.id, {
                                taxRate: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            aria-label="Vergi Yüzdesi"
                            className="w-full min-w-0 min-h-[34px] px-1.5 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-mono tabular-nums text-[#0B2239] disabled:bg-[#F3F6FA]"
                          />
                          <div className="text-[10px] xl:text-[11px] font-mono tabular-nums text-[#4E5D6C] leading-tight break-words">
                            +{formatCurrency(item.taxAmount, currency)}
                          </div>
                        </td>

                        {/* Nakliye ve Kargo Giderleri (Tutar) */}
                        <td className="py-2.5 px-1.5 space-y-1">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            disabled={!canManagePricing}
                            value={item.shippingAmount}
                            onChange={(e) =>
                              handleUpdateItem(item.id, {
                                shippingAmount: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            aria-label="Nakliye ve Kargo Tutarı"
                            className="w-full min-w-0 min-h-[34px] px-1.5 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-mono tabular-nums text-[#0B2239] disabled:bg-[#F3F6FA]"
                          />
                          <div className="text-[10px] font-mono tabular-nums text-[#4E5D6C] leading-tight">
                            Sabit tutar
                          </div>
                        </td>

                        {/* 180 Gün KDV Finansmanı % */}
                        <td className="py-2.5 px-1.5 space-y-1">
                          <div className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={item.vatFinancing180Enabled}
                              disabled={!canManagePricing}
                              onChange={(e) =>
                                handleUpdateItem(item.id, {
                                  vatFinancing180Enabled: e.target.checked,
                                })
                              }
                              title="180 Gün KDV Finansmanı Aktif"
                              className="w-3.5 h-3.5 accent-[#0066B3] shrink-0"
                            />
                            <input
                              type="number"
                              min="0"
                              max="500"
                              step="0.01"
                              disabled={!canManagePricing || !item.vatFinancing180Enabled}
                              value={item.vatFinancingRate}
                              onChange={(e) =>
                                handleUpdateItem(item.id, {
                                  vatFinancingRate: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              aria-label="180 Gün KDV Finansmanı Yüzdesi"
                              className="w-full min-w-0 min-h-[34px] px-1.5 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-mono tabular-nums text-[#0B2239] disabled:bg-[#F3F6FA] disabled:text-[#868686]"
                            />
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] xl:text-[11px] font-mono tabular-nums text-[#4E5D6C] leading-tight">
                            <span>
                              {item.vatFinancing180Enabled
                                ? `+${formatCurrency(item.vatFinancingAmount, currency)}`
                                : 'Pasif'}
                            </span>
                            {canManagePricing && item.vatFinancing180Enabled && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateItem(item.id, {
                                    vatFinancingRate: suggestedVat180Pct,
                                  })
                                }
                                title={`180 gün otomatik oran (%${suggestedVat180Pct}) uygula`}
                                className="text-[10px] text-[#0066B3] hover:underline cursor-pointer"
                              >
                                %{suggestedVat180Pct}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* KDV % */}
                        <td className="py-2.5 px-1.5 space-y-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            disabled={!canManagePricing}
                            value={item.vatRate}
                            onChange={(e) =>
                              handleUpdateItem(item.id, {
                                vatRate: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                              })
                            }
                            aria-label="KDV Oranı"
                            className="w-full min-w-0 min-h-[34px] px-1.5 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-mono tabular-nums text-[#0B2239] disabled:bg-[#F3F6FA]"
                          />
                          <div className="text-[10px] xl:text-[11px] font-mono tabular-nums text-[#4E5D6C] leading-tight break-words">
                            {formatCurrency(item.vatAmount, currency)}
                          </div>
                        </td>

                        {/* Teklif Tutarı */}
                        <td className="py-2.5 px-1.5 text-right space-y-0.5">
                          <div className="font-mono font-bold text-xs xl:text-[13px] text-[#0066B3] tabular-nums leading-tight break-words">
                            {formatCurrency(item.netOfferTotal, currency)}
                          </div>
                          <div className="text-[10px] font-mono text-[#0B2239] tabular-nums leading-tight break-words">
                            Brm: {formatCurrency(item.netOfferUnitPrice, currency)}
                          </div>
                          <div className="text-[10px] font-mono text-[#4E5D6C] tabular-nums leading-tight break-words">
                            +KDV: {formatCurrency(item.grossOfferTotal, currency)}
                          </div>
                        </td>

                        {canManagePricing && (
                          <td className="py-2.5 px-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              aria-label="Kalemi Sil"
                              title="Kalemi Sil"
                              className="min-h-[32px] w-7 inline-flex items-center justify-center text-[#4E5D6C] hover:text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#F3F6FA] border-t-2 border-[#0B2239] font-bold text-[11px] text-[#0B2239]">
                    <td colSpan={2} className="py-3 px-1.5">
                      GENEL TOPLAM ({items.length} Kalem)
                    </td>
                    <td className="py-3 px-1.5 font-mono tabular-nums break-words">
                      {formatCurrency(totals.totalCost, currency)}
                    </td>
                    <td className="py-3 px-1.5 font-mono tabular-nums text-[#007A53] break-words">
                      {formatCurrency(totals.totalProfit, currency)}
                    </td>
                    <td className="py-3 px-1.5 font-mono tabular-nums break-words">
                      {formatCurrency(totals.totalDeliveryFinancing, currency)}
                    </td>
                    <td className="py-3 px-1.5 font-mono tabular-nums break-words">
                      {formatCurrency(totals.totalTaxes, currency)}
                    </td>
                    <td className="py-3 px-1.5 font-mono tabular-nums break-words">
                      {formatCurrency(totals.totalShipping, currency)}
                    </td>
                    <td className="py-3 px-1.5 font-mono tabular-nums break-words">
                      {formatCurrency(totals.totalVatFinancing, currency)}
                    </td>
                    <td className="py-3 px-1.5 font-mono tabular-nums break-words">
                      {formatCurrency(totals.totalVat, currency)}
                    </td>
                    <td className="py-3 px-1.5 text-right font-mono tabular-nums text-[#0066B3] break-words">
                      <div>{formatCurrency(totals.totalBidNet, currency)}</div>
                      <div className="text-[10px] text-[#4E5D6C] font-normal">
                        +KDV: {formatCurrency(totals.totalBidGross, currency)}
                      </div>
                    </td>
                    {canManagePricing && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Responsive Tablet / Mobile Cards */}
            <div className="lg:hidden divide-y divide-[#DCE3EC]">
              {items.map((item, idx) => (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="text-[11px] font-mono text-[#4E5D6C]">
                        Kalem #{idx + 1}
                        {item.stockNumber ? ` · Stok: ${item.stockNumber}` : ''}
                        {item.partNumber ? ` · Parça: ${item.partNumber}` : ''}
                      </div>
                      <input
                        type="text"
                        disabled={!canManagePricing}
                        maxLength={200}
                        value={item.materialName}
                        onChange={(e) =>
                          handleUpdateItem(item.id, { materialName: e.target.value })
                        }
                        className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-sm font-semibold text-[#0B2239] disabled:bg-[#F3F6FA]"
                      />
                    </div>
                    {canManagePricing && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        aria-label="Kalemi Sil"
                        className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center border border-[#DCE3EC] text-[#4E5D6C] hover:text-red-700 rounded-lg cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[11px] text-[#4E5D6C] mb-1">
                        Miktar &amp; Birim
                      </label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          disabled={!canManagePricing}
                          value={item.quantity}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              quantity: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-1/2 min-h-[38px] px-2 bg-white border border-[#DCE3EC] rounded-lg font-mono tabular-nums disabled:bg-[#F3F6FA]"
                        />
                        <input
                          type="text"
                          disabled={!canManagePricing}
                          value={item.unit}
                          onChange={(e) =>
                            handleUpdateItem(item.id, { unit: e.target.value })
                          }
                          className="w-1/2 min-h-[38px] px-2 bg-white border border-[#DCE3EC] rounded-lg disabled:bg-[#F3F6FA]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#4E5D6C] mb-1">
                        Birim Maliyet ({currency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        disabled={!canManagePricing}
                        value={item.unitCost}
                        onChange={(e) =>
                          handleUpdateItem(item.id, {
                            unitCost: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-full min-h-[38px] px-2.5 bg-white border border-[#DCE3EC] rounded-lg font-mono tabular-nums disabled:bg-[#F3F6FA]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#4E5D6C] mb-1">
                        Kâr (%) — +{formatCurrency(item.profitAmount, currency)}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        disabled={!canManagePricing}
                        value={item.profitRate}
                        onChange={(e) =>
                          handleUpdateItem(item.id, {
                            profitRate: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-full min-h-[38px] px-2.5 bg-white border border-[#DCE3EC] rounded-lg font-mono tabular-nums disabled:bg-[#F3F6FA]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#4E5D6C] mb-1">
                        Teslim Gün / Fin. (%)
                      </label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          disabled={!canManagePricing}
                          value={item.deliveryDays}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              deliveryDays: Math.max(
                                0,
                                Math.round(Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className="w-1/2 min-h-[38px] px-2 bg-white border border-[#DCE3EC] rounded-lg font-mono tabular-nums disabled:bg-[#F3F6FA]"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={!canManagePricing}
                          value={item.financingRate}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              financingRate: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-1/2 min-h-[38px] px-2 bg-white border border-[#DCE3EC] rounded-lg font-mono tabular-nums disabled:bg-[#F3F6FA]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#4E5D6C] mb-1">
                        Vergiler (%) — +{formatCurrency(item.taxAmount, currency)}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        disabled={!canManagePricing}
                        value={item.taxRate}
                        onChange={(e) =>
                          handleUpdateItem(item.id, {
                            taxRate: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-full min-h-[38px] px-2.5 bg-white border border-[#DCE3EC] rounded-lg font-mono tabular-nums disabled:bg-[#F3F6FA]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#4E5D6C] mb-1">
                        Nakliye &amp; Kargo ({currency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        disabled={!canManagePricing}
                        value={item.shippingAmount}
                        onChange={(e) =>
                          handleUpdateItem(item.id, {
                            shippingAmount: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-full min-h-[38px] px-2.5 bg-white border border-[#DCE3EC] rounded-lg font-mono tabular-nums disabled:bg-[#F3F6FA]"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-1.5 text-[11px] text-[#4E5D6C] mb-1">
                        <input
                          type="checkbox"
                          checked={item.vatFinancing180Enabled}
                          disabled={!canManagePricing}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              vatFinancing180Enabled: e.target.checked,
                            })
                          }
                          className="w-3.5 h-3.5 accent-[#0066B3]"
                        />
                        <span>180G KDV Fin. (%)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={!canManagePricing || !item.vatFinancing180Enabled}
                        value={item.vatFinancingRate}
                        onChange={(e) =>
                          handleUpdateItem(item.id, {
                            vatFinancingRate: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-full min-h-[38px] px-2.5 bg-white border border-[#DCE3EC] rounded-lg font-mono tabular-nums disabled:bg-[#F3F6FA]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#4E5D6C] mb-1">
                        KDV (%)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        disabled={!canManagePricing}
                        value={item.vatRate}
                        onChange={(e) =>
                          handleUpdateItem(item.id, {
                            vatRate: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                          })
                        }
                        className="w-full min-h-[38px] px-2.5 bg-white border border-[#DCE3EC] rounded-lg font-mono tabular-nums disabled:bg-[#F3F6FA]"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="text-[#4E5D6C] font-mono tabular-nums">
                      Maliyet: {formatCurrency(item.costTotal, currency)} · Birim Teklif:{' '}
                      <strong className="text-[#0B2239]">
                        {formatCurrency(item.netOfferUnitPrice, currency)}
                      </strong>
                    </div>
                    <div className="font-mono font-bold text-sm text-[#0066B3] tabular-nums">
                      Net: {formatCurrency(item.netOfferTotal, currency)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Çalışma Notları */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl p-4 sm:p-5 space-y-2">
        <label
          htmlFor="pricing-notes"
          className="block text-xs font-semibold text-[#0B2239]"
        >
          Fiyat Çalışması Varsayım ve Finansman Notları
        </label>
        <textarea
          id="pricing-notes"
          rows={3}
          maxLength={2000}
          disabled={!canManagePricing}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setIsDirty(true);
            setSaveMessage(null);
          }}
          placeholder="Örn: KDV iadesi 180 gün vade öngörüsü, gümrük/navlun koşulları, tedarikçi opsiyon tarihleri..."
          className="w-full px-3.5 py-2.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3] disabled:opacity-80"
        />
      </section>
    </div>
  );
};
