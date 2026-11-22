import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  FileText,
  Landmark,
  Lock,
  Maximize2,
  Minimize2,
  Trash2,
  X,
} from 'lucide-react';
import {
  ACCOUNTING_CHEQUE_DIRECTION_LABELS,
  ACCOUNTING_CHEQUE_STATUS_LABELS,
  AccountingCheque,
  AccountingChequeStatus,
  AccountingCompany,
  isOwnRecord,
  STATUS_LABELS,
  Tender,
} from '../types/tender';
import { formatCurrency, formatTurkishDate } from '../lib/trackingAndCalendar';

interface AccountingChequeDetailModalProps {
  cheque: AccountingCheque | null;
  companies: AccountingCompany[];
  tenders: Tender[];
  currentUid?: string;
  canManage?: boolean;
  onClose: () => void;
  onEdit: (cheque: AccountingCheque) => void;
  onUpdateStatus: (
    cheque: AccountingCheque,
    nextStatus: AccountingChequeStatus,
    endorsedTo?: string
  ) => Promise<void> | void;
  onDelete: (cheque: AccountingCheque) => Promise<void> | void;
  onSelectTenderId?: (tenderId: string) => void;
}

export const AccountingChequeDetailModal: React.FC<AccountingChequeDetailModalProps> = ({
  cheque,
  companies,
  tenders,
  currentUid = '',
  canManage = true,
  onClose,
  onEdit,
  onUpdateStatus,
  onDelete,
  onSelectTenderId,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmDelete(false);
    setDeleting(false);
    setUpdatingStatus(false);
    setActionError(null);
  }, [cheque?.id]);

  useEffect(() => {
    if (!cheque) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cheque, onClose]);

  const linkedTender = useMemo(() => {
    if (!cheque?.tenderId) return null;
    return tenders.find((t) => t.id === cheque.tenderId) || null;
  }, [cheque?.tenderId, tenders]);

  const linkedCompany = useMemo(() => {
    if (!cheque) return null;
    if (cheque.companyId) {
      const byId = companies.find((c) => c.id === cheque.companyId);
      if (byId) return byId;
    }
    const lower = cheque.companyName.trim().toLowerCase();
    return companies.find((c) => c.name.trim().toLowerCase() === lower) || null;
  }, [cheque, companies]);

  if (!cheque) return null;

  const canDeleteOwn = canManage && (currentUid ? isOwnRecord(cheque, currentUid) : true);
  const isCompleted =
    cheque.status === 'tahsil_edildi' ||
    cheque.status === 'odendi' ||
    cheque.status === 'iade';
  const targetCompletedStatus: AccountingChequeStatus =
    cheque.direction === 'alinan' ? 'tahsil_edildi' : 'odendi';

  const handleCopyChequeNo = async () => {
    if (!cheque.chequeNo) return;
    try {
      await navigator.clipboard.writeText(cheque.chequeNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleQuickStatus = async (nextStatus: AccountingChequeStatus) => {
    setUpdatingStatus(true);
    setActionError(null);
    try {
      await onUpdateStatus(cheque, nextStatus, cheque.endorsedTo);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Çek durumu güncellenemedi.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    setDeleting(true);
    setActionError(null);
    try {
      await onDelete(cheque);
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Çek kaydı silinemedi.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B2239]/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Çek Detay Penceresi"
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
                {ACCOUNTING_CHEQUE_DIRECTION_LABELS[cheque.direction]}
              </span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-white tabular-nums">
                Vade: {formatTurkishDate(cheque.dueDate)}
              </span>
            </div>
            <h2 className="font-display text-lg font-bold text-white mt-1 leading-snug flex items-center gap-2">
              <Landmark className="w-5 h-5 text-[#34D399] shrink-0" />
              <span className="truncate">
                {cheque.bankName} · Çek No: {cheque.chequeNo}
              </span>
            </h2>
            <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
              <span>{cheque.companyName}</span>
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <a
              href={`?detail=cheque&id=${encodeURIComponent(cheque.id)}`}
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
            {canManage && !isCompleted && (
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => handleQuickStatus(targetCompletedStatus)}
                className="min-h-[40px] px-3.5 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#006344] text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {updatingStatus
                    ? 'İşleniyor…'
                    : cheque.direction === 'alinan'
                    ? 'Tahsil Edildi İşaretle'
                    : 'Ödendi İşaretle'}
                </span>
              </button>
            )}

            {canManage &&
              cheque.status !== 'karsiliksiz' &&
              cheque.status !== 'tahsil_edildi' &&
              cheque.status !== 'odendi' && (
                <button
                  type="button"
                  disabled={updatingStatus}
                  onClick={() => handleQuickStatus('karsiliksiz')}
                  className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-700 text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Karşılıksız</span>
                </button>
              )}

            {canManage && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(cheque);
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
            <div className="text-[11px] text-[#4E5D6C]">Çek Tutarı</div>
            <div className="text-lg font-mono font-bold text-[#0066B3] tabular-nums">
              {formatCurrency(cheque.amount, cheque.currency)}
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

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-5 border-b border-[#DCE3EC]">
            <div className="col-span-2 sm:col-span-3">
              <div className="text-xs text-[#4E5D6C]">Firma Bilgisi</div>
              <div className="text-sm font-bold text-[#0B2239] mt-0.5">
                {cheque.companyName}
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
              <div className="text-xs text-[#4E5D6C]">Çek Seri / Sıra No</div>
              <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums flex items-center gap-1.5">
                <span>{cheque.chequeNo}</span>
                <button
                  type="button"
                  onClick={handleCopyChequeNo}
                  aria-label="Çek Numarasını Kopyala"
                  className="text-[#868686] hover:text-[#0B2239] cursor-pointer"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-[#007A53]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Banka &amp; Şube</div>
              <div className="text-sm font-semibold text-[#0B2239] mt-0.5">
                {cheque.bankName}
                {cheque.branchName ? ` · ${cheque.branchName}` : ''}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Çek Durumu</div>
              <div
                className={`text-sm font-bold mt-0.5 ${
                  cheque.status === 'tahsil_edildi' || cheque.status === 'odendi'
                    ? 'text-[#007A53]'
                    : cheque.status === 'karsiliksiz'
                    ? 'text-red-700'
                    : cheque.status === 'ciro_edildi' || cheque.status === 'tahsile_verildi'
                    ? 'text-[#0066B3]'
                    : cheque.status === 'iade'
                    ? 'text-[#868686]'
                    : 'text-amber-700'
                }`}
              >
                {ACCOUNTING_CHEQUE_STATUS_LABELS[cheque.status]}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Vade Tarihi</div>
              <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums">
                {formatTurkishDate(cheque.dueDate)}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Keşide Tarihi</div>
              <div className="text-sm font-mono text-[#0B2239] mt-0.5 tabular-nums">
                {cheque.issueDate ? formatTurkishDate(cheque.issueDate) : 'Belirtilmedi'}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Keşideci (Düzenleyen)</div>
              <div className="text-sm text-[#0B2239] mt-0.5">
                {cheque.drawerName || cheque.companyName}
              </div>
            </div>

            {cheque.endorsedTo && (
              <div className="col-span-2 sm:col-span-3">
                <div className="text-xs text-[#4E5D6C]">Ciro Edilen Firma / Kişi</div>
                <div className="text-sm font-semibold text-[#0066B3] mt-0.5">
                  {cheque.endorsedTo}
                </div>
              </div>
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

            {cheque.notes && (
              <div className="col-span-2 sm:col-span-3 pt-2 border-t border-[#DCE3EC]">
                <div className="text-xs text-[#4E5D6C]">Çek Notları</div>
                <p className="text-sm text-[#0B2239] whitespace-pre-wrap mt-1">{cheque.notes}</p>
              </div>
            )}

            {cheque.createdByName && (
              <div className="col-span-2 sm:col-span-3">
                <div className="text-xs text-[#4E5D6C]">Kaydı Oluşturan</div>
                <div className="text-xs font-medium text-[#0B2239] mt-0.5">
                  {cheque.createdByName}
                  {cheque.createdByEmail ? ` (${cheque.createdByEmail})` : ''}
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
                    Bu çek kaydı başka bir kullanıcı ({cheque.createdByName || cheque.createdByEmail || 'ekip üyesi'}) tarafından oluşturulduğu için yalnızca oluşturan kullanıcı silebilir.
                  </span>
                </div>
              ) : !confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[40px] px-3 inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Bu Çek Kaydını Geri Dönüşüm Kutusuna Taşı</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-red-700 font-medium">
                    Çek kaydı geri dönüşüm kutusuna taşınsın mı?
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
