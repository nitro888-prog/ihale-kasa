import React, { useEffect, useMemo, useState } from 'react';
import { Receipt, X } from 'lucide-react';
import {
  ACCOUNTING_ENTRY_TYPE_LABELS,
  ACCOUNTING_PAYMENT_METHOD_LABELS,
  ACCOUNTING_PAYMENT_STATUS_LABELS,
  AccountingCompany,
  AccountingEntry,
  AccountingEntryType,
  AccountingPaymentMethod,
  AccountingPaymentStatus,
  BidProduct,
  CurrencyCode,
  SCHEMA_LIMITS,
  Tender,
} from '../types/tender';
import { AccountingEntryInput } from '../services/firestoreService';
import { formatCurrency, getTodayDateStr } from '../lib/trackingAndCalendar';

export interface AccountingEntryPrefill {
  entryType?: AccountingEntryType;
  companyId?: string;
  companyName?: string;
  title?: string;
  stockNumber?: string;
  partNumber?: string;
  unitPrice?: number;
  quantity?: number;
  unit?: string;
  currency?: CurrencyCode;
  tenderId?: string;
  notes?: string;
}

interface AccountingEntryModalProps {
  open: boolean;
  onClose: () => void;
  companies: AccountingCompany[];
  bidProducts: BidProduct[];
  tenders: Tender[];
  editingEntry?: AccountingEntry | null;
  prefillValues?: AccountingEntryPrefill | null;
  canAlsoCreateProduct?: boolean;
  onSubmit: (
    data: AccountingEntryInput,
    options?: { alsoCreateProduct?: boolean; alsoEnsureCompany?: boolean }
  ) => Promise<void>;
}

const VAT_RATES = [0, 1, 10, 20];

export const AccountingEntryModal: React.FC<AccountingEntryModalProps> = ({
  open,
  onClose,
  companies,
  bidProducts,
  tenders,
  editingEntry,
  prefillValues = null,
  canAlsoCreateProduct = false,
  onSubmit,
}) => {
  const todayStr = getTodayDateStr();

  const [entryType, setEntryType] = useState<AccountingEntryType>('alis_faturasi');
  const [companyName, setCompanyName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [title, setTitle] = useState('');
  const [stockNumber, setStockNumber] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('Adet');
  const [unitPrice, setUnitPrice] = useState('');
  const [vatRate, setVatRate] = useState('20');
  const [currency, setCurrency] = useState<CurrencyCode>('TRY');
  const [entryDate, setEntryDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<AccountingPaymentMethod>('banka_havale');
  const [paymentStatus, setPaymentStatus] =
    useState<AccountingPaymentStatus>('bekliyor');
  const [paidAmount, setPaidAmount] = useState('0');
  const [tenderId, setTenderId] = useState('');
  const [notes, setNotes] = useState('');
  const [alsoEnsureCompany, setAlsoEnsureCompany] = useState(true);
  const [alsoCreateProduct, setAlsoCreateProduct] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editingEntry) {
      setEntryType(editingEntry.entryType);
      setCompanyName(editingEntry.companyName);
      setInvoiceNo(editingEntry.invoiceNo || '');
      setTitle(editingEntry.title);
      setStockNumber(editingEntry.stockNumber || '');
      setPartNumber(editingEntry.partNumber || '');
      setQuantity(String(editingEntry.quantity ?? 1));
      setUnit(editingEntry.unit || 'Adet');
      setUnitPrice(String(editingEntry.unitPrice ?? 0));
      setVatRate(String(editingEntry.vatRate ?? 20));
      setCurrency(editingEntry.currency || 'TRY');
      setEntryDate(editingEntry.entryDate || todayStr);
      setDueDate(editingEntry.dueDate || '');
      setPaymentMethod(editingEntry.paymentMethod || 'banka_havale');
      setPaymentStatus(editingEntry.paymentStatus || 'bekliyor');
      setPaidAmount(String(editingEntry.paidAmount ?? 0));
      setTenderId(editingEntry.tenderId || '');
      setNotes(editingEntry.notes || '');
      setAlsoCreateProduct(false);
      setAlsoEnsureCompany(false);
    } else {
      setEntryType(prefillValues?.entryType || 'alis_faturasi');
      setCompanyName(prefillValues?.companyName || '');
      setInvoiceNo('');
      setTitle(prefillValues?.title || '');
      setStockNumber(prefillValues?.stockNumber || '');
      setPartNumber(prefillValues?.partNumber || '');
      setQuantity(String(prefillValues?.quantity ?? 1));
      setUnit(prefillValues?.unit || 'Adet');
      setUnitPrice(
        typeof prefillValues?.unitPrice === 'number' && prefillValues.unitPrice > 0
          ? String(prefillValues.unitPrice)
          : ''
      );
      setVatRate('20');
      setCurrency(prefillValues?.currency || 'TRY');
      setEntryDate(todayStr);
      setDueDate('');
      setPaymentMethod('banka_havale');
      setPaymentStatus(
        prefillValues?.entryType === 'tahsilat' || prefillValues?.entryType === 'odeme'
          ? 'odendi'
          : 'bekliyor'
      );
      setPaidAmount('0');
      setTenderId(prefillValues?.tenderId || '');
      setNotes(prefillValues?.notes || '');
      setAlsoCreateProduct(false);
      setAlsoEnsureCompany(true);
    }
    setError(null);
  }, [open, editingEntry, prefillValues, todayStr]);

  const companySuggestions = useMemo(() => {
    const names = new Set<string>();
    for (const c of companies) {
      if (c.name.trim()) names.add(c.name.trim());
    }
    for (const p of bidProducts) {
      if (p.supplierCompany.trim()) names.add(p.supplierCompany.trim());
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [companies, bidProducts]);

  const matchedCompany = useMemo(() => {
    const target = companyName.trim().toLowerCase();
    if (!target) return null;
    return companies.find((c) => c.name.trim().toLowerCase() === target) || null;
  }, [companies, companyName]);

  const numericQty = Math.max(0, Number(quantity) || 0);
  const numericUnitPrice = Math.max(0, Number(unitPrice) || 0);
  const numericVatRate = Math.max(0, Math.min(100, Number(vatRate) || 0));
  const subtotalAmount = Number((numericQty * numericUnitPrice).toFixed(2));
  const vatAmount = Number(((subtotalAmount * numericVatRate) / 100).toFixed(2));
  const totalAmount = Number((subtotalAmount + vatAmount).toFixed(2));

  useEffect(() => {
    if (!open || editingEntry) return;
    if (paymentStatus === 'odendi') {
      setPaidAmount(String(totalAmount));
    } else if (paymentStatus === 'bekliyor' || paymentStatus === 'iptal') {
      setPaidAmount('0');
    }
  }, [paymentStatus, totalAmount, open, editingEntry]);

  if (!open) return null;

  const handleStatusChange = (next: AccountingPaymentStatus) => {
    setPaymentStatus(next);
    if (next === 'odendi') {
      setPaidAmount(String(totalAmount));
    } else if (next === 'bekliyor' || next === 'iptal') {
      setPaidAmount('0');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError('Her ön muhasebe kaydında firma bilgisi zorunludur.');
      return;
    }
    if (!title.trim()) {
      setError('Ürün / hizmet veya işlem açıklaması zorunludur.');
      return;
    }
    if (!entryDate) {
      setError('İşlem tarihi zorunludur.');
      return;
    }

    const linkedTender = tenders.find((t) => t.id === tenderId);
    const resolvedPaid =
      paymentStatus === 'odendi'
        ? totalAmount
        : paymentStatus === 'bekliyor' || paymentStatus === 'iptal'
        ? 0
        : Math.max(0, Math.min(totalAmount, Number(paidAmount) || 0));

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        {
          entryType,
          companyId: matchedCompany?.id || '',
          companyName: companyName.trim(),
          invoiceNo: invoiceNo.trim(),
          title: title.trim(),
          stockNumber: stockNumber.trim(),
          partNumber: partNumber.trim(),
          quantity: numericQty,
          unit: unit.trim() || 'Adet',
          unitPrice: numericUnitPrice,
          vatRate: numericVatRate,
          subtotalAmount,
          vatAmount,
          totalAmount,
          paidAmount: resolvedPaid,
          currency,
          entryDate,
          dueDate,
          paymentMethod,
          paymentStatus,
          tenderId: linkedTender ? linkedTender.id : '',
          tenderTrackingCode: linkedTender ? linkedTender.trackingCode : '',
          notes: notes.trim(),
        },
        {
          alsoCreateProduct:
            !editingEntry && entryType === 'alis_faturasi' && alsoCreateProduct,
          alsoEnsureCompany: !matchedCompany && alsoEnsureCompany,
        }
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ön muhasebe kaydı oluşturulamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B2239]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editingEntry ? 'Muhasebe Kaydını Düzenle' : 'Yeni Ön Muhasebe Kaydı'}
    >
      <div className="bg-white w-full sm:max-w-3xl max-h-[92vh] rounded-t-2xl sm:rounded-xl border border-[#DCE3EC] flex flex-col overflow-hidden">
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 bg-[#DCE3EC] rounded-full" />
        </div>

        <div className="px-5 py-4 bg-[#0B2239] text-white border-b-2 border-[#007A53] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Receipt className="w-5 h-5 text-[#FBBF24] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-white truncate">
                {editingEntry ? 'Ön Muhasebe Kaydını Düzenle' : 'Yeni Ön Muhasebe Kaydı'}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 truncate">
                Alış/satış faturaları, tahsilat, ödeme ve gider kayıtlarını firma bazlı işleyin.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-slate-300 hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İşlem Türü *
              </label>
              <select
                value={entryType}
                onChange={(e) => {
                  const next = e.target.value as AccountingEntryType;
                  setEntryType(next);
                  if (!editingEntry && (next === 'tahsilat' || next === 'odeme')) {
                    setPaymentStatus('odendi');
                  }
                }}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {(Object.keys(ACCOUNTING_ENTRY_TYPE_LABELS) as AccountingEntryType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {ACCOUNTING_ENTRY_TYPE_LABELS[t]}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Firma Bilgisi (Tedarikçi / Müşteri / Kurum) *
              </label>
              <input
                type="text"
                required
                list="accounting-company-suggestions"
                maxLength={SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX}
                placeholder="Firma ünvanını yazın veya listeden seçin..."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
              <datalist id="accounting-company-suggestions">
                {companySuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {companyName.trim() && !matchedCompany && (
                <label className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-[#4E5D6C] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoEnsureCompany}
                    onChange={(e) => setAlsoEnsureCompany(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#0066B3]"
                  />
                  <span>Bu firmayı Cari Firmalar listesine de otomatik ekle</span>
                </label>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Ürün / Hizmet veya İşlem Açıklaması *
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.ACCOUNTING_TITLE_MAX}
                placeholder="Örn: 630 kVA Yağlı Tip Dağıtım Trafosu Tedariki"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Fatura / Belge / Dekont No
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.INVOICE_NO_MAX}
                placeholder="Örn: FAT-2026-00142"
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
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

            <div>
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
          </div>

          {/* Tutar ve KDV Hesaplama Bloğu */}
          <div className="p-4 bg-[#F3F6FA]/80 border border-[#DCE3EC] rounded-xl space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                  Miktar *
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step="any"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                  Birim
                </label>
                <input
                  type="text"
                  maxLength={SCHEMA_LIMITS.UNIT_MAX}
                  placeholder="Adet"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                  Birim Fiyat (KDV Hariç) *
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step="any"
                  placeholder="0.00"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                  KDV Oranı
                </label>
                <select
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  className="w-full min-h-[42px] px-2.5 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                >
                  {VAT_RATES.map((rate) => (
                    <option key={rate} value={String(rate)}>
                      %{rate}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                  Para Birimi
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className="w-full min-h-[42px] px-2.5 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                >
                  <option value="TRY">TRY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-[#DCE3EC] grid grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-[#4E5D6C]">Ara Toplam:</span>
                <div className="font-mono font-semibold text-[#0B2239] tabular-nums mt-0.5">
                  {formatCurrency(subtotalAmount, currency)}
                </div>
              </div>
              <div>
                <span className="text-[#4E5D6C]">KDV (%{numericVatRate}):</span>
                <div className="font-mono font-semibold text-[#0B2239] tabular-nums mt-0.5">
                  {formatCurrency(vatAmount, currency)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[#4E5D6C]">Genel Toplam:</span>
                <div className="text-base font-mono font-bold text-[#0066B3] tabular-nums mt-0.5">
                  {formatCurrency(totalAmount, currency)}
                </div>
              </div>
            </div>
          </div>

          {/* Tarih & Ödeme Durumu */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İşlem / Fatura Tarihi *
              </label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Vade Tarihi
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Ödeme Yöntemi
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as AccountingPaymentMethod)
                }
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {(
                  Object.keys(ACCOUNTING_PAYMENT_METHOD_LABELS) as AccountingPaymentMethod[]
                ).map((m) => (
                  <option key={m} value={m}>
                    {ACCOUNTING_PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Ödeme Durumu
              </label>
              <select
                value={paymentStatus}
                onChange={(e) =>
                  handleStatusChange(e.target.value as AccountingPaymentStatus)
                }
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {(
                  Object.keys(ACCOUNTING_PAYMENT_STATUS_LABELS) as AccountingPaymentStatus[]
                ).map((st) => (
                  <option key={st} value={st}>
                    {ACCOUNTING_PAYMENT_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>

            {paymentStatus === 'kismi' && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                  Ödenen / Tahsil Edilen Tutar ({currency})
                </label>
                <input
                  type="number"
                  min={0}
                  max={totalAmount}
                  step="any"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                />
              </div>
            )}

            <div className={paymentStatus === 'kismi' ? 'sm:col-span-2' : 'sm:col-span-4'}>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Açıklama / Muhasebe Notları
              </label>
              <textarea
                rows={2}
                maxLength={SCHEMA_LIMITS.NOTES_MAX}
                placeholder="İrsaliye no, banka referans bilgisi veya ek notlar..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>
          </div>

          {!editingEntry && entryType === 'alis_faturasi' && canAlsoCreateProduct && (
            <label className="p-3 bg-[#0066B3]/5 border border-[#0066B3]/30 rounded-lg flex items-start gap-2.5 text-xs text-[#0B2239] cursor-pointer">
              <input
                type="checkbox"
                checked={alsoCreateProduct}
                onChange={(e) => setAlsoCreateProduct(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#0066B3]"
              />
              <span>
                <strong>Teklif Ürünleri veritabanına da ekle:</strong> Bu alım kaydındaki ürün, firma ve birim fiyat bilgisini gelecek ihale fiyat karşılaştırmaları için ürün kartı olarak da kaydet.
              </span>
            </label>
          )}

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
              {submitting
                ? 'Kaydediliyor…'
                : editingEntry
                ? 'Muhasebe Kaydını Güncelle'
                : 'Ön Muhasebe Kaydı Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
