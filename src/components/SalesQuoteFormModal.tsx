import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  FileText,
  Package,
  Plus,
  Trash2,
  Search,
  Building2,
  ArrowRightLeft,
  Check,
} from 'lucide-react';
import {
  AccountingCompany,
  BidProduct,
  CurrencyCode,
  SALES_QUOTE_DOC_TYPE_LABELS,
  SALES_QUOTE_STATUS_LABELS,
  SalesQuote,
  SalesQuoteDocType,
  SalesQuoteItem,
  SalesQuoteStatus,
  SCHEMA_LIMITS,
} from '../types/tender';
import { SalesQuoteInput } from '../services/firestoreService';
import {
  addDaysToDateStr,
  formatCurrency,
  getTodayDateStr,
} from '../lib/trackingAndCalendar';

interface SalesQuoteFormModalProps {
  open: boolean;
  onClose: () => void;
  existingQuotes: SalesQuote[];
  editingQuote: SalesQuote | null;
  defaultDocType?: SalesQuoteDocType;
  companies: AccountingCompany[];
  bidProducts: BidProduct[];
  onSubmit: (
    data: SalesQuoteInput,
    options?: { alsoEnsureCustomerCompany?: boolean }
  ) => Promise<void>;
}

const UNITS = ['Adet', 'Takım', 'Set', 'Metre', 'Kg', 'Paket', 'Saat', 'Hizmet'];
const VAT_RATES = [0, 1, 10, 20];

function computeLineItem(item: SalesQuoteItem): SalesQuoteItem {
  const qty = Math.max(0, Number(item.quantity) || 0);
  const price = Math.max(0, Number(item.unitPrice) || 0);
  const disc = Math.max(0, Math.min(100, Number(item.discountRate) || 0));
  const vat = Math.max(0, Math.min(100, Number(item.vatRate) || 0));
  const subtotal = Number((qty * price * (1 - disc / 100)).toFixed(2));
  const vatAmount = Number(((subtotal * vat) / 100).toFixed(2));
  const total = Number((subtotal + vatAmount).toFixed(2));
  return {
    ...item,
    quantity: qty,
    unitPrice: price,
    discountRate: disc,
    vatRate: vat,
    subtotal,
    vatAmount,
    total,
  };
}

function generateNextQuoteNumber(
  docType: SalesQuoteDocType,
  existingQuotes: SalesQuote[]
): string {
  const prefix = docType === 'proforma' ? 'PRF' : 'TKL';
  const ym = getTodayDateStr().slice(0, 7).replace('-', '');
  const base = `${prefix}-${ym}-`;
  let maxSeq = 0;
  for (const q of existingQuotes) {
    if (q.quoteNumber.startsWith(base)) {
      const tail = Number(q.quoteNumber.slice(base.length));
      if (!Number.isNaN(tail) && tail > maxSeq) maxSeq = tail;
    }
  }
  return `${base}${String(maxSeq + 1).padStart(2, '0')}`;
}

export const SalesQuoteFormModal: React.FC<SalesQuoteFormModalProps> = ({
  open,
  onClose,
  existingQuotes,
  editingQuote,
  defaultDocType = 'teklif',
  companies,
  bidProducts,
  onSubmit,
}) => {
  const [docType, setDocType] = useState<SalesQuoteDocType>('teklif');
  const [quoteNumber, setQuoteNumber] = useState('');
  const [status, setStatus] = useState<SalesQuoteStatus>('taslak');
  const [title, setTitle] = useState('');
  const [issueDate, setIssueDate] = useState(getTodayDateStr());
  const [validUntilDate, setValidUntilDate] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('TRY');
  const [exchangeNote, setExchangeNote] = useState('');

  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerTaxOffice, setCustomerTaxOffice] = useState('');
  const [customerTaxNumber, setCustomerTaxNumber] = useState('');
  const [customerContactPerson, setCustomerContactPerson] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [alsoEnsureCustomer, setAlsoEnsureCustomer] = useState(true);

  const [deliveryTerms, setDeliveryTerms] = useState('Sipariş onayını müteakip 7 iş günü içinde teslim');
  const [paymentTerms, setPaymentTerms] = useState('Fatura tarihinden itibaren 15 gün vadeli / Havale-EFT');
  const [warrantyTerms, setWarrantyTerms] = useState('24 Ay üretici / firma garantisi');
  const [bankInfo, setBankInfo] = useState('');
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<SalesQuoteItem[]>([]);
  const [linkedProjectId, setLinkedProjectId] = useState('');
  const [linkedProjectCode, setLinkedProjectCode] = useState('');
  const [orderConfirmedDate, setOrderConfirmedDate] = useState('');

  // Ürün Kataloğu Seçici Durumu
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [fxRates, setFxRates] = useState<{ USD_TO_TRY: string; EUR_TO_TRY: string; EUR_TO_USD: string }>({
    USD_TO_TRY: '1',
    EUR_TO_TRY: '1',
    EUR_TO_USD: '1',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setProductPickerOpen(false);
    setProductSearch('');

    if (editingQuote) {
      setDocType(editingQuote.docType);
      setQuoteNumber(editingQuote.quoteNumber);
      setStatus(editingQuote.status);
      setTitle(editingQuote.title);
      setIssueDate(editingQuote.issueDate || getTodayDateStr());
      setValidUntilDate(editingQuote.validUntilDate || '');
      setCurrency(editingQuote.currency || 'TRY');
      setExchangeNote(editingQuote.exchangeNote || '');
      setCustomerId(editingQuote.customerId || '');
      setCustomerName(editingQuote.customerName || '');
      setCustomerTaxOffice(editingQuote.customerTaxOffice || '');
      setCustomerTaxNumber(editingQuote.customerTaxNumber || '');
      setCustomerContactPerson(editingQuote.customerContactPerson || '');
      setCustomerPhone(editingQuote.customerPhone || '');
      setCustomerEmail(editingQuote.customerEmail || '');
      setCustomerAddress(editingQuote.customerAddress || '');
      setAlsoEnsureCustomer(false);
      setDeliveryTerms(editingQuote.deliveryTerms || '');
      setPaymentTerms(editingQuote.paymentTerms || '');
      setWarrantyTerms(editingQuote.warrantyTerms || '');
      setBankInfo(editingQuote.bankInfo || '');
      setNotes(editingQuote.notes || '');
      setItems((editingQuote.items || []).map(computeLineItem));
      setLinkedProjectId(editingQuote.linkedProjectId || '');
      setLinkedProjectCode(editingQuote.linkedProjectCode || '');
      setOrderConfirmedDate(editingQuote.orderConfirmedDate || '');
      return;
    }

    const today = getTodayDateStr();
    const initialDocType = defaultDocType || 'teklif';
    setDocType(initialDocType);
    setQuoteNumber(generateNextQuoteNumber(initialDocType, existingQuotes));
    setStatus('taslak');
    setTitle('');
    setIssueDate(today);
    setValidUntilDate(addDaysToDateStr(today, 15));
    setCurrency('TRY');
    setExchangeNote('');
    setCustomerId('');
    setCustomerName('');
    setCustomerTaxOffice('');
    setCustomerTaxNumber('');
    setCustomerContactPerson('');
    setCustomerPhone('');
    setCustomerEmail('');
    setCustomerAddress('');
    setAlsoEnsureCustomer(true);
    setDeliveryTerms('Sipariş onayını müteakip 7 iş günü içinde teslim');
    setPaymentTerms('Fatura tarihinden itibaren 15 gün vadeli / Havale-EFT');
    setWarrantyTerms('24 Ay üretici / firma garantisi');
    setBankInfo('');
    setNotes('');
    setItems([]);
    setLinkedProjectId('');
    setLinkedProjectCode('');
    setOrderConfirmedDate('');
  }, [open, editingQuote, defaultDocType]);

  const handleDocTypeSwitch = (nextType: SalesQuoteDocType) => {
    setDocType(nextType);
    if (!editingQuote) {
      setQuoteNumber(generateNextQuoteNumber(nextType, existingQuotes));
    }
  };

  const handleSelectCompany = (id: string) => {
    setCustomerId(id);
    const found = companies.find((c) => c.id === id);
    if (!found) return;
    setCustomerName(found.name);
    setCustomerTaxOffice(found.taxOffice || '');
    setCustomerTaxNumber(found.taxNumber || '');
    setCustomerContactPerson(found.contactPerson || '');
    setCustomerPhone(found.phone || '');
    setCustomerEmail(found.email || '');
    setCustomerAddress(found.address || '');
  };

  const getConversionFactor = (from: CurrencyCode, to: CurrencyCode): number => {
    if (from === to) return 1;
    const usdTry = Math.max(0.0001, Number(fxRates.USD_TO_TRY) || 1);
    const eurTry = Math.max(0.0001, Number(fxRates.EUR_TO_TRY) || 1);
    const eurUsd = Math.max(0.0001, Number(fxRates.EUR_TO_USD) || 1);

    if (from === 'USD' && to === 'TRY') return usdTry;
    if (from === 'TRY' && to === 'USD') return 1 / usdTry;
    if (from === 'EUR' && to === 'TRY') return eurTry;
    if (from === 'TRY' && to === 'EUR') return 1 / eurTry;
    if (from === 'EUR' && to === 'USD') return eurUsd;
    if (from === 'USD' && to === 'EUR') return 1 / eurUsd;
    return 1;
  };

  const handleAddProductFromCatalog = (product: BidProduct) => {
    const factor = getConversionFactor(product.currency, currency);
    const convertedUnitPrice = Number((product.offeredSalePrice * factor).toFixed(2));
    const newItem = computeLineItem({
      id: `qi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      productId: product.id,
      stockNumber: product.stockNumber || '',
      partNumber: product.partNumber || '',
      materialName: product.materialName,
      supplierCompany: product.supplierCompany || '',
      description:
        product.currency !== currency
          ? `Katalog fiyatı: ${formatCurrency(product.offeredSalePrice, product.currency)}`
          : '',
      quantity: 1,
      unit: 'Adet',
      unitPrice: convertedUnitPrice,
      discountRate: 0,
      vatRate: 20,
      subtotal: convertedUnitPrice,
      vatAmount: 0,
      total: convertedUnitPrice,
      sourceCurrency: product.currency,
      sourceUnitPrice: product.offeredSalePrice,
    });
    setItems((prev) => [...prev, newItem]);
  };

  const handleAddCustomItem = () => {
    const newItem = computeLineItem({
      id: `qi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      productId: '',
      stockNumber: '',
      partNumber: '',
      materialName: '',
      supplierCompany: '',
      description: '',
      quantity: 1,
      unit: 'Adet',
      unitPrice: 0,
      discountRate: 0,
      vatRate: 20,
      subtotal: 0,
      vatAmount: 0,
      total: 0,
      sourceCurrency: currency,
      sourceUnitPrice: 0,
    });
    setItems((prev) => [...prev, newItem]);
  };

  const updateItemField = <K extends keyof SalesQuoteItem>(
    idx: number,
    key: K,
    value: SalesQuoteItem[K]
  ) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const updated = { ...it, [key]: value };
        return computeLineItem(updated);
      })
    );
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRecalculateItemsForCurrency = (nextCurrency: CurrencyCode) => {
    const prevCurrency = currency;
    setCurrency(nextCurrency);
    if (prevCurrency === nextCurrency || items.length === 0) return;

    setItems((prev) =>
      prev.map((it) => {
        if (it.productId && it.sourceUnitPrice > 0) {
          const factor = getConversionFactor(it.sourceCurrency, nextCurrency);
          const nextPrice = Number((it.sourceUnitPrice * factor).toFixed(2));
          return computeLineItem({
            ...it,
            unitPrice: nextPrice,
          });
        }
        const factor = getConversionFactor(prevCurrency, nextCurrency);
        return computeLineItem({
          ...it,
          unitPrice: Number((it.unitPrice * factor).toFixed(2)),
        });
      })
    );
  };

  const filteredCatalogProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return bidProducts.filter((p) => {
      if (!q) return true;
      return (
        p.materialName.toLowerCase().includes(q) ||
        p.stockNumber.toLowerCase().includes(q) ||
        p.partNumber.toLowerCase().includes(q) ||
        p.supplierCompany.toLowerCase().includes(q)
      );
    });
  }, [bidProducts, productSearch]);

  const totals = useMemo(() => {
    const subtotalAmount = Number(
      items.reduce((acc, it) => acc + it.subtotal, 0).toFixed(2)
    );
    const discountTotal = Number(
      items
        .reduce((acc, it) => acc + it.quantity * it.unitPrice * (it.discountRate / 100), 0)
        .toFixed(2)
    );
    const vatTotal = Number(items.reduce((acc, it) => acc + it.vatAmount, 0).toFixed(2));
    const grandTotal = Number((subtotalAmount + vatTotal).toFixed(2));
    return { subtotalAmount, discountTotal, vatTotal, grandTotal };
  }, [items]);

  const alreadyExistsInCompanies = useMemo(() => {
    const trimmed = customerName.trim().toLowerCase();
    if (!trimmed) return false;
    return companies.some((c) => c.name.trim().toLowerCase() === trimmed);
  }, [companies, customerName]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteNumber.trim()) {
      setError('Teklif / Proforma numarası zorunludur.');
      return;
    }
    if (!customerName.trim()) {
      setError('Müşteri firma ünvanı zorunludur.');
      return;
    }
    if (!title.trim()) {
      setError('Teklif / Proforma konusu zorunludur.');
      return;
    }
    if (items.length === 0) {
      setError('En az bir ürün veya hizmet kalemi eklemelisiniz.');
      return;
    }
    const invalidItem = items.find((it) => !it.materialName.trim());
    if (invalidItem) {
      setError('Kalem listesindeki tüm satırların ürün / hizmet adı dolu olmalıdır.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit(
        {
          quoteNumber: quoteNumber.trim(),
          docType,
          status,
          customerId,
          customerName: customerName.trim(),
          customerTaxOffice: customerTaxOffice.trim(),
          customerTaxNumber: customerTaxNumber.trim(),
          customerContactPerson: customerContactPerson.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          customerAddress: customerAddress.trim(),
          title: title.trim(),
          issueDate: issueDate || getTodayDateStr(),
          validUntilDate: validUntilDate || '',
          currency,
          exchangeNote: exchangeNote.trim(),
          deliveryTerms: deliveryTerms.trim(),
          paymentTerms: paymentTerms.trim(),
          warrantyTerms: warrantyTerms.trim(),
          bankInfo: bankInfo.trim(),
          notes: notes.trim(),
          items,
          subtotalAmount: totals.subtotalAmount,
          discountTotal: totals.discountTotal,
          vatTotal: totals.vatTotal,
          grandTotal: totals.grandTotal,
          linkedProjectId,
          linkedProjectCode,
          orderConfirmedDate:
            status === 'siparis_onaylandi'
              ? orderConfirmedDate || getTodayDateStr()
              : orderConfirmedDate,
        },
        {
          alsoEnsureCustomerCompany:
            !customerId && !alreadyExistsInCompanies && alsoEnsureCustomer,
        }
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Teklif / Proforma kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B2239]/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={editingQuote ? 'Teklif / Proforma Düzenle' : 'Yeni Teklif / Proforma'}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[#DCE3EC] rounded-xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-[#0B2239] text-white border-b-2 border-[#0066B3] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-5 h-5 text-[#7DD3FC] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-white truncate">
                {editingQuote
                  ? `${editingQuote.quoteNumber} · Teklif / Proforma Düzenle`
                  : 'Yeni Özel Sektör Teklifi / Proforma Fatura'}
              </h2>
              <p className="text-xs text-slate-300 truncate">
                Ürünler listesinden kalem seçin, para birimini belirleyin, PDF oluşturun.
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

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Document Type & Meta Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-4">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Belge Türü *
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg">
                {(['teklif', 'proforma'] as SalesQuoteDocType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleDocTypeSwitch(t)}
                    className={`min-h-[38px] px-2 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                      docType === t
                        ? 'bg-[#0B2239] text-white'
                        : 'text-[#4E5D6C] hover:text-[#0B2239]'
                    }`}
                  >
                    {SALES_QUOTE_DOC_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Belge No *
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.QUOTE_NUMBER_MAX}
                value={quoteNumber}
                onChange={(e) => setQuoteNumber(e.target.value)}
                placeholder="Örn: TKL-202611-01"
                className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-mono font-semibold text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Para Birimi *
              </label>
              <select
                value={currency}
                onChange={(e) => handleRecalculateItemsForCurrency(e.target.value as CurrencyCode)}
                className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-semibold text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                <option value="TRY">TRY (₺)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Durum
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SalesQuoteStatus)}
                className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {(Object.keys(SALES_QUOTE_STATUS_LABELS) as SalesQuoteStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {SALES_QUOTE_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title & Dates */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-6">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Teklif / Proforma Konusu *
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.TITLE_MAX}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Örn: Fabrika Enerji İzleme ve Otomasyon Ekipmanları Tedariği"
                className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Düzenleme Tarihi *
              </label>
              <input
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-mono text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Geçerlilik Tarihi
              </label>
              <input
                type="date"
                value={validUntilDate}
                onChange={(e) => setValidUntilDate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-mono text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>
          </div>

          {/* Customer Block */}
          <section className="p-4 bg-[#F3F6FA]/70 border border-[#DCE3EC] rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0B2239]">
                <Building2 className="w-4 h-4 text-[#0066B3]" />
                <span>Müşteri Firma Bilgileri</span>
              </div>
              {companies.length > 0 && (
                <select
                  value={customerId}
                  onChange={(e) => handleSelectCompany(e.target.value)}
                  className="min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
                >
                  <option value="">— Kayıtlı Carilerden Müşteri Seç —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.taxNumber ? ` (VKN: ${c.taxNumber})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                  Müşteri Firma Ünvanı *
                </label>
                <input
                  type="text"
                  required
                  maxLength={SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX}
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setCustomerId('');
                  }}
                  placeholder="Firma ünvanı"
                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                  İlgili Kişi / Yetkili
                </label>
                <input
                  type="text"
                  maxLength={SCHEMA_LIMITS.PERSON_MAX}
                  value={customerContactPerson}
                  onChange={(e) => setCustomerContactPerson(e.target.value)}
                  placeholder="Ad Soyad"
                  className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                  Vergi Dairesi
                </label>
                <input
                  type="text"
                  maxLength={SCHEMA_LIMITS.TAX_OFFICE_MAX}
                  value={customerTaxOffice}
                  onChange={(e) => setCustomerTaxOffice(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                  VKN / TCKN
                </label>
                <input
                  type="text"
                  maxLength={SCHEMA_LIMITS.TAX_NUMBER_MAX}
                  value={customerTaxNumber}
                  onChange={(e) => setCustomerTaxNumber(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                  Telefon
                </label>
                <input
                  type="text"
                  maxLength={SCHEMA_LIMITS.PHONE_MAX}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                  E-Posta
                </label>
                <input
                  type="email"
                  maxLength={SCHEMA_LIMITS.EMAIL_MAX}
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  maxLength={SCHEMA_LIMITS.ADDRESS_MAX}
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="Müşteri fatura / teslimat adresi"
                  className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
                />
              </div>
              {!customerId && !alreadyExistsInCompanies && customerName.trim() !== '' && (
                <label className="flex items-center gap-2 text-xs text-[#0B2239] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoEnsureCustomer}
                    onChange={(e) => setAlsoEnsureCustomer(e.target.checked)}
                    className="w-4 h-4 accent-[#0066B3]"
                  />
                  <span>Müşteriyi Carilere otomatik kaydet</span>
                </label>
              )}
            </div>
          </section>

          {/* Line Items & Product Catalog Picker */}
          <section className="border border-[#DCE3EC] rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-[#F3F6FA] border-b border-[#DCE3EC] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-[#0B2239]">
                  Teklif / Proforma Kalemleri ({items.length})
                </h3>
                <p className="text-[11px] text-[#4E5D6C]">
                  Ürünler listesinden seçim yapabilir veya özel kalem ekleyebilirsiniz. Birim fiyatlar seçili{' '}
                  <strong className="text-[#0B2239]">{currency}</strong> para biriminde hesaplanır.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProductPickerOpen((prev) => !prev)}
                  className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#006344] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>
                    {productPickerOpen ? 'Ürün Listesini Gizle' : 'Ürünler Listesinden Seç'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleAddCustomItem}
                  className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-[#0066B3]" />
                  <span>Serbest Kalem Ekle</span>
                </button>
              </div>
            </div>

            {/* Product Catalog Picker Panel */}
            {productPickerOpen && (
              <div className="p-4 bg-[#F8FAFC] border-b border-[#DCE3EC] space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-[#868686] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Ürün adı, stok no, parça no veya tedarikçi firma ara..."
                      className="w-full min-h-[38px] pl-9 pr-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
                    />
                  </div>

                  {/* Multi-Currency Conversion Helper */}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] bg-white border border-[#DCE3EC] rounded-lg px-2.5 py-1.5">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-[#0066B3] shrink-0" />
                    <span className="font-semibold text-[#0B2239]">Kur Çevirici:</span>
                    <label className="inline-flex items-center gap-1">
                      <span className="text-[#4E5D6C]">1 USD=</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={fxRates.USD_TO_TRY}
                        onChange={(e) =>
                          setFxRates((prev) => ({ ...prev, USD_TO_TRY: e.target.value }))
                        }
                        className="w-16 px-1.5 py-0.5 border border-[#DCE3EC] rounded font-mono text-xs text-[#0B2239]"
                      />
                      <span className="text-[#4E5D6C]">TRY</span>
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <span className="text-[#4E5D6C]">1 EUR=</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={fxRates.EUR_TO_TRY}
                        onChange={(e) =>
                          setFxRates((prev) => ({ ...prev, EUR_TO_TRY: e.target.value }))
                        }
                        className="w-16 px-1.5 py-0.5 border border-[#DCE3EC] rounded font-mono text-xs text-[#0B2239]"
                      />
                      <span className="text-[#4E5D6C]">TRY</span>
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <span className="text-[#4E5D6C]">1 EUR=</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={fxRates.EUR_TO_USD}
                        onChange={(e) =>
                          setFxRates((prev) => ({ ...prev, EUR_TO_USD: e.target.value }))
                        }
                        className="w-14 px-1.5 py-0.5 border border-[#DCE3EC] rounded font-mono text-xs text-[#0B2239]"
                      />
                      <span className="text-[#4E5D6C]">USD</span>
                    </label>
                  </div>
                </div>

                {filteredCatalogProducts.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#4E5D6C] bg-white border border-[#DCE3EC] rounded-lg">
                    Ürünler listesinde eşleşen kayıt bulunamadı.
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto border border-[#DCE3EC] rounded-lg bg-white divide-y divide-[#DCE3EC]">
                    {filteredCatalogProducts.map((product) => {
                      const alreadyAdded = items.some((it) => it.productId === product.id);
                      const factor = getConversionFactor(product.currency, currency);
                      const converted = Number((product.offeredSalePrice * factor).toFixed(2));
                      return (
                        <div
                          key={product.id}
                          className="p-2.5 flex items-center justify-between gap-3 hover:bg-[#F3F6FA]/70"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#0B2239] truncate">
                              {product.materialName}
                            </div>
                            <div className="text-[11px] text-[#4E5D6C] truncate">
                              {[
                                product.stockNumber ? `Stok: ${product.stockNumber}` : '',
                                product.partNumber ? `Parça: ${product.partNumber}` : '',
                                product.supplierCompany ? `Firma: ${product.supplierCompany}` : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right font-mono tabular-nums">
                              <div className="text-xs font-bold text-[#0B2239]">
                                {formatCurrency(product.offeredSalePrice, product.currency)}
                              </div>
                              {product.currency !== currency && (
                                <div className="text-[10px] text-[#0066B3]">
                                  → {formatCurrency(converted, currency)}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddProductFromCatalog(product)}
                              className={`min-h-[34px] px-2.5 inline-flex items-center gap-1 text-xs font-semibold rounded-md cursor-pointer ${
                                alreadyAdded
                                  ? 'bg-[#007A53]/15 text-[#007A53] border border-[#007A53]/40'
                                  : 'bg-[#0066B3] hover:bg-[#00508E] text-white'
                              }`}
                            >
                              {alreadyAdded ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Tekrar Ekle</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Ekle</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Items Editor Table */}
            {items.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#4E5D6C]">
                Henüz kalem eklenmedi. Yukarıdaki &ldquo;Ürünler Listesinden Seç&rdquo; veya &ldquo;Serbest Kalem Ekle&rdquo; butonunu kullanın.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0B2239] text-[11px] font-semibold text-slate-200">
                      <th className="py-2.5 px-3">Ürün / Hizmet Adı &amp; Kod</th>
                      <th className="py-2.5 px-2 w-20 text-right">Miktar</th>
                      <th className="py-2.5 px-2 w-24">Birim</th>
                      <th className="py-2.5 px-2 w-32 text-right">Birim Fiyat ({currency})</th>
                      <th className="py-2.5 px-2 w-20 text-right">İsk. %</th>
                      <th className="py-2.5 px-2 w-20 text-right">KDV %</th>
                      <th className="py-2.5 px-3 w-32 text-right">Ara Toplam</th>
                      <th className="py-2.5 px-2 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE3EC] text-xs">
                    {items.map((item, idx) => (
                      <tr key={item.id} className="align-top">
                        <td className="p-2.5 space-y-1.5 min-w-[230px]">
                          <input
                            type="text"
                            required
                            maxLength={SCHEMA_LIMITS.MATERIAL_NAME_MAX}
                            value={item.materialName}
                            onChange={(e) =>
                              updateItemField(idx, 'materialName', e.target.value)
                            }
                            placeholder="Ürün veya hizmet adı *"
                            className="w-full min-h-[34px] px-2.5 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-semibold text-[#0B2239]"
                          />
                          <div className="grid grid-cols-2 gap-1.5">
                            <input
                              type="text"
                              maxLength={SCHEMA_LIMITS.STOCK_NUMBER_MAX}
                              value={item.stockNumber}
                              onChange={(e) =>
                                updateItemField(idx, 'stockNumber', e.target.value)
                              }
                              placeholder="Stok No"
                              className="w-full px-2 py-1 bg-[#F3F6FA] border border-[#DCE3EC] rounded text-[11px] font-mono text-[#0B2239]"
                            />
                            <input
                              type="text"
                              maxLength={SCHEMA_LIMITS.PART_NUMBER_MAX}
                              value={item.partNumber}
                              onChange={(e) =>
                                updateItemField(idx, 'partNumber', e.target.value)
                              }
                              placeholder="Parça No"
                              className="w-full px-2 py-1 bg-[#F3F6FA] border border-[#DCE3EC] rounded text-[11px] font-mono text-[#0B2239]"
                            />
                          </div>
                          <input
                            type="text"
                            maxLength={300}
                            value={item.description}
                            onChange={(e) =>
                              updateItemField(idx, 'description', e.target.value)
                            }
                            placeholder="Teknik açıklama / opsiyonel not"
                            className="w-full px-2 py-1 bg-white border border-[#DCE3EC] rounded text-[11px] text-[#4E5D6C]"
                          />
                        </td>

                        <td className="p-2.5">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItemField(idx, 'quantity', Number(e.target.value))
                            }
                            className="w-full min-h-[34px] px-2 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-mono text-right text-[#0B2239]"
                          />
                        </td>

                        <td className="p-2.5">
                          <select
                            value={item.unit}
                            onChange={(e) => updateItemField(idx, 'unit', e.target.value)}
                            className="w-full min-h-[34px] px-1.5 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs text-[#0B2239]"
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="p-2.5">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateItemField(idx, 'unitPrice', Number(e.target.value))
                            }
                            className="w-full min-h-[34px] px-2 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-mono text-right text-[#0B2239]"
                          />
                          {item.productId && item.sourceCurrency !== currency && (
                            <div className="text-[10px] font-mono text-[#0066B3] text-right mt-0.5">
                              Katalog: {formatCurrency(item.sourceUnitPrice, item.sourceCurrency)}
                            </div>
                          )}
                        </td>

                        <td className="p-2.5">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={item.discountRate}
                            onChange={(e) =>
                              updateItemField(idx, 'discountRate', Number(e.target.value))
                            }
                            className="w-full min-h-[34px] px-2 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-mono text-right text-[#0B2239]"
                          />
                        </td>

                        <td className="p-2.5">
                          <select
                            value={item.vatRate}
                            onChange={(e) =>
                              updateItemField(idx, 'vatRate', Number(e.target.value))
                            }
                            className="w-full min-h-[34px] px-1.5 py-1 bg-white border border-[#DCE3EC] rounded-md text-xs font-mono text-[#0B2239]"
                          >
                            {VAT_RATES.map((v) => (
                              <option key={v} value={v}>
                                %{v}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="p-2.5 text-right font-mono font-bold text-[#0B2239] tabular-nums whitespace-nowrap">
                          <div>{formatCurrency(item.subtotal, currency)}</div>
                          <div className="text-[10px] font-normal text-[#4E5D6C]">
                            +{formatCurrency(item.vatAmount, currency)} KDV
                          </div>
                        </td>

                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            aria-label="Kalemi Sil"
                            className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center text-[#4E5D6C] hover:text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Live Totals Footer */}
            <div className="px-4 py-3 bg-[#F3F6FA] border-t border-[#DCE3EC] flex flex-wrap items-center justify-end gap-6 text-xs">
              <div>
                <span className="text-[#4E5D6C]">Ara Toplam (KDV Hariç): </span>
                <strong className="font-mono text-[#0B2239] tabular-nums">
                  {formatCurrency(totals.subtotalAmount, currency)}
                </strong>
              </div>
              {totals.discountTotal > 0 && (
                <div>
                  <span className="text-[#4E5D6C]">İskonto: </span>
                  <strong className="font-mono text-red-700 tabular-nums">
                    -{formatCurrency(totals.discountTotal, currency)}
                  </strong>
                </div>
              )}
              <div>
                <span className="text-[#4E5D6C]">KDV Toplamı: </span>
                <strong className="font-mono text-[#0B2239] tabular-nums">
                  {formatCurrency(totals.vatTotal, currency)}
                </strong>
              </div>
              <div className="text-sm">
                <span className="text-[#0B2239] font-semibold">Genel Toplam: </span>
                <strong className="font-mono font-bold text-[#007A53] tabular-nums">
                  {formatCurrency(totals.grandTotal, currency)}
                </strong>
              </div>
            </div>
          </section>

          {/* Commercial Terms & Bank Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1">
                Teslimat Koşulları
              </label>
              <input
                type="text"
                maxLength={300}
                value={deliveryTerms}
                onChange={(e) => setDeliveryTerms(e.target.value)}
                className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1">
                Ödeme Koşulları
              </label>
              <input
                type="text"
                maxLength={300}
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1">
                Garanti &amp; Teknik Destek Şartları
              </label>
              <input
                type="text"
                maxLength={300}
                value={warrantyTerms}
                onChange={(e) => setWarrantyTerms(e.target.value)}
                className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1">
                Döviz / Kur Bilgilendirme Notu (Opsiyonel)
              </label>
              <input
                type="text"
                maxLength={200}
                value={exchangeNote}
                onChange={(e) => setExchangeNote(e.target.value)}
                placeholder="Örn: Fatura tarihindeki TCMB Döviz Satış kuru esas alınacaktır."
                className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1">
                Banka &amp; IBAN Bilgisi (Proforma için önerilir)
              </label>
              <input
                type="text"
                maxLength={300}
                value={bankInfo}
                onChange={(e) => setBankInfo(e.target.value)}
                placeholder="Banka Adı · Şube · TR00 0000 0000 0000 0000 0000 00"
                className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1">
                Genel Açıklama / Özel Notlar
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.NOTES_MAX}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Teklif veya proforma belgesinde yer alacak ek not..."
                className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-700 font-medium" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 bg-[#F3F6FA] border-t border-[#DCE3EC] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[42px] px-5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60"
          >
            {saving
              ? 'Kaydediliyor…'
              : editingQuote
              ? 'Belgeyi Güncelle'
              : docType === 'proforma'
              ? 'Proformayı Kaydet'
              : 'Teklifi Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
};
