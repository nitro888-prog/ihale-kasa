import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckSquare,
  Copy,
  Eye,
  MapPin,
  ShieldCheck,
  Square,
  Upload,
  Zap,
  FolderCheck,
  Clock,
} from 'lucide-react';
import {
  ActorIdentity,
  CHECKLIST_ITEMS,
  COMPANY_VAULT_CATEGORY_LABELS,
  CompanyVaultDocument,
  TENDER_DOC_CATEGORY_LABELS,
  Tender,
  TenderChecklist,
  TenderDocCategory,
  TenderDocument,
} from '../types/tender';
import {
  formatBytes,
  formatCurrency,
  formatTurkishDate,
  getDaysDifference,
  getRelativeDayLabel,
  getTodayDateStr,
} from '../lib/trackingAndCalendar';
import {
  downloadCompanyVaultBlob,
  downloadTenderDocumentBlob,
  subscribeTenderDocuments,
  updateTenderChecklist,
  uploadTenderDocument,
} from '../services/firestoreService';
import { PreviewTarget } from './DocumentPreviewModal';

interface TenderDayViewProps {
  uid: string;
  workspaceOwnerId: string;
  actor?: ActorIdentity;
  memberIds?: string[];
  tenders: Tender[];
  companyVault: CompanyVaultDocument[];
  initialTenderId?: string | null;
  canEditTender?: boolean;
  canManageVault?: boolean;
  onPreview: (target: PreviewTarget) => void;
  onSelectTenderDetail: (tender: Tender) => void;
}

export const TenderDayView: React.FC<TenderDayViewProps> = ({
  uid,
  workspaceOwnerId,
  actor,
  memberIds,
  tenders,
  companyVault,
  initialTenderId,
  canEditTender = true,
  canManageVault = true,
  onPreview,
  onSelectTenderDetail,
}) => {
  const todayStr = getTodayDateStr();
  const activeTenders = tenders.filter((t) => t.status !== 'iptal');

  const defaultTender =
    activeTenders.find((t) => t.id === initialTenderId) ||
    activeTenders.find((t) => t.tenderDate === todayStr) ||
    activeTenders.find((t) => getDaysDifference(t.tenderDate) >= 0) ||
    activeTenders[0] ||
    null;

  const [selectedId, setSelectedId] = useState<string>(defaultTender?.id || '');
  const [tenderDocs, setTenderDocs] = useState<TenderDocument[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [quickCategory, setQuickCategory] = useState<TenderDocCategory>('teklif_mektubu');
  const [nowTick, setNowTick] = useState(() => new Date());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialTenderId) {
      setSelectedId(initialTenderId);
    }
  }, [initialTenderId]);

  useEffect(() => {
    if (!selectedId && defaultTender) {
      setSelectedId(defaultTender.id);
    }
  }, [selectedId, defaultTender]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const selectedTender =
    activeTenders.find((t) => t.id === selectedId) || defaultTender;

  useEffect(() => {
    if (!selectedTender) {
      setTenderDocs([]);
      return;
    }
    const unsub = subscribeTenderDocuments(
      uid,
      workspaceOwnerId,
      selectedTender.id,
      setTenderDocs
    );
    return () => unsub();
  }, [uid, workspaceOwnerId, selectedTender?.id]);

  if (!selectedTender) {
    return (
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-10 text-center max-w-xl mx-auto">
        <h2 className="font-display text-lg font-bold text-[#0B2239]">İhale Günü Modu</h2>
        <p className="text-sm text-[#4E5D6C] mt-2">
          İhale günü geldiğinde komisyon başında tüm evraklarınıza ulaşabilmek için önce bir ihale
          kaydı oluşturun.
        </p>
      </div>
    );
  }

  const isLocked =
    selectedTender.status === 'sonuclandi' || selectedTender.status === 'iptal';

  const getCountdownText = (): string => {
    const [y, m, d] = selectedTender.tenderDate.split('-').map(Number);
    const [hh, mm] = (selectedTender.tenderTime || '10:00').split(':').map(Number);
    const target = new Date(y, (m || 1) - 1, d || 1, hh || 10, mm || 0, 0);
    const diffMs = target.getTime() - nowTick.getTime();
    if (diffMs <= 0) {
      return 'İhale Saati Geldi / Geçti';
    }
    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const mins = totalMinutes % 60;
    if (days > 0) return `${days} gün ${hours} saat kaldı`;
    return `${hours} sa ${mins} dk kaldı`;
  };

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // Ignore
    }
  };

  const handleToggleChecklist = async (key: keyof TenderChecklist) => {
    if (isLocked || !canEditTender) return;
    await updateTenderChecklist(selectedTender.id, {
      ...selectedTender.checklist,
      [key]: !selectedTender.checklist[key],
    });
  };

  const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canManageVault) return;
    setUploading(true);
    try {
      await uploadTenderDocument(
        workspaceOwnerId,
        selectedTender.id,
        file,
        quickCategory,
        'İhale günü hızlı yükleme',
        memberIds,
        actor
      );
      if (fileRef.current) fileRef.current.value = '';
    } finally {
      setUploading(false);
    }
  };

  const doneChecklist = CHECKLIST_ITEMS.filter(
    (i) => selectedTender.checklist?.[i.key]
  ).length;
  const isToday = selectedTender.tenderDate === todayStr;

  return (
    <div className="space-y-6">
      {/* İhale Seçici Bar */}
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#0B2239]">
          <Zap className="w-4 h-4 text-[#0066B3] shrink-0" />
          <span>İhale Günü Saha &amp; Komisyon Erişim Ekranı</span>
        </div>
        <select
          value={selectedTender.id}
          onChange={(e) => setSelectedId(e.target.value)}
          aria-label="İhale Seçin"
          className="w-full sm:w-96 min-h-[44px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-sm font-medium text-[#0B2239]"
        >
          {activeTenders.map((t) => (
            <option key={t.id} value={t.id}>
              {t.trackingCode} — {formatTurkishDate(t.tenderDate)} · {t.title}
            </option>
          ))}
        </select>
      </div>

      {/* Yüksek Kontrastlı İhale Günü Komuta Kartı (#0B2239) */}
      <section className="bg-[#0B2239] text-white rounded-xl p-5 sm:p-7 space-y-5 border border-[#143252]">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
              <span className="font-mono font-bold text-[#FBBF24] tabular-nums">
                {selectedTender.trackingCode}
              </span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className={isToday ? 'text-[#FBBF24] font-semibold' : 'text-slate-300'}>
                {getRelativeDayLabel(selectedTender.tenderDate)}
              </span>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="inline-flex items-center gap-1 text-slate-200 font-mono tabular-nums">
                <Clock className="w-3.5 h-3.5 text-[#34D399]" />
                {getCountdownText()}
              </span>
            </div>

            <h1 className="font-display text-xl sm:text-2xl font-bold text-white leading-snug">
              {selectedTender.title}
            </h1>
            <p className="text-sm text-slate-300">{selectedTender.authority}</p>
          </div>

          <button
            type="button"
            onClick={() => onSelectTenderDetail(selectedTender)}
            className="min-h-[44px] px-4 py-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer shrink-0 whitespace-nowrap transition-colors"
          >
            İhale Dosya Detayı
          </button>
        </div>

        {/* Tek Dokunuşla Kopyalama ve Özet Satırı */}
        <div className="pt-4 border-t border-[#143252] grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => handleCopy(selectedTender.trackingCode, 'code')}
            className="min-h-[48px] px-4 py-2.5 bg-[#143252] hover:bg-[#2A4D61] border border-[#1E4063] rounded-lg flex items-center justify-between text-left cursor-pointer"
          >
            <div>
              <div className="text-[11px] text-slate-300">Takip Numarası</div>
              <div className="text-sm font-mono font-bold text-white tabular-nums">
                {selectedTender.trackingCode}
              </div>
            </div>
            {copiedField === 'code' ? (
              <Check className="w-4 h-4 text-[#34D399] shrink-0" />
            ) : (
              <Copy className="w-4 h-4 text-slate-300 shrink-0" />
            )}
          </button>

          <button
            type="button"
            onClick={() => selectedTender.ikn && handleCopy(selectedTender.ikn, 'ikn')}
            disabled={!selectedTender.ikn}
            className="min-h-[48px] px-4 py-2.5 bg-[#143252] hover:bg-[#2A4D61] border border-[#1E4063] rounded-lg flex items-center justify-between text-left cursor-pointer disabled:opacity-60"
          >
            <div>
              <div className="text-[11px] text-slate-300">Resmi İKN</div>
              <div className="text-sm font-mono font-bold text-white tabular-nums">
                {selectedTender.ikn || 'Tanımsız'}
              </div>
            </div>
            {copiedField === 'ikn' ? (
              <Check className="w-4 h-4 text-[#34D399] shrink-0" />
            ) : (
              <Copy className="w-4 h-4 text-slate-300 shrink-0" />
            )}
          </button>

          <div className="min-h-[48px] px-4 py-2.5 bg-[#143252] border border-[#1E4063] rounded-lg flex flex-col justify-center">
            <div className="text-[11px] text-slate-300">Tarih, Saat &amp; Teminat</div>
            <div className="text-xs sm:text-sm font-mono font-semibold text-white tabular-nums mt-0.5">
              {formatTurkishDate(selectedTender.tenderDate)} · {selectedTender.tenderTime} ·{' '}
              {formatCurrency(selectedTender.bidBondAmount, selectedTender.currency)}
            </div>
          </div>
        </div>

        {selectedTender.location && (
          <div className="flex items-start gap-2 text-xs text-slate-200">
            <MapPin className="w-4 h-4 text-[#FBBF24] shrink-0 mt-0.5" />
            <span>Teslim / Komisyon Yeri: {selectedTender.location}</span>
          </div>
        )}
      </section>

      {/* İhale Günü Birleşik Dokümanlar ve Kontrol Listesi */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* İhaleye Özel Dokümanlar + Firma Sabit Evrakları (Birleşik Çanta) */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#DCE3EC] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-[#0B2239]">
                  İhale Dosyası Dokümanları ({tenderDocs.length})
                </h2>
                <p className="text-xs text-[#4E5D6C]">
                  Tek dokunuşla önizleyin, indirin veya mobil cihazdan paylaşın
                </p>
              </div>

              {canManageVault && (
                <div className="flex items-center gap-2">
                  <select
                    value={quickCategory}
                    onChange={(e) => setQuickCategory(e.target.value as TenderDocCategory)}
                    className="min-h-[40px] px-2.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
                  >
                    {(Object.keys(TENDER_DOC_CATEGORY_LABELS) as TenderDocCategory[]).map(
                      (k) => (
                        <option key={k} value={k}>
                          {TENDER_DOC_CATEGORY_LABELS[k]}
                        </option>
                      )
                    )}
                  </select>
                  <input
                    ref={fileRef}
                    type="file"
                    id="tender-day-quick-upload"
                    onChange={handleQuickUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                  <label
                    htmlFor="tender-day-quick-upload"
                    className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploading ? 'Yükleniyor…' : 'Hızlı Yükle'}</span>
                  </label>
                </div>
              )}
            </div>

            {tenderDocs.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#4E5D6C]">
                {canManageVault
                  ? 'Bu ihale için henüz dosya yüklenmemiş. Sağ üstten anında dosya ekleyebilirsiniz.'
                  : 'Bu ihale için henüz yüklenmiş bir doküman bulunmuyor.'}
              </div>
            ) : (
              <div className="divide-y divide-[#DCE3EC]">
                {tenderDocs.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() =>
                      onPreview({
                        name: d.name,
                        mimeType: d.mimeType,
                        sizeBytes: d.sizeBytes,
                        sha256: d.sha256,
                        categoryLabel: TENDER_DOC_CATEGORY_LABELS[d.category],
                        loadBlob: () =>
                          downloadTenderDocumentBlob(
                            uid,
                            workspaceOwnerId,
                            selectedTender.id,
                            d
                          ),
                      })
                    }
                    className="w-full min-h-[60px] px-5 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-[#F3F6FA]/70 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#0B2239] truncate">
                        {d.name}
                      </div>
                      <div className="text-xs text-[#4E5D6C] mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span>{TENDER_DOC_CATEGORY_LABELS[d.category]}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{formatBytes(d.sizeBytes)}</span>
                        <span aria-hidden="true">·</span>
                        <span className={d.verified ? 'text-[#007A53] font-semibold' : 'text-amber-700'}>
                          {d.verified ? 'Onaylı Evrak' : 'Kontrol Bekliyor'}
                        </span>
                      </div>
                    </div>
                    <span className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg shrink-0">
                      <Eye className="w-4 h-4" />
                      <span>Aç</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Firma Sabit Evrakları (İhale Gününde Hazır) */}
          <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#DCE3EC] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderCheck className="w-4 h-4 text-[#0066B3]" />
                <div>
                  <h2 className="font-display text-base font-bold text-[#0B2239]">
                    Firma Sabit Evrakları ({companyVault.length})
                  </h2>
                  <p className="text-xs text-[#4E5D6C]">
                    İmza sirküleri, vergi levhası ve yeterlik belgeleriniz her ihalede hazır
                  </p>
                </div>
              </div>
            </div>

            {companyVault.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#4E5D6C]">
                Doküman Kasası sekmesinden firma sabit belgelerinizi (İmza Sirküleri, Oda Kaydı vb.)
                eklediğinizde ihale gününde burada tek dokunuşla açılır.
              </div>
            ) : (
              <div className="divide-y divide-[#DCE3EC]">
                {companyVault.map((cv) => (
                  <button
                    key={cv.id}
                    type="button"
                    onClick={() =>
                      onPreview({
                        name: cv.name,
                        mimeType: cv.mimeType,
                        sizeBytes: cv.sizeBytes,
                        sha256: cv.sha256,
                        categoryLabel: COMPANY_VAULT_CATEGORY_LABELS[cv.category],
                        loadBlob: () => downloadCompanyVaultBlob(uid, workspaceOwnerId, cv),
                      })
                    }
                    className="w-full min-h-[56px] px-5 py-3 flex items-center justify-between gap-4 text-left hover:bg-[#F3F6FA]/70 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#0B2239] truncate">
                        {cv.name}
                      </div>
                      <div className="text-xs text-[#4E5D6C] mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span>{COMPANY_VAULT_CATEGORY_LABELS[cv.category]}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{formatBytes(cv.sizeBytes)}</span>
                        {cv.expiryDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              Geçerlilik: {formatTurkishDate(cv.expiryDate)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg shrink-0">
                      <Eye className="w-4 h-4" />
                      <span>Aç</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sağ Kolon: İhale Günü Son Kontrol Listesi */}
        <section className="lg:col-span-5 bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#DCE3EC] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#007A53]" />
              <h2 className="font-display text-base font-bold text-[#0B2239]">
                İhale Teslim Kontrol Listesi
              </h2>
            </div>
            <span className="text-xs font-mono font-bold text-[#0B2239] tabular-nums">
              {doneChecklist}/{CHECKLIST_ITEMS.length}
            </span>
          </div>

          <div className="divide-y divide-[#DCE3EC]">
            {CHECKLIST_ITEMS.map((item) => {
              const checked = Boolean(selectedTender.checklist?.[item.key]);
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={isLocked || !canEditTender}
                  onClick={() => handleToggleChecklist(item.key)}
                  className="w-full min-h-[56px] px-5 py-3.5 flex items-start gap-3.5 text-left hover:bg-[#F3F6FA]/70 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {checked ? (
                    <CheckSquare className="w-5 h-5 text-[#007A53] shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-5 h-5 text-[#868686] shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div
                      className={`text-sm font-medium ${
                        checked ? 'text-[#868686] line-through' : 'text-[#0B2239]'
                      }`}
                    >
                      {item.label}
                    </div>
                    <div className="text-xs text-[#4E5D6C] mt-0.5">{item.hint}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
