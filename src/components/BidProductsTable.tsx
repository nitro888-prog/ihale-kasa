import React from 'react';
import {
  Building2,
  Edit3,
  ExternalLink,
  Lock,
  Maximize2,
  Receipt,
  Trash2,
} from 'lucide-react';
import { BidProduct, isOwnRecord } from '../types/tender';
import { formatCurrency, formatTurkishDate } from '../lib/trackingAndCalendar';

interface BidProductsTableProps {
  products: BidProduct[];
  currentUid?: string;
  canManage?: boolean;
  canManageAccounting?: boolean;
  showTenderColumn?: boolean;
  onView?: (product: BidProduct) => void;
  onEdit: (product: BidProduct) => void;
  onDelete: (product: BidProduct) => void;
  onSelectTenderId?: (tenderId: string) => void;
  onDuplicateForNewCompany?: (product: BidProduct) => void;
  onCreateAccountingEntry?: (product: BidProduct) => void;
}

export const BidProductsTable: React.FC<BidProductsTableProps> = ({
  products,
  currentUid = '',
  canManage = true,
  canManageAccounting = false,
  showTenderColumn = true,
  onView,
  onEdit,
  onDelete,
  onSelectTenderId,
  onDuplicateForNewCompany,
  onCreateAccountingEntry,
}) => {
  return (
    <div className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
      {/* Desktop / Tablet Tablo Görünümü */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#DCE3EC] bg-[#0B2239] text-xs font-semibold text-slate-200">
              <th className="py-3 px-4 whitespace-nowrap">Stok / Parça No</th>
              <th className="py-3 px-4">Malzeme Adı</th>
              <th className="py-3 px-4">Fiyat Alınan Firma</th>
              <th className="py-3 px-4 whitespace-nowrap">Fiyat / Alım / Teklif Tarihi</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">Teklif Edilen Fiyat</th>
              <th className="py-3 px-4 text-right whitespace-nowrap">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DCE3EC] text-sm">
            {products.map((product) => {
              const canDeleteOwn =
                canManage && (currentUid ? isOwnRecord(product, currentUid) : true);

              return (
                <tr
                  key={product.id}
                  onClick={() => onView && onView(product)}
                  className={`hover:bg-[#F3F6FA]/70 transition-colors ${
                    onView ? 'cursor-pointer' : ''
                  }`}
                >
                  <td className="py-3.5 px-4 align-top whitespace-nowrap">
                    <div className="font-mono text-xs font-semibold text-[#0B2239] tabular-nums">
                      Stok: {product.stockNumber || '—'}
                    </div>
                    <div className="font-mono text-xs text-[#4E5D6C] tabular-nums mt-0.5">
                      Parça: {product.partNumber || '—'}
                    </div>
                  </td>

                  <td className="py-3.5 px-4 align-top max-w-sm">
                    <div className="font-semibold text-[#0B2239] leading-snug">
                      {product.materialName}
                    </div>
                    <div className="text-xs text-[#4E5D6C] mt-0.5 flex flex-wrap items-center gap-x-2">
                      {showTenderColumn && product.tenderTrackingCode && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (product.tenderId && onSelectTenderId) {
                              onSelectTenderId(product.tenderId);
                            }
                          }}
                          className="font-mono font-semibold text-[#0066B3] hover:underline tabular-nums cursor-pointer"
                        >
                          {product.tenderTrackingCode}
                        </button>
                      )}
                      {showTenderColumn &&
                        product.tenderTrackingCode &&
                        product.createdByName && (
                          <span className="text-[#DCE3EC]" aria-hidden="true">
                            ·
                          </span>
                        )}
                      {product.createdByName && (
                        <span>Oluşturan: {product.createdByName}</span>
                      )}
                    </div>
                  </td>

                  <td className="py-3.5 px-4 align-top text-xs font-medium text-[#0B2239] max-w-[200px]">
                    <div className="truncate" title={product.supplierCompany}>
                      {product.supplierCompany}
                    </div>
                  </td>

                  <td className="py-3.5 px-4 align-top whitespace-nowrap font-mono text-xs text-[#4E5D6C] tabular-nums">
                    <div>
                      Fiyat:{' '}
                      <span className="text-[#0B2239] font-medium">
                        {product.priceDate ? formatTurkishDate(product.priceDate) : '—'}
                      </span>
                    </div>
                    <div className="mt-0.5">
                      Alım: {product.purchaseDate ? formatTurkishDate(product.purchaseDate) : '—'} ·
                      Teklif: {product.quotedDate ? formatTurkishDate(product.quotedDate) : '—'}
                    </div>
                  </td>

                  <td className="py-3.5 px-4 align-top text-right whitespace-nowrap font-mono text-xs font-bold text-[#0066B3] tabular-nums">
                    {formatCurrency(product.offeredSalePrice, product.currency)}
                  </td>

                  <td
                    className="py-3.5 px-4 align-top text-right whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex items-center gap-1.5">
                      {onView && (
                        <button
                          type="button"
                          onClick={() => onView(product)}
                          title="Detay Penceresi"
                          className="min-h-[36px] px-2.5 inline-flex items-center gap-1 border border-[#DCE3EC] bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap transition-colors"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>Detay</span>
                        </button>
                      )}
                      <a
                        href={`?detail=product&id=${encodeURIComponent(product.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Yeni Sekmede Aç"
                        aria-label="Ürünü Yeni Sekmede Aç"
                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] rounded-md transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      {canManage && onDuplicateForNewCompany && (
                        <button
                          type="button"
                          onClick={() => onDuplicateForNewCompany(product)}
                          title="Farklı Firmadan Alım/Fiyat Ekle"
                          aria-label="Farklı Firmadan Ekle"
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#0066B3]/10 text-[#0066B3] rounded-md cursor-pointer transition-colors"
                        >
                          <Building2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canManageAccounting && onCreateAccountingEntry && (
                        <button
                          type="button"
                          onClick={() => onCreateAccountingEntry(product)}
                          title="Ön Muhasebeye İşle"
                          aria-label="Ön Muhasebeye İşle"
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#007A53]/15 text-[#007A53] rounded-md cursor-pointer transition-colors"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEdit(product)}
                            title="Düzenle"
                            aria-label="Ürün Kartını Düzenle"
                            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] rounded-md cursor-pointer transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {canDeleteOwn ? (
                            <button
                              type="button"
                              onClick={() => onDelete(product)}
                              title="Sil"
                              aria-label="Ürün Kartını Sil"
                              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-red-50 hover:text-red-700 text-[#4E5D6C] rounded-md cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span
                              title="Yalnızca oluşturan kullanıcı silebilir"
                              className="inline-flex items-center justify-center min-w-[28px] text-[#868686]"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobil Liste Görünümü */}
      <div className="md:hidden divide-y divide-[#DCE3EC]">
        {products.map((product) => {
          const canDeleteOwn =
            canManage && (currentUid ? isOwnRecord(product, currentUid) : true);

          return (
            <div
              key={product.id}
              onClick={() => onView && onView(product)}
              className={`p-4 space-y-2.5 ${onView ? 'hover:bg-[#F3F6FA]/70 cursor-pointer' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#4E5D6C] font-mono tabular-nums">
                    <span>Stok: {product.stockNumber || '—'}</span>
                    <span aria-hidden="true">·</span>
                    <span>Parça: {product.partNumber || '—'}</span>
                    {showTenderColumn && product.tenderTrackingCode && (
                      <>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (product.tenderId && onSelectTenderId) {
                              onSelectTenderId(product.tenderId);
                            }
                          }}
                          className="font-semibold text-[#0066B3] hover:underline cursor-pointer"
                        >
                          {product.tenderTrackingCode}
                        </button>
                      </>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-[#0B2239] mt-1">
                    {product.materialName}
                  </div>
                  <div className="text-xs text-[#4E5D6C] mt-0.5">{product.supplierCompany}</div>
                </div>
                <div className="text-right shrink-0 font-mono text-sm font-bold text-[#0066B3] tabular-nums">
                  {formatCurrency(product.offeredSalePrice, product.currency)}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="text-[11px] font-mono text-[#4E5D6C] tabular-nums">
                  Fiyat: {product.priceDate ? formatTurkishDate(product.priceDate) : '—'}
                </div>
                <div
                  className="flex items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {onView && (
                    <button
                      type="button"
                      onClick={() => onView(product)}
                      className="min-h-[36px] px-2.5 inline-flex items-center gap-1 bg-[#0B2239] text-white text-xs font-semibold rounded-md cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Detay</span>
                    </button>
                  )}
                  <a
                    href={`?detail=product&id=${encodeURIComponent(product.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Yeni Sekmede Aç"
                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] text-[#4E5D6C] rounded-md"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  {canManage && onDuplicateForNewCompany && (
                    <button
                      type="button"
                      onClick={() => onDuplicateForNewCompany(product)}
                      aria-label="Farklı Firmadan Ekle"
                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] text-[#0066B3] rounded-md cursor-pointer"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canManageAccounting && onCreateAccountingEntry && (
                    <button
                      type="button"
                      onClick={() => onCreateAccountingEntry(product)}
                      aria-label="Ön Muhasebeye İşle"
                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] text-[#007A53] rounded-md cursor-pointer"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => onEdit(product)}
                        aria-label="Düzenle"
                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] text-[#0B2239] rounded-md cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {canDeleteOwn && (
                        <button
                          type="button"
                          onClick={() => onDelete(product)}
                          aria-label="Sil"
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] text-red-700 rounded-md cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
