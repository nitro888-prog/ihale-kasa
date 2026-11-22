import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Copy,
  Check,
  Edit3,
  ExternalLink,
  FileText,
  Lock,
  Maximize2,
  Minimize2,
  Trash2,
  X,
} from 'lucide-react';
import {
  ACCOUNTING_ENTRY_TYPE_LABELS,
  ACCOUNTING_PAYMENT_METHOD_LABELS,
  ACCOUNTING_PAYMENT_STATUS_LABELS,
  AccountingCompany,
  AccountingEntry,
  isOwnRecord,
  STATUS_LABELS,
  Tender,
} from '../types/tender';
import { formatCurrency, formatTurkishDate } from '../lib/trackingAndCalendar';

interface AccountingEntryDetailModalProps {
  entry: AccountingEntry | null;
  companies: AccountingCompany[];
  tenders: Tender[];
  currentUid?: string;
  canManage?: boolean;
  onClose: () => void;
  onEdit: (entry: AccountingEntry) => void;
  onMarkPaid: (entry: AccountingEntry) => Promise<void> | void;
  onDelete: (entry: AccountingEntry) => Promise<void> | void;
  onSelectTenderId?: (tenderId: string) => void;
}

export const AccountingEntryDetailModal: React.FC<AccountingEntryDetailModalProps> = ({
  entry,
  companies,
  tenders,
  currentUid = '',
  canManage = true,
  onClose,
  onEdit,
  onMarkPaid,
  onDelete,
  onSelectTenderId,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmDelete(false);
    setDeleting(false);
    setMarkingPaid(false);
    setActionError(null);
  }, [entry?.id]);

  useEffect(() => {
    if (!entry) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [entry, onClose]);

  const linkedTender = useMemo(() => {
    if (!entry?.tenderId) return null;
    return tenders.find((t) => t.id === entry.tenderId) || null;
  }, [entry?.tenderId, tenders]);

  const linkedCompany = useMemo(() => {
    if (!entry) return null;
    if (entry.companyId) {
      const byId = companies.find((c) => c.id === entry.companyId);
      if (byId) return byId;
    }
    const lower = entry.companyName.trim().toLowerCase();
    return companies.find((c) => c.name.trim().toLowerCase() === lower) || null;
  }, [entry, companies]);

  if (!entry) return null;

  const canDeleteOwn = canManage && (currentUid ? isOwnRecord(entry, currentUid) : true);
  const remainingAmount = Math.max(0, entry.totalAmount - (entry.paidAmount || 0));

  const handleCopy = async (text: string, key: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleMarkPaidConfirmed = async () => {
    setMarkingPaid(true);
    setActionError(null);
    try {
      await onMarkPaid(entry);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Ödeme durumu güncellenemedi.');
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    setDeleting(true);
    setActionError(null);
    try {
      await onDelete(entry);
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Muhasebe kaydı silinemedi.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B2239]/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Ön Muhasebe Kayıt Detay Penceresi"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-white border border-[#DCE3EC] shadow-2xl flex flex-col overflow-hidden transition-all ${
          isMaximized
            ? 'w-full h-full max-w-none rounded-none'
            : 'w-full max-w-3xl max-h-[90vh] rounded-2xl'
        }`}
      >
        {/* Pencere Başlığı */}
        <div className="px-5 py-4 bg-[#0B2239] text-white border-b-2 border-[#007A53] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-300">
              <span className="font-semibold text-[#FBBF24]">
                {ACCOUNTING_ENTRY_TYPE_LABELS[entry.entryType]}
              </span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-white tabular-nums">
                {formatTurkishDate(entry.entryDate)}
              </span>
              {entry.invoiceNo && (
                <>
                  <span className="text-slate-500" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono text-slate-200">Belge: {entry.invoiceNo}</span>
                </>
              )}
            </div>
            <h2 className="font-display text-lg font-bold text-white mt-1 leading-snug">
              {entry.title}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
              <span>{entry.companyName}</span>
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <a
              href={`?detail=accounting&id=${encodeURIComponent(entry.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Yeni Tarayıcı Sekmesinde Aç"
              className="min-h-[40px] px-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-[#143252] rounded-lg whitespace-nowrap transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Yeni Sekmede Aç</span>
            </a>
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              aria-label={isMaximized ? 'Pencereyi Küçült' : 'Pencereyi Büyüt'}
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#143252] rounded-lg cursor-pointer transition-colors"
            >
              {isMaximized ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#143252] rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* İşlem Çubuğu */}
        <div className="px-5 py-3 bg-[#F3F6FA] border-b border-[#DCE3EC] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {canManage &&
              (entry.paymentStatus === 'bekliyor' || entry.paymentStatus === 'kismi') && (
                <button
                  type="button"
                  disabled={markingPaid}
                  onClick={handleMarkPaidConfirmed}
                  className="min-h-[40px] px-3.5 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#006344] text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{markingPaid ? 'İşleniyor…' : 'Ödendi Olarak İşaretle'}</span>
                </button>
              )}

            {canManage && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(entry);
                }}
                className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Düzenle</span>
              </button>
            )}

            {linkedTender && onSelectTenderId && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSelectTenderId(linkedTender.id);
                }}
                className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-[#0066B3]" />
                <span>İhaleyi Aç ({linkedTender.trackingCode})</span>
              </button>
            )}
          </div>

          <div className="text-right">
            <div className="text-[11px] text-[#4E5D6C]">Genel Toplam (KDV Dahil)</div>
            <div className="text-lg font-mono font-bold text-[#0066B3] tabular-nums">
              {formatCurrency(entry.totalAmount, entry.currency)}
            </div>
          </div>
        </div>

        {/* İçerik */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {actionError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium"
            >
              {actionError}
            </div>
          )}

          {/* Temel Muhasebe Bilgileri */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-5 border-b border-[#DCE3EC]">
            <div className="col-span-2 sm:col-span-3">
              <div className="text-xs text-[#4E5D6C]">Firma Bilgisi</div>
              <div className="text-sm font-bold text-[#0B2239] mt-0.5">
                {entry.companyName}
              </div>
              {linkedCompany && (
                <div className="text-xs text-[#4E5D6C] mt-0.5 flex flex-wrap items-center gap-x-2">
                  {linkedCompany.taxOffice && <span>{linkedCompany.taxOffice}</span>}
                  {linkedCompany.taxNumber && (
                    <span className="font-mono">VKN: {linkedCompany.taxNumber}</span>
                  )}
                  {linkedCompany.phone && (
                    <span className="font-mono">{linkedCompany.phone}</span>
                  )}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Ödeme Durumu</div>
              <div
                className={`text-sm font-bold mt-0.5 ${
                  entry.paymentStatus === 'odendi'
                    ? 'text-[#007A53]'
                    : entry.paymentStatus === 'iptal'
                    ? 'text-[#868686]'
                    : entry.paymentStatus === 'kismi'
                    ? 'text-[#0066B3]'
                    : 'text-amber-700'
                }`}
              >
                {ACCOUNTING_PAYMENT_STATUS_LABELS[entry.paymentStatus]}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Ödeme Yöntemi</div>
              <div className="text-sm font-medium text-[#0B2239] mt-0.5">
                {ACCOUNTING_PAYMENT_METHOD_LABELS[entry.paymentMethod]}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Vade Tarihi</div>
              <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums">
                {entry.dueDate ? formatTurkishDate(entry.dueDate) : 'Belirtilmedi'}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Miktar &amp; Birim Fiyat</div>
              <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums">
                {entry.quantity} {entry.unit} × {formatCurrency(entry.unitPrice, entry.currency)}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Ara Toplam / KDV (%{entry.vatRate})</div>
              <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums">
                {formatCurrency(entry.subtotalAmount, entry.currency)} +{' '}
                {formatCurrency(entry.vatAmount, entry.currency)}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Ödenen / Kalan Bakiye</div>
              <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums">
                {formatCurrency(entry.paidAmount || 0, entry.currency)} /{' '}
                <span className={remainingAmount > 0 ? 'text-amber-700' : 'text-[#007A53]'}>
                  {formatCurrency(remainingAmount, entry.currency)}
                </span>
              </div>
            </div>

            {(entry.stockNumber || entry.partNumber) && (
              <>
                <div>
                  <div className="text-xs text-[#4E5D6C]">Stok Numarası</div>
                  <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums flex items-center gap-1.5">
                    <span>{entry.stockNumber || '—'}</span>
                    {entry.stockNumber && (
                      <button
                        type="button"
                        onClick={() => handleCopy(entry.stockNumber, 'stock')}
                        className="text-[#868686] hover:text-[#0B2239] cursor-pointer"
                      >
                        {copiedKey === 'stock' ? (
                          <Check className="w-3.5 h-3.5 text-[#007A53]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#4E5D6C]">Parça Numarası</div>
                  <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums flex items-center gap-1.5">
                    <span>{entry.partNumber || '—'}</span>
                    {entry.partNumber && (
                      <button
                        type="button"
                        onClick={() => handleCopy(entry.partNumber, 'part')}
                        className="text-[#868686] hover:text-[#0B2239] cursor-pointer"
                      >
                        {copiedKey === 'part' ? (
                          <Check className="w-3.5 h-3.5 text-[#007A53]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {linkedTender && (
              <div className="col-span-2 sm:col-span-3 pt-2 border-t border-[#DCE3EC] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-[#4E5D6C]">İlişkili İhale</div>
                  <div className="text-sm font-semibold text-[#0B2239] mt-0.5">
                    <span className="font-mono text-[#0066B3] mr-1.5">
                      {linkedTender.trackingCode}
                    </span>
                    {linkedTender.title}
                  </div>
                  <div className="text-xs text-[#4E5D6C] mt-0.5">
                    {linkedTender.authority} · {STATUS_LABELS[linkedTender.status]}
                  </div>
                </div>
                {onSelectTenderId && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectTenderId(linkedTender.id);
                    }}
                    className="min-h-[38px] px-3 inline-flex items-center gap-1.5 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-xs font-semibold text-[#0B2239] rounded-lg cursor-pointer"
                  >
                    <span>İhaleyi Aç</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#0066B3]" />
                  </button>
                )}
              </div>
            )}

            {entry.notes && (
              <div className="col-span-2 sm:col-span-3 pt-2 border-t border-[#DCE3EC]">
                <div className="text-xs text-[#4E5D6C]">Muhasebe Notları</div>
                <p className="text-sm text-[#0B2239] whitespace-pre-wrap mt-1">{entry.notes}</p>
              </div>
            )}

            {entry.createdByName && (
              <div className="col-span-2 sm:col-span-3">
                <div className="text-xs text-[#4E5D6C]">Kaydı Oluşturan</div>
                <div className="text-xs font-medium text-[#0B2239] mt-0.5">
                  {entry.createdByName}
                  {entry.createdByEmail ? ` (${entry.createdByEmail})` : ''}
                </div>
              </div>
            )}
          </div>

          {/* Silme / Geri Dönüşüm Kutusu */}
          {canManage && (
            <div className="space-y-2.5">
              {!canDeleteOwn ? (
                <div className="p-3 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg flex items-center gap-2 text-xs text-[#4E5D6C]">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>
                    Bu muhasebe kaydı başka bir kullanıcı ({entry.createdByName || entry.createdByEmail || 'ekip üyesi'}) tarafından oluşturulduğu için yalnızca oluşturan kullanıcı silebilir.
                  </span>
                </div>
              ) : !confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[40px] px-3 inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Bu Muhasebe Kaydını Geri Dönüşüm Kutusuna Taşı</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-red-700 font-medium">
                    Muhasebe kaydı geri dönüşüm kutusuna taşınsın mı?
                  </span>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDeleteConfirmed}
                    className="min-h-[38px] px-3 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60"
                  >
                    {deleting ? 'Taşınıyor…' : 'Evet, Sil'}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[38px] px-3 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs rounded-lg cursor-pointer"
                  >
                    Vazgeç
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
