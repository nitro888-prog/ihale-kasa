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

interface BidProductCardProps {
  product: BidProduct;
  currentUid?: string;
  canManage?: boolean;
  canManageAccounting?: boolean;
  onView?: (product: BidProduct) => void;
  onEdit: (product: BidProduct) => void;
  onDelete: (product: BidProduct) => void;
  onSelectTenderId?: (tenderId: string) => void;
  onDuplicateForNewCompany?: (product: BidProduct) => void;
  onCreateAccountingEntry?: (product: BidProduct) => void;
}

export const BidProductCard: React.FC<BidProductCardProps> = ({
  product,
  currentUid = '',
  canManage = true,
  canManageAccounting = false,
  onView,
  onEdit,
  onDelete,
  onSelectTenderId,
  onDuplicateForNewCompany,
  onCreateAccountingEntry,
}) => {
  const canDeleteOwn = canManage && (currentUid ? isOwnRecord(product, currentUid) : true);

  return (
    <article
      onClick={() => onView && onView(product)}
      className={`bg-white border border-[#DCE3EC] rounded-xl overflow-hidden flex flex-col justify-between transition-colors ${
        onView ? 'hover:border-[#0066B3]/60 cursor-pointer' : ''
      }`}
    >
      {/* Üst Başlık: Stok No, Parça No, Malzeme Adı ve Teklif Edilen Satış Fiyatı */}
      <div className="p-4 sm:p-5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4E5D6C]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono tabular-nums">
            <span>
              Stok No:{' '}
              <strong className="text-[#0B2239] font-semibold">
                {product.stockNumber || '—'}
              </strong>
            </span>
            <span className="text-[#DCE3EC]" aria-hidden="true">
              ·
            </span>
            <span>
              Parça No:{' '}
              <strong className="text-[#0B2239] font-semibold">
                {product.partNumber || '—'}
              </strong>
            </span>
          </div>

          {product.tenderTrackingCode && (
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
        </div>

        <div className="flex items-start justify-between gap-4">
          <h3 className="font-display text-base font-bold text-[#0B2239] leading-snug">
            {product.materialName}
          </h3>
          <div className="text-right shrink-0">
            <div className="text-[11px] text-[#4E5D6C]">Teklif Edilen Satış Fiyatı</div>
            <div className="text-base font-mono font-bold text-[#0066B3] tabular-nums mt-0.5">
              {formatCurrency(product.offeredSalePrice, product.currency)}
            </div>
          </div>
        </div>
      </div>

      {/* Orta Alan: Fiyat Alınan Firma ve Tüm Tarihler */}
      <div className="px-4 sm:px-5 py-4 border-t border-[#DCE3EC] bg-[#F3F6FA]/70 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div className="col-span-2">
          <div className="text-[#4E5D6C]">Fiyat Alınan Firma Bilgisi</div>
          <div className="text-sm font-semibold text-[#0B2239] mt-0.5 truncate">
            {product.supplierCompany}
          </div>
        </div>

        <div>
          <div className="text-[#4E5D6C]">Fiyat Tarihi</div>
          <div className="font-mono font-semibold text-[#0B2239] tabular-nums mt-0.5">
            {product.priceDate ? formatTurkishDate(product.priceDate) : 'Belirtilmedi'}
          </div>
        </div>

        <div>
          <div className="text-[#4E5D6C]">Alındığı Tarih</div>
          <div className="font-mono font-semibold text-[#0B2239] tabular-nums mt-0.5">
            {product.purchaseDate ? formatTurkishDate(product.purchaseDate) : 'Belirtilmedi'}
          </div>
        </div>

        <div className="col-span-2 pt-2 border-t border-[#DCE3EC] flex items-center justify-between">
          <span className="text-[#4E5D6C]">Teklif Edildiği Tarih</span>
          <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
            {product.quotedDate ? formatTurkishDate(product.quotedDate) : 'Belirtilmedi'}
          </span>
        </div>

        {product.createdByName && (
          <div className="col-span-2 text-[11px] text-[#4E5D6C]">
            Oluşturan: <span className="font-medium text-[#0B2239]">{product.createdByName}</span>
          </div>
        )}
      </div>

      {/* Alt İşlem Çubuğu */}
      <div
        className="px-4 sm:px-5 py-2.5 border-t border-[#DCE3EC] flex flex-wrap items-center justify-between gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5">
          {onView && (
            <button
              type="button"
              onClick={() => onView(product)}
              className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Detay Penceresi</span>
            </button>
          )}
          <a
            href={`?detail=product&id=${encodeURIComponent(product.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Yeni Sekmede Aç"
            aria-label="Ürünü Yeni Sekmede Aç"
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] rounded-lg transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {canManage || canManageAccounting ? (
          <div className="flex items-center gap-1.5">
            {canManage && onDuplicateForNewCompany && (
              <button
                type="button"
                onClick={() => onDuplicateForNewCompany(product)}
                title="Aynı ürün için farklı firmadan alım / fiyat ekle"
                className="min-h-[38px] px-2.5 inline-flex items-center gap-1 text-xs font-medium text-[#0066B3] hover:bg-[#0066B3]/10 border border-[#DCE3EC] rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Farklı Firma</span>
              </button>
            )}
            {canManageAccounting && onCreateAccountingEntry && (
              <button
                type="button"
                onClick={() => onCreateAccountingEntry(product)}
                title="Ön Muhasebeye Alış Faturası Olarak İşle"
                aria-label="Ön Muhasebeye İşle"
                className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center text-[#007A53] hover:bg-[#007A53]/15 border border-[#DCE3EC] rounded-lg cursor-pointer transition-colors"
              >
                <Receipt className="w-3.5 h-3.5" />
              </button>
            )}
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(product)}
                  className="min-h-[38px] px-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#0B2239] hover:bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Düzenle</span>
                </button>
                {canDeleteOwn ? (
                  <button
                    type="button"
                    onClick={() => onDelete(product)}
                    aria-label="Ürün Kartını Sil"
                    className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center text-[#4E5D6C] hover:text-red-700 hover:bg-red-50 border border-[#DCE3EC] rounded-lg cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
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
        ) : (
          <span />
        )}
      </div>
    </article>
  );
};
