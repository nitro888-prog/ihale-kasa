import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  AccountingCompany,
  BidProduct,
  CurrencyCode,
  SCHEMA_LIMITS,
  Tender,
} from '../types/tender';
import { BidProductInput } from '../services/firestoreService';
import { getTodayDateStr } from '../lib/trackingAndCalendar';

export interface BidProductPrefill {
  tenderId?: string;
  materialName?: string;
  partNumber?: string;
  stockNumber?: string;
  supplierCompany?: string;
}

interface BidProductFormModalProps {
  open: boolean;
  onClose: () => void;
  tenders: Tender[];
  accountingCompanies?: AccountingCompany[];
  existingProducts?: BidProduct[];
  editingProduct?: BidProduct | null;
  defaultTenderId?: string;
  prefillValues?: BidProductPrefill | null;
  onSubmit: (data: BidProductInput) => Promise<void>;
}

export const BidProductFormModal: React.FC<BidProductFormModalProps> = ({
  open,
  onClose,
  tenders,
  accountingCompanies = [],
  existingProducts = [],
  editingProduct,
  defaultTenderId = '',
  prefillValues = null,
  onSubmit,
}) => {
  const todayStr = getTodayDateStr();

  const [tenderId, setTenderId] = useState(editingProduct?.tenderId || defaultTenderId);
  const [stockNumber, setStockNumber] = useState(editingProduct?.stockNumber || '');
  const [partNumber, setPartNumber] = useState(editingProduct?.partNumber || '');
  const [materialName, setMaterialName] = useState(editingProduct?.materialName || '');
  const [supplierCompany, setSupplierCompany] = useState(
    editingProduct?.supplierCompany || ''
  );
  const [priceDate, setPriceDate] = useState(editingProduct?.priceDate || todayStr);
  const [offeredSalePrice, setOfferedSalePrice] = useState(
    editingProduct ? String(editingProduct.offeredSalePrice) : ''
  );
  const [currency, setCurrency] = useState<CurrencyCode>(
    editingProduct?.currency || 'TRY'
  );
  const [purchaseDate, setPurchaseDate] = useState(
    editingProduct?.purchaseDate || ''
  );
  const [quotedDate, setQuotedDate] = useState(
    editingProduct?.quotedDate || todayStr
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companySuggestions = useMemo(() => {
    const names = new Set<string>();
    for (const c of accountingCompanies) {
      if (c.name.trim()) names.add(c.name.trim());
    }
    for (const p of existingProducts) {
      if (p.supplierCompany.trim()) names.add(p.supplierCompany.trim());
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [accountingCompanies, existingProducts]);

  useEffect(() => {
    if (!open) return;
    setTenderId(
      editingProduct?.tenderId ?? prefillValues?.tenderId ?? defaultTenderId
    );
    setStockNumber(editingProduct?.stockNumber || prefillValues?.stockNumber || '');
    setPartNumber(editingProduct?.partNumber || prefillValues?.partNumber || '');
    setMaterialName(editingProduct?.materialName || prefillValues?.materialName || '');
    setSupplierCompany(
      editingProduct?.supplierCompany || prefillValues?.supplierCompany || ''
    );
    setPriceDate(editingProduct?.priceDate || todayStr);
    setOfferedSalePrice(
      editingProduct ? String(editingProduct.offeredSalePrice) : ''
    );
    setCurrency(editingProduct?.currency || 'TRY');
    setPurchaseDate(editingProduct?.purchaseDate || '');
    setQuotedDate(editingProduct?.quotedDate || todayStr);
    setError(null);
  }, [open, editingProduct, defaultTenderId, prefillValues, todayStr]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!materialName.trim() || !supplierCompany.trim()) {
      setError('Malzeme adı ve satın alınan / fiyat alınan firma bilgisi zorunludur.');
      return;
    }

    const linkedTender = tenders.find((t) => t.id === tenderId);
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        tenderId: linkedTender ? linkedTender.id : '',
        tenderTrackingCode: linkedTender ? linkedTender.trackingCode : '',
        stockNumber: stockNumber.trim(),
        partNumber: partNumber.trim(),
        materialName: materialName.trim(),
        supplierCompany: supplierCompany.trim(),
        priceDate,
        offeredSalePrice: Math.max(0, Number(offeredSalePrice) || 0),
        currency,
        purchaseDate,
        quotedDate,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ürün kartı kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B2239]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editingProduct ? 'Ürün Kartını Düzenle' : 'Yeni Teklif Ürün Kartı'}
    >
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] rounded-t-2xl sm:rounded-xl border border-[#DCE3EC] flex flex-col overflow-hidden">
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 bg-[#DCE3EC] rounded-full" />
        </div>

        <div className="px-5 py-4 border-b border-[#DCE3EC] flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-[#0B2239]">
              {editingProduct
                ? 'Teklif Verilen Ürün Kartını Düzenle'
                : 'Yeni Teklif Verilen Ürün Kartı'}
            </h2>
            <p className="text-xs text-[#4E5D6C] mt-0.5">
              Aynı ürünü farklı firmalardan satın alabilir veya fiyat alabilirsiniz; her kayıt için firma bilgisini ayrı girin.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[#4E5D6C] hover:text-[#0B2239] rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İlişkili İhale (İsteğe Bağlı)
              </label>
              <select
                value={tenderId}
                onChange={(e) => setTenderId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                <option value="">Genel / İhaleye Bağlı Değil</option>
                {tenders.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.trackingCode} — {t.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Stok Numarası
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.STOCK_NUMBER_MAX}
                placeholder="Örn: STK-10428"
                value={stockNumber}
                onChange={(e) => setStockNumber(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Parça Numarası
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.PART_NUMBER_MAX}
                placeholder="Örn: PN-8840-TR"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Malzeme Adı *
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.MATERIAL_NAME_MAX}
                placeholder="Örn: 630 kVA Yağlı Tip Dağıtım Trafosu"
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Satın Alınan / Fiyat Alınan Firma Bilgisi *
              </label>
              <input
                type="text"
                required
                list="product-supplier-suggestions"
                maxLength={SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX}
                placeholder="Firma ünvanını yazın veya kayıtlı carilerden seçin..."
                value={supplierCompany}
                onChange={(e) => setSupplierCompany(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
              <datalist id="product-supplier-suggestions">
                {companySuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Teklif Edilen Satış Fiyatı *
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  required
                  min={0}
                  step="any"
                  placeholder="0"
                  value={offeredSalePrice}
                  onChange={(e) => setOfferedSalePrice(e.target.value)}
                  className="flex-1 min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className="w-24 min-h-[44px] px-2.5 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                >
                  <option value="TRY">TRY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Fiyat Tarihi
              </label>
              <input
                type="date"
                value={priceDate}
                onChange={(e) => setPriceDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Hangi Tarihte Alındığı
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Hangi Tarihte Teklif Edildiği
              </label>
              <input
                type="date"
                value={quotedDate}
                onChange={(e) => setQuotedDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#DCE3EC] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-sm font-medium rounded-lg cursor-pointer transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-5 py-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-sm font-semibold rounded-lg cursor-pointer disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Kaydediliyor…' : editingProduct ? 'Kartı Güncelle' : 'Ürün Kartı Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
