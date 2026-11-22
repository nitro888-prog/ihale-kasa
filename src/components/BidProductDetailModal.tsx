import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  ExternalLink,
  Maximize2,
  Minimize2,
  Edit3,
  Trash2,
  Lock,
  Copy,
  Check,
  Database,
  FileText,
  ArrowUpRight,
  Building2,
  Receipt,
} from 'lucide-react';
import { BidProduct, isOwnRecord, STATUS_LABELS, Tender } from '../types/tender';
import { formatCurrency, formatTurkishDate } from '../lib/trackingAndCalendar';
import { lookupItemDatabasePrices } from '../lib/productPriceMatcher';

interface BidProductDetailModalProps {
  product: BidProduct | null;
  allProducts: BidProduct[];
  tenders: Tender[];
  currentUid?: string;
  canManage?: boolean;
  canManageAccounting?: boolean;
  onClose: () => void;
  onEdit: (product: BidProduct) => void;
  onDelete: (product: BidProduct) => Promise<void> | void;
  onSelectTenderId?: (tenderId: string) => void;
  onSelectProduct?: (product: BidProduct) => void;
  onDuplicateForNewCompany?: (product: BidProduct) => void;
  onCreateAccountingEntry?: (product: BidProduct) => void;
}

export const BidProductDetailModal: React.FC<BidProductDetailModalProps> = ({
  product,
  allProducts,
  tenders,
  currentUid = '',
  canManage = true,
  canManageAccounting = false,
  onClose,
  onEdit,
  onDelete,
  onSelectTenderId,
  onSelectProduct,
  onDuplicateForNewCompany,
  onCreateAccountingEntry,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmDelete(false);
    setDeleting(false);
    setDeleteError(null);
  }, [product?.id]);

  useEffect(() => {
    if (!product) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [product, onClose]);

  const linkedTender = useMemo(() => {
    if (!product?.tenderId) return null;
    return tenders.find((t) => t.id === product.tenderId) || null;
  }, [product?.tenderId, tenders]);

  const historicalLookup = useMemo(() => {
    if (!product) return null;
    const otherProducts = allProducts.filter((p) => p.id !== product.id);
    if (otherProducts.length === 0) return null;
    return lookupItemDatabasePrices(
      {
        itemNo: product.stockNumber || product.partNumber || '1',
        productName: product.materialName,
        quantityAndUnit: '',
        requiredSpecs: [],
        complianceRisks: '',
        recommendations: [
          {
            brand: '',
            model: product.partNumber || '',
            partNumberHint: product.partNumber || product.stockNumber || '',
            segment: '',
            compatibilityLevel: '',
            rationale: '',
            verificationChecklist: '',
          },
        ],
      },
      otherProducts
    );
  }, [product, allProducts]);

  if (!product) return null;

  const canDeleteOwn = canManage && (currentUid ? isOwnRecord(product, currentUid) : true);

  const handleCopy = async (text: string, key: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleDeleteConfirmed = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(product);
      onClose();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Ürün kartı silinemedi.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B2239]/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Ürün Kartı Detay Penceresi"
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
              <span className="font-mono font-semibold text-[#FBBF24] tabular-nums">
                Stok: {product.stockNumber || '—'}
              </span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-white tabular-nums">
                Parça: {product.partNumber || '—'}
              </span>
              {product.tenderTrackingCode && (
                <>
                  <span className="text-slate-500" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono text-slate-200 tabular-nums">
                    {product.tenderTrackingCode}
                  </span>
                </>
              )}
            </div>
            <h2 className="font-display text-lg font-bold text-white mt-1 leading-snug">
              {product.materialName}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">{product.supplierCompany}</p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <a
              href={`?detail=product&id=${encodeURIComponent(product.id)}`}
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
              title={isMaximized ? 'Pencereyi Küçült' : 'Tam Ekran'}
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
            {linkedTender && onSelectTenderId && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSelectTenderId(linkedTender.id);
                }}
                className="min-h-[40px] px-3.5 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>İhale Detayını Aç ({linkedTender.trackingCode})</span>
              </button>
            )}

            {canManage && onDuplicateForNewCompany && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDuplicateForNewCompany(product);
                }}
                className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#0066B3] hover:bg-[#0066B3]/5 text-[#0066B3] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Farklı Firmadan Alım Ekle</span>
              </button>
            )}

            {canManageAccounting && onCreateAccountingEntry && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateAccountingEntry(product);
                }}
                className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#006344] text-white text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Ön Muhasebeye İşle</span>
              </button>
            )}

            {canManage && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(product);
                }}
                className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Düzenle</span>
              </button>
            )}
          </div>

          <div className="text-right">
            <div className="text-[11px] text-[#4E5D6C]">Teklif Edilen Satış Fiyatı</div>
            <div className="text-lg font-mono font-bold text-[#0066B3] tabular-nums">
              {formatCurrency(product.offeredSalePrice, product.currency)}
            </div>
          </div>
        </div>

        {/* İçerik */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Temel Ürün Alanları */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-5 border-b border-[#DCE3EC]">
            <div>
              <div className="text-xs text-[#4E5D6C]">Stok Numarası</div>
              <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums flex items-center gap-1.5">
                <span>{product.stockNumber || 'Belirtilmedi'}</span>
                {product.stockNumber && (
                  <button
                    type="button"
                    onClick={() => handleCopy(product.stockNumber, 'stock')}
                    aria-label="Stok No Kopyala"
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
                <span>{product.partNumber || 'Belirtilmedi'}</span>
                {product.partNumber && (
                  <button
                    type="button"
                    onClick={() => handleCopy(product.partNumber, 'part')}
                    aria-label="Parça No Kopyala"
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

            <div>
              <div className="text-xs text-[#4E5D6C]">Satın Alınan / Fiyat Alınan Firma</div>
              <div className="text-sm font-semibold text-[#0B2239] mt-0.5">
                {product.supplierCompany}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Fiyat Tarihi</div>
              <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums">
                {product.priceDate ? formatTurkishDate(product.priceDate) : 'Belirtilmedi'}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Alındığı Tarih</div>
              <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums">
                {product.purchaseDate ? formatTurkishDate(product.purchaseDate) : 'Belirtilmedi'}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#4E5D6C]">Teklif Edildiği Tarih</div>
              <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums">
                {product.quotedDate ? formatTurkishDate(product.quotedDate) : 'Belirtilmedi'}
              </div>
            </div>

            {linkedTender && (
              <div className="sm:col-span-2 lg:col-span-3 pt-2 border-t border-[#DCE3EC] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-[#4E5D6C]">İlişkili İhale</div>
                  <div className="text-sm font-semibold text-[#0B2239] mt-0.5">
                    <span className="font-mono text-[#0066B3] mr-1.5">
                      {linkedTender.trackingCode}
                    </span>
                    {linkedTender.title}
                  </div>
                  <div className="text-xs text-[#4E5D6C] mt-0.5">
                    {linkedTender.authority} · {STATUS_LABELS[linkedTender.status]} ·{' '}
                    {formatTurkishDate(linkedTender.tenderDate)}
                  </div>
                </div>
                {onSelectTenderId && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectTenderId(linkedTender.id);
                    }}
                    className="min-h-[38px] px-3 inline-flex items-center gap-1.5 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-xs font-semibold text-[#0B2239] rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <span>İhale Penceresine Git</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#0066B3]" />
                  </button>
                )}
              </div>
            )}

            {product.createdByName && (
              <div className="sm:col-span-2 lg:col-span-3">
                <div className="text-xs text-[#4E5D6C]">Kaydı Oluşturan</div>
                <div className="text-xs font-medium text-[#0B2239] mt-0.5">
                  {product.createdByName}
                  {product.createdByEmail ? ` (${product.createdByEmail})` : ''}
                </div>
              </div>
            )}
          </div>

          {/* Veritabanında Alınan Son 5 Fiyat Karşılaştırması */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#0066B3] shrink-0" />
                <div>
                  <h3 className="font-display text-sm font-bold text-[#0B2239]">
                    Veritabanında Benzer / Aynı Ürün İçin Alınan Son 5 Fiyat
                  </h3>
                  <p className="text-xs text-[#4E5D6C]">
                    Parça numarası, stok kodu ve malzeme adı eşleşmesine göre geçmiş kayıtlar.
                  </p>
                </div>
              </div>
              {historicalLookup && historicalLookup.currencySummaries.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-[#4E5D6C] tabular-nums">
                  {historicalLookup.currencySummaries.map((cs) => (
                    <span key={cs.currency}>
                      Son: {formatCurrency(cs.latest, cs.currency)} · Min:{' '}
                      {formatCurrency(cs.min, cs.currency)} ({cs.count} kayıt)
                    </span>
                  ))}
                </div>
              )}
            </div>

            {!historicalLookup || historicalLookup.lastFivePrices.length === 0 ? (
              <div className="p-4 border border-dashed border-[#DCE3EC] rounded-lg text-xs text-[#4E5D6C]">
                Bu ürün için veritabanında başka bir geçmiş fiyat kaydı henüz bulunmuyor.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#DCE3EC] rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F3F6FA] border-b border-[#DCE3EC] text-[11px] font-semibold text-[#4E5D6C]">
                      <th className="py-2.5 px-3">Malzeme / Parça No</th>
                      <th className="py-2.5 px-3">Fiyat Alınan Firma</th>
                      <th className="py-2.5 px-3">Tarih</th>
                      <th className="py-2.5 px-3 text-right">Fiyat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE3EC]">
                    {historicalLookup.lastFivePrices.map((m) => (
                      <tr
                        key={m.product.id}
                        onClick={() => onSelectProduct && onSelectProduct(m.product)}
                        className={
                          onSelectProduct
                            ? 'hover:bg-[#F3F6FA]/70 cursor-pointer transition-colors'
                            : ''
                        }
                      >
                        <td className="py-2.5 px-3 align-top">
                          <div className="font-medium text-[#0B2239]">
                            {m.product.materialName}
                          </div>
                          <div className="text-[11px] text-[#4E5D6C] flex flex-wrap items-center gap-x-1.5 mt-0.5">
                            <span className="font-semibold text-[#007A53]">
                              {m.matchLabel}
                            </span>
                            {m.product.partNumber && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">Parça: {m.product.partNumber}</span>
                              </>
                            )}
                            {m.product.tenderTrackingCode && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono text-[#0066B3]">
                                  {m.product.tenderTrackingCode}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 align-top text-[#0B2239]">
                          {m.product.supplierCompany}
                        </td>
                        <td className="py-2.5 px-3 align-top font-mono tabular-nums text-[11px] text-[#4E5D6C] whitespace-nowrap">
                          {m.effectiveDate ? formatTurkishDate(m.effectiveDate) : '—'}
                        </td>
                        <td className="py-2.5 px-3 align-top text-right font-mono font-bold text-[#0066B3] tabular-nums whitespace-nowrap">
                          {formatCurrency(m.product.offeredSalePrice, m.product.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Silme / Geri Dönüşüm Kutusu */}
          {canManage && (
            <div className="pt-4 border-t border-[#DCE3EC] space-y-2.5">
              {deleteError && (
                <div
                  role="alert"
                  className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium"
                >
                  {deleteError}
                </div>
              )}

              {!canDeleteOwn ? (
                <div className="p-3 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg flex items-center gap-2 text-xs text-[#4E5D6C]">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>
                    Bu ürün kartı başka bir kullanıcı ({product.createdByName || product.createdByEmail || 'ekip üyesi'}) tarafından oluşturulduğu için yalnızca oluşturan kullanıcı silebilir.
                  </span>
                </div>
              ) : !confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[40px] px-3 inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Bu Ürün Kartını Geri Dönüşüm Kutusuna Taşı</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-red-700 font-medium">
                    Ürün kartı geri dönüşüm kutusuna taşınsın mı?
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
