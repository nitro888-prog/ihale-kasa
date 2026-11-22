import React, { useMemo, useState } from 'react';
import {
  Trash2,
  RotateCcw,
  Eye,
  Search,
  UserCheck,
  Clock,
  Lock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileText,
  FolderLock,
  FileSpreadsheet,
  Package,
  Building2,
  Receipt,
  Landmark,
  Briefcase,
} from 'lucide-react';
import {
  ActorIdentity,
  RECYCLE_BIN_ENTITY_LABELS,
  RecycleBinEntityType,
  RecycleBinItem,
  Tender,
} from '../types/tender';
import { formatBytes, formatCurrency } from '../lib/trackingAndCalendar';
import {
  downloadRecycleBinBlob,
  permanentlyDeleteRecycleBinItem,
  restoreRecycleBinItem,
} from '../services/firestoreService';
import { PreviewTarget } from './DocumentPreviewModal';

interface RecycleBinViewProps {
  uid: string;
  workspaceOwnerId: string;
  actor: ActorIdentity;
  memberIds?: string[];
  items: RecycleBinItem[];
  tenders: Tender[];
  onPreview: (target: PreviewTarget) => void;
}

type TrashFilter = 'all' | RecycleBinEntityType;

function formatTimestampTr(ts: unknown): string {
  if (!ts) return 'Az önce';
  const seconds =
    typeof (ts as { seconds?: number })?.seconds === 'number'
      ? (ts as { seconds: number }).seconds
      : null;
  if (seconds === null) return 'Az önce';
  const d = new Date(seconds * 1000);
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

const ENTITY_ICON: Record<RecycleBinEntityType, React.ComponentType<{ className?: string }>> = {
  tender: FileSpreadsheet,
  tender_document: FileText,
  company_vault: FolderLock,
  bid_product: Package,
  accounting_company: Building2,
  accounting_entry: Receipt,
  accounting_cheque: Landmark,
  project: Briefcase,
  project_transaction: Receipt,
  sales_quote: FileText,
};

export const RecycleBinView: React.FC<RecycleBinViewProps> = ({
  uid,
  workspaceOwnerId,
  actor,
  memberIds,
  items,
  tenders,
  onPreview,
}) => {
  const [filter, setFilter] = useState<TrashFilter>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map: Record<TrashFilter, number> = {
      all: items.length,
      tender: 0,
      tender_document: 0,
      company_vault: 0,
      bid_product: 0,
      accounting_company: 0,
      accounting_entry: 0,
      accounting_cheque: 0,
      project: 0,
      project_transaction: 0,
      sales_quote: 0,
    };
    for (const it of items) {
      map[it.entityType] = (map[it.entityType] || 0) + 1;
    }
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== 'all' && it.entityType !== filter) return false;
      if (!q) return true;
      return (
        it.title.toLowerCase().includes(q) ||
        it.subtitle.toLowerCase().includes(q) ||
        it.deletedByName.toLowerCase().includes(q) ||
        it.deletedByEmail.toLowerCase().includes(q) ||
        it.createdByName.toLowerCase().includes(q) ||
        it.createdByEmail.toLowerCase().includes(q) ||
        it.parentTenderCode.toLowerCase().includes(q)
      );
    });
  }, [items, filter, search]);

  const handleRestore = async (item: RecycleBinItem) => {
    setBusyId(item.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await restoreRecycleBinItem(uid, workspaceOwnerId, item, actor, tenders, memberIds);
      setActionSuccess(`"${item.title}" başarıyla geri yüklendi.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Kayıt geri yüklenemedi.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePermanentDelete = async (item: RecycleBinItem) => {
    setBusyId(item.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await permanentlyDeleteRecycleBinItem(uid, workspaceOwnerId, item);
      setConfirmPurgeId(null);
      setActionSuccess(`"${item.title}" geri dönüşüm kutusundan kalıcı olarak silindi.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Kalıcı silme işlemi başarısız oldu.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#0B2239] text-[#FBBF24] flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-[#0B2239]">
              Geri Dönüşüm Kutusu ve Silme Denetim Kaydı
            </h2>
            <p className="text-xs text-[#4E5D6C] mt-1 leading-relaxed max-w-2xl">
              Her kullanıcı yalnızca kendi oluşturduğu kayıtları silebilir. Silinen ihaleler, dokümanlar ve teklif ürün kartları silenin kimliğiyle birlikte burada saklanır. Yalnızca kaydı silen kullanıcı geri yükleyebilir veya kalıcı olarak silebilir.
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] text-[#4E5D6C]">Saklanan Kayıt</div>
          <div className="text-2xl font-mono font-bold text-[#0B2239] tabular-nums">
            {items.length}
          </div>
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 font-medium"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div
          role="status"
          className="p-3.5 bg-[#007A53]/15 border border-[#007A53]/40 rounded-xl flex items-start gap-2.5 text-xs text-[#007A53] font-semibold"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'Tümü' },
                { id: 'tender', label: 'İhaleler' },
                { id: 'tender_document', label: 'İhale Dokümanları' },
                { id: 'company_vault', label: 'Sabit Evraklar' },
                { id: 'bid_product', label: 'Ürün Kartları' },
                { id: 'accounting_entry', label: 'Ön Muhasebe' },
                { id: 'accounting_cheque', label: 'Çekler' },
                { id: 'accounting_company', label: 'Cari Firmalar' },
                { id: 'project', label: 'Projeler' },
                { id: 'project_transaction', label: 'Proje Faturaları' },
                { id: 'sales_quote', label: 'Teklif / Proforma' },
              ] as { id: TrashFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                  filter === tab.id
                    ? 'bg-[#0B2239] text-white'
                    : 'bg-[#F3F6FA] text-[#4E5D6C] hover:text-[#0B2239]'
                }`}
              >
                {tab.label} ({counts[tab.id]})
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-80">
            <Search className="w-4 h-4 text-[#868686] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kayıt adı, takip no veya silen kişi ara…"
              className="w-full min-h-[42px] pl-10 pr-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
            />
          </div>
        </div>
      </div>

      {/* Items List */}
      {items.length === 0 ? (
        <div className="bg-white border border-[#DCE3EC] rounded-xl p-12 text-center space-y-2">
          <Trash2 className="w-8 h-8 text-[#868686] mx-auto" />
          <h3 className="font-display text-sm font-bold text-[#0B2239]">
            Geri Dönüşüm Kutusu Boş
          </h3>
          <p className="text-xs text-[#4E5D6C] max-w-md mx-auto">
            Bir ihale, doküman veya ürün kartı silindiğinde burada silen kullanıcının kimliğiyle güvenle arşivlenir.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#DCE3EC] rounded-xl p-10 text-center space-y-3">
          <p className="text-sm font-medium text-[#0B2239]">
            Arama veya filtre kriterlerine uygun silinmiş kayıt bulunamadı.
          </p>
          <button
            type="button"
            onClick={() => {
              setFilter('all');
              setSearch('');
            }}
            className="min-h-[40px] px-4 py-2 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-xs font-semibold text-[#0B2239] rounded-lg cursor-pointer"
          >
            Filtreleri Sıfırla
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#DCE3EC] rounded-xl divide-y divide-[#DCE3EC] overflow-hidden">
          {filtered.map((item) => {
            const Icon = ENTITY_ICON[item.entityType] || FileText;
            const isDeleter = item.deletedBy === uid;
            const isBusy = busyId === item.id;
            const p = item.payload || {};
            const hasBinary = item.chunkCount > 0;

            return (
              <div
                key={item.id}
                className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#F3F6FA]/40 transition-colors"
              >
                <div className="min-w-0 space-y-2">
                  {/* Top Metadata Badges */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-[#0B2239]/10 text-[#0B2239] font-semibold rounded-md">
                      <Icon className="w-3.5 h-3.5 text-[#0066B3]" />
                      <span>{RECYCLE_BIN_ENTITY_LABELS[item.entityType]}</span>
                    </span>

                    {item.parentTenderCode && (
                      <span className="font-mono font-semibold text-[#0066B3] tabular-nums">
                        Takip: {item.parentTenderCode}
                      </span>
                    )}

                    {hasBinary && typeof p.sizeBytes === 'number' && (
                      <span className="font-mono text-[#4E5D6C] tabular-nums">
                        {formatBytes(p.sizeBytes)}
                      </span>
                    )}

                    {item.entityType === 'bid_product' &&
                      typeof p.offeredSalePrice === 'number' && (
                        <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
                          {formatCurrency(
                            p.offeredSalePrice,
                            (p.currency as 'TRY' | 'USD' | 'EUR') || 'TRY'
                          )}
                        </span>
                      )}

                    {item.entityType === 'accounting_entry' &&
                      typeof p.totalAmount === 'number' && (
                        <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
                          {formatCurrency(
                            p.totalAmount,
                            (p.currency as 'TRY' | 'USD' | 'EUR') || 'TRY'
                          )}
                        </span>
                      )}

                    {item.entityType === 'accounting_cheque' &&
                      typeof p.amount === 'number' && (
                        <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
                          {formatCurrency(
                            p.amount,
                            (p.currency as 'TRY' | 'USD' | 'EUR') || 'TRY'
                          )}
                        </span>
                      )}

                    {item.entityType === 'project_transaction' &&
                      typeof p.totalAmount === 'number' && (
                        <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
                          {formatCurrency(
                            p.totalAmount,
                            (p.currency as 'TRY' | 'USD' | 'EUR') || 'TRY'
                          )}
                        </span>
                      )}

                    {item.entityType === 'project' &&
                      typeof p.contractAmount === 'number' && (
                        <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
                          {formatCurrency(
                            p.contractAmount,
                            (p.currency as 'TRY' | 'USD' | 'EUR') || 'TRY'
                          )}
                        </span>
                      )}

                    {item.entityType === 'sales_quote' &&
                      typeof p.grandTotal === 'number' && (
                        <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
                          {formatCurrency(
                            p.grandTotal,
                            (p.currency as 'TRY' | 'USD' | 'EUR') || 'TRY'
                          )}
                        </span>
                      )}
                  </div>

                  {/* Title & Subtitle */}
                  <div>
                    <h3 className="text-sm font-bold text-[#0B2239] leading-snug">
                      {item.title}
                    </h3>
                    {item.subtitle && (
                      <p className="text-xs text-[#4E5D6C] mt-0.5">{item.subtitle}</p>
                    )}
                  </div>

                  {/* Deleter & Creator Audit Trail */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-1">
                    <div className="inline-flex items-center gap-1.5 text-red-700 font-semibold">
                      <UserCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Silen: {item.deletedByName || 'Kullanıcı'}{' '}
                        <span className="font-normal text-[#4E5D6C]">
                          ({item.deletedByEmail})
                        </span>
                      </span>
                    </div>

                    <div className="inline-flex items-center gap-1 text-[#4E5D6C]">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>{formatTimestampTr(item.deletedAt)}</span>
                    </div>

                    {item.createdByName && (
                      <div className="text-[#4E5D6C]">
                        Oluşturan: <span className="font-medium text-[#0B2239]">{item.createdByName}</span>
                        {item.createdByEmail ? ` (${item.createdByEmail})` : ''}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {hasBinary && (
                    <button
                      type="button"
                      onClick={() =>
                        onPreview({
                          name: String(p.name || item.title),
                          mimeType: String(p.mimeType || 'application/octet-stream'),
                          sizeBytes: Number(p.sizeBytes) || 0,
                          sha256: String(p.sha256 || ''),
                          categoryLabel: `${RECYCLE_BIN_ENTITY_LABELS[item.entityType]} (Silinmiş)`,
                          loadBlob: () =>
                            downloadRecycleBinBlob(uid, workspaceOwnerId, item),
                        })
                      }
                      className="min-h-[42px] px-3 inline-flex items-center gap-1.5 border border-[#DCE3EC] bg-white hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Önizle / İndir</span>
                    </button>
                  )}

                  {isDeleter ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleRestore(item)}
                        className="min-h-[42px] px-3.5 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 transition-colors"
                      >
                        {isBusy ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                        <span>Geri Yükle</span>
                      </button>

                      {confirmPurgeId !== item.id ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmPurgeId(item.id)}
                          className="min-h-[42px] px-3 inline-flex items-center gap-1.5 border border-red-200 hover:bg-red-50 text-red-700 text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Kalıcı Sil</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handlePermanentDelete(item)}
                            className="min-h-[42px] px-3 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60"
                          >
                            Evet, Kalıcı Sil
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmPurgeId(null)}
                            className="min-h-[42px] px-2.5 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs rounded-lg cursor-pointer"
                          >
                            Vazgeç
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-[11px] text-[#4E5D6C]">
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                      <span>Yalnızca silen kullanıcı geri yükleyebilir / silebilir</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
