import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ACCOUNTING_COMPANY_TYPE_LABELS,
  ACCOUNTING_PAYMENT_METHOD_LABELS,
  ACCOUNTING_PAYMENT_STATUS_LABELS,
  AccountingCompany,
  AccountingCompanyType,
  AccountingPaymentMethod,
  AccountingPaymentStatus,
  CurrencyCode,
  SCHEMA_LIMITS,
  Tender,
} from '../types/tender';
import { formatCurrency, getTodayDateStr } from '../lib/trackingAndCalendar';
import { getAuthBearerHeaders } from '../lib/firebase';

export interface ParsedInvoiceItem {
  id: string;
  selected: boolean;
  materialName: string;
  stockNumber: string;
  partNumber: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  subtotalAmount: number;
  vatAmount: number;
  totalAmount: number;
}

export interface InvoicePdfImportPayload {
  direction: 'alis_faturasi' | 'satis_faturasi';
  company: {
    matchedCompanyId: string;
    name: string;
    companyType: AccountingCompanyType;
    taxOffice: string;
    taxNumber: string;
    contactPerson: string;
    phone: string;
    email: string;
    address: string;
    iban: string;
  };
  invoice: {
    invoiceNo: string;
    entryDate: string;
    dueDate: string;
    currency: CurrencyCode;
    paymentMethod: AccountingPaymentMethod;
    paymentStatus: AccountingPaymentStatus;
    paidAmount: number;
    tenderId: string;
    tenderTrackingCode: string;
    notes: string;
    subtotalAmount: number;
    vatAmount: number;
    totalAmount: number;
  };
  items: ParsedInvoiceItem[];
  options: {
    saveCompany: boolean;
    updateMatchedCompanyDetails: boolean;
    saveAccountingEntry: boolean;
    entryGranularity: 'single_invoice' | 'per_item';
    saveProducts: boolean;
  };
}

export interface InvoicePdfImportResult {
  companyCreated: boolean;
  companyUpdated: boolean;
  companyName: string;
  entriesCreated: number;
  productsCreated: number;
  productsSkippedDuplicate: number;
}

interface InvoicePdfImportModalProps {
  open: boolean;
  onClose: () => void;
  ownCompanyName?: string;
  ownTaxNumber?: string;
  companies: AccountingCompany[];
  tenders: Tender[];
  canManageProducts: boolean;
  onConfirmImport: (payload: InvoicePdfImportPayload) => Promise<InvoicePdfImportResult>;
  onImportSuccess?: (result: InvoicePdfImportResult) => void;
}

function normalizeTextKey(val: string): string {
  return (val || '')
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeTaxKey(val: string): string {
  return (val || '').replace(/\D/g, '');
}

function sanitizeIsoDate(val: string, fallback = ''): string {
  const s = (val || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const tr = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (tr) return `${tr[3]}-${tr[2]}-${tr[1]}`;
  return fallback;
}

export const InvoicePdfImportModal: React.FC<InvoicePdfImportModalProps> = ({
  open,
  onClose,
  ownCompanyName = '',
  ownTaxNumber = '',
  companies,
  tenders,
  canManageProducts,
  onConfirmImport,
  onImportSuccess,
}) => {
  const todayStr = getTodayDateStr();

  const [preferredDirection, setPreferredDirection] = useState<
    'auto' | 'alis_faturasi' | 'satis_faturasi'
  >('auto');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [hasParsedData, setHasParsedData] = useState(false);

  // Düzenlenebilir Fatura Durumu
  const [direction, setDirection] = useState<'alis_faturasi' | 'satis_faturasi'>(
    'alis_faturasi'
  );
  const [companyName, setCompanyName] = useState('');
  const [companyType, setCompanyType] = useState<AccountingCompanyType>('tedarikci');
  const [taxOffice, setTaxOffice] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [iban, setIban] = useState('');

  const [invoiceNo, setInvoiceNo] = useState('');
  const [entryDate, setEntryDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('TRY');
  const [paymentMethod, setPaymentMethod] =
    useState<AccountingPaymentMethod>('banka_havale');
  const [paymentStatus, setPaymentStatus] =
    useState<AccountingPaymentStatus>('bekliyor');
  const [paidAmount, setPaidAmount] = useState('0');
  const [tenderId, setTenderId] = useState('');
  const [notes, setNotes] = useState('');

  const [subtotalAmount, setSubtotalAmount] = useState('0');
  const [vatAmount, setVatAmount] = useState('0');
  const [totalAmount, setTotalAmount] = useState('0');

  const [items, setItems] = useState<ParsedInvoiceItem[]>([]);

  // Otomatik kayıt tercihleri
  const [saveCompany, setSaveCompany] = useState(true);
  const [updateMatchedCompanyDetails, setUpdateMatchedCompanyDetails] = useState(true);
  const [saveAccountingEntry, setSaveAccountingEntry] = useState(true);
  const [entryGranularity, setEntryGranularity] = useState<'single_invoice' | 'per_item'>(
    'single_invoice'
  );
  const [saveProducts, setSaveProducts] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPreferredDirection('auto');
    setSelectedFile(null);
    setParsing(false);
    setParseError(null);
    setHasParsedData(false);
    setDirection('alis_faturasi');
    setCompanyName('');
    setCompanyType('tedarikci');
    setTaxOffice('');
    setTaxNumber('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setIban('');
    setInvoiceNo('');
    setEntryDate(todayStr);
    setDueDate('');
    setCurrency('TRY');
    setPaymentMethod('banka_havale');
    setPaymentStatus('bekliyor');
    setPaidAmount('0');
    setTenderId('');
    setNotes('');
    setSubtotalAmount('0');
    setVatAmount('0');
    setTotalAmount('0');
    setItems([]);
    setSaveCompany(true);
    setUpdateMatchedCompanyDetails(true);
    setSaveAccountingEntry(true);
    setEntryGranularity('single_invoice');
    setSaveProducts(canManageProducts);
    setSaving(false);
    setSaveError(null);
  }, [open, todayStr, canManageProducts]);

  // Mevcut Cari Firma ile eşleştirme (önce VKN/TCKN, sonra ünvan)
  const matchedCompany = useMemo(() => {
    const cleanTax = normalizeTaxKey(taxNumber);
    if (cleanTax.length >= 8) {
      const byTax = companies.find((c) => normalizeTaxKey(c.taxNumber) === cleanTax);
      if (byTax) return byTax;
    }
    const cleanName = normalizeTextKey(companyName);
    if (cleanName.length >= 2) {
      const byName = companies.find((c) => normalizeTextKey(c.name) === cleanName);
      if (byName) return byName;
    }
    return null;
  }, [companies, taxNumber, companyName]);

  const normalizeUploadMime = (file: File): string => {
    const raw = (file.type || '').trim().toLowerCase().split(';')[0];
    const lowerName = (file.name || '').trim().toLowerCase();
    if (
      raw === 'application/pdf' ||
      raw === 'application/x-pdf' ||
      raw === 'application/acrobat' ||
      raw === 'application/vnd.pdf'
    ) {
      return 'application/pdf';
    }
    if (raw === 'image/jpg' || raw === 'image/pjpeg') return 'image/jpeg';
    if (raw === 'image/png' || raw === 'image/jpeg' || raw === 'image/webp' || raw === 'image/gif') {
      return raw;
    }
    if (lowerName.endsWith('.pdf')) return 'application/pdf';
    if (lowerName.endsWith('.png')) return 'image/png';
    if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
    if (lowerName.endsWith('.webp')) return 'image/webp';
    if (lowerName.endsWith('.gif')) return 'image/gif';
    return raw;
  };

  const handleAnalyzeFile = async (
    file: File,
    dirOverride?: 'auto' | 'alis_faturasi' | 'satis_faturasi'
  ) => {
    if (file.size > SCHEMA_LIMITS.MAX_FILE_BYTES) {
      setParseError(
        `Dosya boyutu 10 MB sınırını aşıyor (${(file.size / (1024 * 1024)).toFixed(1)} MB).`
      );
      return;
    }

    const mime = normalizeUploadMime(file);
    if (mime !== 'application/pdf' && !mime.startsWith('image/')) {
      setParseError('Lütfen yalnızca PDF veya fatura görseli (PNG/JPG/WEBP) yükleyin.');
      return;
    }

    setSelectedFile(file);
    setParsing(true);
    setParseError(null);
    setSaveError(null);

    try {
      const buildFormData = () => {
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('mimeType', mime);
        fd.append('ownCompanyName', ownCompanyName);
        fd.append('ownTaxNumber', ownTaxNumber);
        fd.append('preferredDirection', dirOverride ?? preferredDirection);
        return fd;
      };

      const apiBase = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
      const parseEndpoint = `${apiBase}api/accounting/parse-invoice-pdf`;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 90000);
      let res: Response;
      try {
        let headers = await getAuthBearerHeaders();
        res = await fetch(parseEndpoint, {
          method: 'POST',
          headers: { Authorization: headers.Authorization },
          body: buildFormData(),
          signal: controller.signal,
        });
        if (res.status === 401) {
          headers = await getAuthBearerHeaders(true);
          res = await fetch(parseEndpoint, {
            method: 'POST',
            headers: { Authorization: headers.Authorization },
            body: buildFormData(),
            signal: controller.signal,
          });
        }
      } finally {
        window.clearTimeout(timeoutId);
      }

      const rawText = await res.text();
      let data: Record<string, any> = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText) as Record<string, any>;
        } catch {
          data = {};
        }
      }

      if (!res.ok) {
        if (data?.error) {
          throw new Error(String(data.error));
        }
        if (res.status === 413) {
          throw new Error('Yüklenen fatura dosyası sunucu boyut sınırını (10 MB) aşıyor.');
        }
        if (res.status === 429) {
          throw new Error('Çok fazla analiz isteği gönderildi. Lütfen kısa bir süre sonra tekrar deneyin.');
        }
        if (res.status === 401 || res.status === 403) {
          throw new Error('Oturum doğrulaması geçersiz veya süresi dolmuş. Lütfen sayfayı yenileyip tekrar deneyin.');
        }
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          throw new Error(
            'Yapay zeka çözümleme servisi şu anda yoğun veya yanıt süresi aşıldı. Lütfen birkaç saniye sonra tekrar deneyin.'
          );
        }
        throw new Error(`Fatura PDF dosyası çözümlenemedi (HTTP ${res.status}).`);
      }

      const detectedDir: 'alis_faturasi' | 'satis_faturasi' =
        data.detectedDirection === 'satis_faturasi' ? 'satis_faturasi' : 'alis_faturasi';

      setDirection(detectedDir);
      setCompanyType(detectedDir === 'satis_faturasi' ? 'musteri' : 'tedarikci');

      const cp = data.counterparty || {};
      setCompanyName(String(cp.name || '').trim());
      setTaxOffice(String(cp.taxOffice || '').trim());
      setTaxNumber(String(cp.taxNumber || '').trim());
      setContactPerson(String(cp.contactPerson || '').trim());
      setPhone(String(cp.phone || '').trim());
      setEmail(String(cp.email || '').trim());
      setAddress(String(cp.address || '').trim());
      setIban(String(cp.iban || '').trim());

      setInvoiceNo(String(data.invoiceNo || '').trim());
      setEntryDate(sanitizeIsoDate(String(data.invoiceDate || ''), todayStr));
      setDueDate(sanitizeIsoDate(String(data.dueDate || ''), ''));
      setCurrency(
        data.currency === 'USD' || data.currency === 'EUR' ? data.currency : 'TRY'
      );
      setPaymentMethod(
        data.paymentMethodHint === 'nakit' ||
          data.paymentMethodHint === 'kredi_karti' ||
          data.paymentMethodHint === 'cek_senet' ||
          data.paymentMethodHint === 'vadeli'
          ? data.paymentMethodHint
          : 'banka_havale'
      );
      setNotes(String(data.notes || '').trim());

      const parsedItems: ParsedInvoiceItem[] = Array.isArray(data.items)
        ? data.items.map((it: Record<string, unknown>, idx: number) => {
            const quantity = Math.max(0.001, Number(it.quantity) || 1);
            const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
            const vatRate = Math.max(0, Math.min(100, Number(it.vatRate) || 0));
            const sub =
              Math.max(0, Number(it.subtotalAmount) || 0) ||
              Number((quantity * unitPrice).toFixed(2));
            const vat =
              Math.max(0, Number(it.vatAmount) || 0) ||
              Number(((sub * vatRate) / 100).toFixed(2));
            const tot =
              Math.max(0, Number(it.totalAmount) || 0) || Number((sub + vat).toFixed(2));
            return {
              id: `item-${Date.now()}-${idx}`,
              selected: true,
              materialName: String(it.materialName || '').trim(),
              stockNumber: String(it.stockNumber || '').trim(),
              partNumber: String(it.partNumber || '').trim(),
              quantity,
              unit: String(it.unit || 'Adet').trim() || 'Adet',
              unitPrice,
              vatRate,
              subtotalAmount: sub,
              vatAmount: vat,
              totalAmount: tot,
            };
          })
        : [];

      const totObj = data.totals || {};
      const subTotal = Number(totObj.subtotalAmount) || 0;
      const vatTotal = Number(totObj.vatAmount) || 0;
      const grandTotal =
        Number(totObj.totalAmount) || Number((subTotal + vatTotal).toFixed(2));

      setSubtotalAmount(subTotal.toFixed(2));
      setVatAmount(vatTotal.toFixed(2));
      setTotalAmount(grandTotal.toFixed(2));

      if (parsedItems.length === 0 && (grandTotal > 0 || subTotal > 0)) {
        const inferredVatRate =
          subTotal > 0 ? Math.round((vatTotal / subTotal) * 100) : 20;
        parsedItems.push({
          id: `item-${Date.now()}-0`,
          selected: true,
          materialName: data.invoiceNo
            ? `Fatura ${data.invoiceNo} Mal/Hizmet Bedeli`
            : 'Fatura Mal/Hizmet Bedeli',
          stockNumber: '',
          partNumber: '',
          quantity: 1,
          unit: 'Adet',
          unitPrice: subTotal || grandTotal,
          vatRate: Math.max(0, Math.min(100, inferredVatRate)),
          subtotalAmount: subTotal || grandTotal,
          vatAmount: vatTotal,
          totalAmount: grandTotal,
        });
      }

      setItems(parsedItems);
      setHasParsedData(true);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setParseError(
          'Fatura okuma isteği zaman aşımına uğradı. Lütfen birkaç saniye sonra tekrar deneyin.'
        );
      } else if (
        err instanceof Error &&
        /failed to fetch|networkerror|load failed/i.test(err.message)
      ) {
        setParseError(
          'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip birkaç saniye sonra tekrar deneyin.'
        );
      } else {
        setParseError(
          err instanceof Error ? err.message : 'PDF fatura çözümlenirken hata oluştu.'
        );
      }
    } finally {
      setParsing(false);
    }
  };

  const handleUpdateItem = (
    itemId: string,
    patch: Partial<ParsedInvoiceItem>,
    recalculateLine = false
  ) => {
    setItems((prev) =>
      prev.map((row) => {
        if (row.id !== itemId) return row;
        const next = { ...row, ...patch };
        if (recalculateLine) {
          const sub = Number((next.quantity * next.unitPrice).toFixed(2));
          const vat = Number(((sub * next.vatRate) / 100).toFixed(2));
          next.subtotalAmount = sub;
          next.vatAmount = vat;
          next.totalAmount = Number((sub + vat).toFixed(2));
        }
        return next;
      })
    );
  };

  const handleAddBlankItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${prev.length}`,
        selected: true,
        materialName: '',
        stockNumber: '',
        partNumber: '',
        quantity: 1,
        unit: 'Adet',
        unitPrice: 0,
        vatRate: 20,
        subtotalAmount: 0,
        vatAmount: 0,
        totalAmount: 0,
      },
    ]);
  };

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  const handleRecalculateTotalsFromItems = () => {
    const active = items.filter((i) => i.selected);
    const sub = active.reduce((acc, i) => acc + (Number(i.subtotalAmount) || 0), 0);
    const vat = active.reduce((acc, i) => acc + (Number(i.vatAmount) || 0), 0);
    const tot = active.reduce((acc, i) => acc + (Number(i.totalAmount) || 0), 0);
    setSubtotalAmount(sub.toFixed(2));
    setVatAmount(vat.toFixed(2));
    setTotalAmount((tot > 0 ? tot : sub + vat).toFixed(2));
  };

  const selectedItemsCount = useMemo(
    () => items.filter((i) => i.selected && i.materialName.trim().length > 0).length,
    [items]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    const trimmedCompany = companyName.trim();
    if (!trimmedCompany) {
      setSaveError('Lütfen karşı Cari Firma ünvanını girin veya doğrulayın.');
      return;
    }

    const safeEntryDate = sanitizeIsoDate(entryDate, '');
    if (!safeEntryDate) {
      setSaveError('Lütfen geçerli bir fatura düzenleme tarihi seçin.');
      return;
    }

    const validItems = items
      .filter((i) => i.selected && i.materialName.trim().length > 0)
      .map((i) => ({
        ...i,
        materialName: i.materialName.trim(),
        stockNumber: i.stockNumber.trim(),
        partNumber: i.partNumber.trim(),
        unit: i.unit.trim() || 'Adet',
      }));

    if ((saveProducts || entryGranularity === 'per_item') && validItems.length === 0) {
      setSaveError('Lütfen en az bir fatura kalemini seçili bırakın ve ürün adını girin.');
      return;
    }

    const subNum = Math.max(0, Number(subtotalAmount) || 0);
    const vatNum = Math.max(0, Number(vatAmount) || 0);
    const totNum = Math.max(0, Number(totalAmount) || 0) || Number((subNum + vatNum).toFixed(2));
    const paidNum =
      paymentStatus === 'odendi'
        ? totNum
        : paymentStatus === 'bekliyor' || paymentStatus === 'iptal'
        ? 0
        : Math.min(totNum, Math.max(0, Number(paidAmount) || 0));

    const linkedTender = tenders.find((t) => t.id === tenderId);

    setSaving(true);
    try {
      const result = await onConfirmImport({
        direction,
        company: {
          matchedCompanyId: matchedCompany?.id || '',
          name: trimmedCompany,
          companyType,
          taxOffice: taxOffice.trim(),
          taxNumber: taxNumber.trim(),
          contactPerson: contactPerson.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          iban: iban.trim(),
        },
        invoice: {
          invoiceNo: invoiceNo.trim(),
          entryDate: safeEntryDate,
          dueDate: sanitizeIsoDate(dueDate, ''),
          currency,
          paymentMethod,
          paymentStatus,
          paidAmount: paidNum,
          tenderId: linkedTender?.id || '',
          tenderTrackingCode: linkedTender?.trackingCode || '',
          notes: notes.trim(),
          subtotalAmount: subNum,
          vatAmount: vatNum,
          totalAmount: totNum,
        },
        items: validItems,
        options: {
          saveCompany: !matchedCompany && saveCompany,
          updateMatchedCompanyDetails: Boolean(matchedCompany && updateMatchedCompanyDetails),
          saveAccountingEntry,
          entryGranularity,
          saveProducts: canManageProducts && saveProducts,
        },
      });
      onImportSuccess?.(result);
      onClose();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Fatura verileri kaydedilirken hata oluştu.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-invoice-modal-title"
    >
      <div className="bg-white border border-[#DCE3EC] rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Başlık */}
        <div className="px-5 py-4 bg-[#0B2239] text-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#143252] border border-[#1E4063] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-[#FBBF24]" />
            </div>
            <div className="min-w-0">
              <h2
                id="pdf-invoice-modal-title"
                className="font-display text-base font-bold truncate"
              >
                PDF Fatura Yükle &amp; Cari / Ürün Otomatik Kayıt
              </h2>
              <p className="text-xs text-slate-300 truncate">
                Bize kesilen veya bizim kestiğimiz faturayı yükleyin; Cari Firma, Ön Muhasebe kaydı ve Ürünler otomatik çıkarılsın.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-lg bg-[#143252] hover:bg-[#1E4063] text-slate-200 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Adım 1: Yön Ön Seçimi + PDF Yükleme Alanı */}
          <section className="p-4 bg-[#F3F6FA]/75 border border-[#DCE3EC] rounded-xl space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#0B2239]">
                  1. Fatura PDF Dosyasını Seçin (Maks. 10 MB)
                </div>
                <div className="text-[11px] text-[#4E5D6C]">
                  e-Fatura, e-Arşiv PDF veya net fatura görseli yükleyebilirsiniz.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-[#4E5D6C] mr-1">
                  Fatura Yönü:
                </span>
                {(
                  [
                    { id: 'auto', label: 'Otomatik Algıla' },
                    { id: 'alis_faturasi', label: 'Bize Kesilen (Alış)' },
                    { id: 'satis_faturasi', label: 'Kestiğimiz (Satış)' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={parsing}
                    onClick={() => {
                      setPreferredDirection(opt.id);
                      if (selectedFile && hasParsedData) {
                        handleAnalyzeFile(selectedFile, opt.id);
                      }
                    }}
                    className={`min-h-[34px] px-3 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                      preferredDirection === opt.id
                        ? 'bg-[#0B2239] text-white'
                        : 'bg-white border border-[#DCE3EC] text-[#4E5D6C] hover:text-[#0B2239]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <label className="flex-1 min-h-[76px] px-4 py-3 border-2 border-dashed border-[#0066B3]/45 bg-white hover:bg-[#0066B3]/5 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[#0066B3]/10 text-[#0066B3] flex items-center justify-center shrink-0">
                    {parsing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : selectedFile ? (
                      <FileText className="w-5 h-5" />
                    ) : (
                      <Upload className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#0B2239] truncate">
                      {parsing
                        ? 'Fatura çözümleniyor, cari ve ürünler çıkarılıyor…'
                        : selectedFile
                        ? selectedFile.name
                        : 'Fatura PDF veya Görsel Seçmek İçin Tıklayın'}
                    </div>
                    <div className="text-[11px] text-[#4E5D6C] mt-0.5">
                      {selectedFile
                        ? `${(selectedFile.size / 1024).toFixed(0)} KB · Değiştirmek için tıklayın`
                        : 'PDF, PNG veya JPG · Satıcı/Alıcı, KDV, Kalemler otomatik tanınır'}
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1.5 bg-[#0066B3] text-white text-xs font-semibold rounded-lg shrink-0">
                  {selectedFile ? 'Dosya Değiştir' : 'PDF Seç'}
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={parsing}
                  onChange={(ev) => {
                    const file = ev.target.files?.[0];
                    if (file) handleAnalyzeFile(file);
                    ev.target.value = '';
                  }}
                />
              </label>

              {selectedFile && !parsing && (
                <button
                  type="button"
                  onClick={() => handleAnalyzeFile(selectedFile)}
                  className="min-h-[44px] px-4 inline-flex items-center justify-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-xl cursor-pointer shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#0066B3]" />
                  <span>Yeniden Çözümle</span>
                </button>
              )}
            </div>

            {parseError && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
          </section>

          {/* Adım 2: Çıkarılan Verileri İncele ve Düzenle */}
          {hasParsedData && (
            <>
              {/* Fatura Yönü ve Üst Bilgiler */}
              <section className="p-4 border border-[#DCE3EC] rounded-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#DCE3EC]">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-[#0066B3]" />
                    <h3 className="font-display text-sm font-bold text-[#0B2239]">
                      2. Fatura Bilgileri ve Yönü
                    </h3>
                  </div>

                  <div className="inline-flex rounded-lg border border-[#DCE3EC] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setDirection('alis_faturasi');
                        setCompanyType('tedarikci');
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                        direction === 'alis_faturasi'
                          ? 'bg-[#0066B3] text-white'
                          : 'bg-white text-[#4E5D6C] hover:bg-[#F3F6FA]'
                      }`}
                    >
                      Bize Kesilen (Alış Faturası)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDirection('satis_faturasi');
                        setCompanyType('musteri');
                      }}
                      className={`px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                        direction === 'satis_faturasi'
                          ? 'bg-[#007A53] text-white'
                          : 'bg-white text-[#4E5D6C] hover:bg-[#F3F6FA]'
                      }`}
                    >
                      Kestiğimiz (Satış Faturası)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Fatura / Belge No
                    </label>
                    <input
                      type="text"
                      value={invoiceNo}
                      maxLength={SCHEMA_LIMITS.INVOICE_NO_MAX}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      placeholder="Örn: GIB2026000000123"
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Fatura Tarihi *
                    </label>
                    <input
                      type="date"
                      required
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Vade Tarihi
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Para Birimi
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-mono font-semibold text-[#0B2239]"
                    >
                      <option value="TRY">TRY (₺)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Ödeme Yöntemi
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) =>
                        setPaymentMethod(e.target.value as AccountingPaymentMethod)
                      }
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
                    >
                      {(
                        Object.keys(
                          ACCOUNTING_PAYMENT_METHOD_LABELS
                        ) as AccountingPaymentMethod[]
                      ).map((m) => (
                        <option key={m} value={m}>
                          {ACCOUNTING_PAYMENT_METHOD_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Ödeme Durumu
                    </label>
                    <select
                      value={paymentStatus}
                      onChange={(e) =>
                        setPaymentStatus(e.target.value as AccountingPaymentStatus)
                      }
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
                    >
                      {(
                        Object.keys(
                          ACCOUNTING_PAYMENT_STATUS_LABELS
                        ) as AccountingPaymentStatus[]
                      ).map((st) => (
                        <option key={st} value={st}>
                          {ACCOUNTING_PAYMENT_STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {paymentStatus === 'kismi' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                        Ödenen Kısım ({currency})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239]"
                      />
                    </div>
                  )}

                  <div className={paymentStatus === 'kismi' ? '' : 'lg:col-span-2'}>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Bağlı İhale (Opsiyonel)
                    </label>
                    <select
                      value={tenderId}
                      onChange={(e) => setTenderId(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
                    >
                      <option value="">İhale Bağlantısı Yok</option>
                      {tenders.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.trackingCode} — {t.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Karşı Cari Firma Kartı */}
              <section className="p-4 border border-[#DCE3EC] rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#DCE3EC]">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#0066B3]" />
                    <h3 className="font-display text-sm font-bold text-[#0B2239]">
                      3. Karşı Cari Firma ({direction === 'alis_faturasi' ? 'Tedarikçi / Satıcı' : 'Müşteri / Alıcı'})
                    </h3>
                  </div>

                  {matchedCompany ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#007A53]/15 text-[#007A53] text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mevcut Cari Eşleşti: {matchedCompany.name}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0066B3]/10 text-[#0066B3] text-xs font-bold">
                      <Plus className="w-3.5 h-3.5" />
                      <span>Yeni Cari Firma Oluşturulacak</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Firma Ünvanı *
                    </label>
                    <input
                      type="text"
                      required
                      value={companyName}
                      maxLength={SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Firma ünvanı"
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-semibold text-[#0B2239] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Cari Türü
                    </label>
                    <select
                      value={companyType}
                      onChange={(e) =>
                        setCompanyType(e.target.value as AccountingCompanyType)
                      }
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
                    >
                      {(
                        Object.keys(
                          ACCOUNTING_COMPANY_TYPE_LABELS
                        ) as AccountingCompanyType[]
                      ).map((ct) => (
                        <option key={ct} value={ct}>
                          {ACCOUNTING_COMPANY_TYPE_LABELS[ct]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Vergi Dairesi
                    </label>
                    <input
                      type="text"
                      value={taxOffice}
                      maxLength={SCHEMA_LIMITS.TAX_OFFICE_MAX}
                      onChange={(e) => setTaxOffice(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      VKN / TCKN
                    </label>
                    <input
                      type="text"
                      value={taxNumber}
                      maxLength={SCHEMA_LIMITS.TAX_NUMBER_MAX}
                      onChange={(e) => setTaxNumber(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Telefon
                    </label>
                    <input
                      type="text"
                      value={phone}
                      maxLength={SCHEMA_LIMITS.PHONE_MAX}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      E-posta
                    </label>
                    <input
                      type="text"
                      value={email}
                      maxLength={SCHEMA_LIMITS.EMAIL_MAX}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      IBAN
                    </label>
                    <input
                      type="text"
                      value={iban}
                      maxLength={SCHEMA_LIMITS.IBAN_MAX}
                      onChange={(e) => setIban(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Yetkili Kişi
                    </label>
                    <input
                      type="text"
                      value={contactPerson}
                      maxLength={SCHEMA_LIMITS.PERSON_MAX}
                      onChange={(e) => setContactPerson(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:bg-white"
                    />
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Adres
                    </label>
                    <input
                      type="text"
                      value={address}
                      maxLength={SCHEMA_LIMITS.ADDRESS_MAX}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:bg-white"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  {!matchedCompany ? (
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B2239] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveCompany}
                        onChange={(e) => setSaveCompany(e.target.checked)}
                        className="w-4 h-4 accent-[#0066B3]"
                      />
                      <span>Bu firmayı Cari Firmalar listesine otomatik kaydet</span>
                    </label>
                  ) : (
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B2239] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={updateMatchedCompanyDetails}
                        onChange={(e) => setUpdateMatchedCompanyDetails(e.target.checked)}
                        className="w-4 h-4 accent-[#0066B3]"
                      />
                      <span>
                        Mevcut cari kartındaki eksik bilgileri (Vergi No, Adres, Telefon, IBAN) faturadan tamamla
                      </span>
                    </label>
                  )}
                </div>
              </section>

              {/* Fatura Kalemleri & Otomatik Ürün Kaydı */}
              <section className="p-4 border border-[#DCE3EC] rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#DCE3EC]">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#0066B3]" />
                    <h3 className="font-display text-sm font-bold text-[#0B2239]">
                      4. Fatura Kalemleri &amp; Ürünler ({selectedItemsCount}/{items.length} seçili)
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRecalculateTotalsFromItems}
                      className="min-h-[34px] px-3 inline-flex items-center gap-1.5 bg-[#F3F6FA] hover:bg-[#DCE3EC]/70 text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-[#0066B3]" />
                      <span>Kalemlerden Toplamı Hesapla</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddBlankItem}
                      className="min-h-[34px] px-3 inline-flex items-center gap-1 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#0066B3]" />
                      <span>Kalem Ekle</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-[#DCE3EC] rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#0B2239] text-slate-200 font-semibold">
                        <th className="py-2.5 px-2.5 text-center w-9">Seç</th>
                        <th className="py-2.5 px-2.5 min-w-[180px]">Ürün / Hizmet Adı</th>
                        <th className="py-2.5 px-2 w-24">Stok No</th>
                        <th className="py-2.5 px-2 w-24">Parça No</th>
                        <th className="py-2.5 px-2 w-20 text-right">Miktar</th>
                        <th className="py-2.5 px-2 w-20">Birim</th>
                        <th className="py-2.5 px-2 w-28 text-right">Birim Fiyat</th>
                        <th className="py-2.5 px-2 w-16 text-right">KDV %</th>
                        <th className="py-2.5 px-2.5 w-28 text-right">KDV Hariç</th>
                        <th className="py-2.5 px-2 w-10 text-center">Sil</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE3EC]">
                      {items.length === 0 ? (
                        <tr>
                          <td
                            colSpan={10}
                            className="py-6 text-center text-xs text-[#4E5D6C]"
                          >
                            Kalem bulunamadı. Sağ üstten &ldquo;Kalem Ekle&rdquo; ile manuel satır ekleyebilirsiniz.
                          </td>
                        </tr>
                      ) : (
                        items.map((row) => (
                          <tr
                            key={row.id}
                            className={row.selected ? 'bg-white' : 'bg-[#F3F6FA]/60 opacity-60'}
                          >
                            <td className="py-2 px-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={row.selected}
                                onChange={(e) =>
                                  handleUpdateItem(row.id, { selected: e.target.checked })
                                }
                                className="w-4 h-4 accent-[#0066B3] cursor-pointer"
                              />
                            </td>
                            <td className="py-2 px-2.5">
                              <input
                                type="text"
                                value={row.materialName}
                                maxLength={SCHEMA_LIMITS.MATERIAL_NAME_MAX}
                                onChange={(e) =>
                                  handleUpdateItem(row.id, { materialName: e.target.value })
                                }
                                placeholder="Malzeme / ürün adı"
                                className="w-full px-2 py-1 bg-[#F3F6FA] border border-[#DCE3EC] rounded text-xs text-[#0B2239] focus:bg-white"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={row.stockNumber}
                                maxLength={SCHEMA_LIMITS.STOCK_NUMBER_MAX}
                                onChange={(e) =>
                                  handleUpdateItem(row.id, { stockNumber: e.target.value })
                                }
                                placeholder="Stok"
                                className="w-full px-2 py-1 bg-[#F3F6FA] border border-[#DCE3EC] rounded text-xs font-mono text-[#0B2239] focus:bg-white"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={row.partNumber}
                                maxLength={SCHEMA_LIMITS.PART_NUMBER_MAX}
                                onChange={(e) =>
                                  handleUpdateItem(row.id, { partNumber: e.target.value })
                                }
                                placeholder="Parça"
                                className="w-full px-2 py-1 bg-[#F3F6FA] border border-[#DCE3EC] rounded text-xs font-mono text-[#0B2239] focus:bg-white"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={row.quantity}
                                onChange={(e) =>
                                  handleUpdateItem(
                                    row.id,
                                    { quantity: Math.max(0, Number(e.target.value) || 0) },
                                    true
                                  )
                                }
                                className="w-full px-2 py-1 bg-[#F3F6FA] border border-[#DCE3EC] rounded text-xs font-mono text-right text-[#0B2239] focus:bg-white"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={row.unit}
                                maxLength={SCHEMA_LIMITS.UNIT_MAX}
                                onChange={(e) =>
                                  handleUpdateItem(row.id, { unit: e.target.value })
                                }
                                className="w-full px-2 py-1 bg-[#F3F6FA] border border-[#DCE3EC] rounded text-xs text-[#0B2239] focus:bg-white"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={row.unitPrice}
                                onChange={(e) =>
                                  handleUpdateItem(
                                    row.id,
                                    { unitPrice: Math.max(0, Number(e.target.value) || 0) },
                                    true
                                  )
                                }
                                className="w-full px-2 py-1 bg-[#F3F6FA] border border-[#DCE3EC] rounded text-xs font-mono text-right text-[#0B2239] focus:bg-white"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                value={row.vatRate}
                                onChange={(e) =>
                                  handleUpdateItem(
                                    row.id,
                                    {
                                      vatRate: Math.max(
                                        0,
                                        Math.min(100, Number(e.target.value) || 0)
                                      ),
                                    },
                                    true
                                  )
                                }
                                className="w-full px-2 py-1 bg-[#F3F6FA] border border-[#DCE3EC] rounded text-xs font-mono text-right text-[#0B2239] focus:bg-white"
                              />
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono font-semibold text-[#0B2239] whitespace-nowrap">
                              {formatCurrency(row.subtotalAmount, currency)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(row.id)}
                                aria-label="Satırı Sil"
                                className="p-1 text-[#4E5D6C] hover:text-red-700 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Fatura Toplamları */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Fatura KDV Hariç Matrah ({currency})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={subtotalAmount}
                      onChange={(e) => setSubtotalAmount(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-mono font-bold text-[#0B2239]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Fatura Toplam KDV ({currency})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={vatAmount}
                      onChange={(e) => setVatAmount(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-mono font-bold text-[#0066B3]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                      Fatura Genel Toplam ({currency})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-mono font-bold text-[#007A53]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#4E5D6C] mb-1">
                    Fatura Notları / ETTN / Açıklama
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    maxLength={SCHEMA_LIMITS.NOTES_MAX}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:bg-white"
                  />
                </div>
              </section>

              {/* Adım 5: Otomatik Kayıt Seçenekleri */}
              <section className="p-4 bg-[#F3F6FA]/75 border border-[#DCE3EC] rounded-xl space-y-3">
                <div className="text-xs font-bold text-[#0B2239]">
                  5. Otomatik Kayıt Seçenekleri
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B2239] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveAccountingEntry}
                        onChange={(e) => setSaveAccountingEntry(e.target.checked)}
                        className="w-4 h-4 accent-[#0066B3]"
                      />
                      <span>
                        Faturayı Ön Muhasebe defterine işle (KDV &amp; Kurumlar Vergisi raporlarına dahil et)
                      </span>
                    </label>

                    {saveAccountingEntry && items.length > 1 && (
                      <select
                        value={entryGranularity}
                        onChange={(e) =>
                          setEntryGranularity(
                            e.target.value as 'single_invoice' | 'per_item'
                          )
                        }
                        className="min-h-[34px] px-2.5 py-1 bg-white border border-[#DCE3EC] rounded-lg text-xs font-medium text-[#0B2239]"
                      >
                        <option value="single_invoice">
                          Tek Fatura Kaydı Olarak İşle (Önerilen)
                        </option>
                        <option value="per_item">
                          Her Ürün Kalemi İçin Ayrı Muhasebe Kaydı Oluştur
                        </option>
                      </select>
                    )}
                  </div>

                  <div>
                    <label
                      className={`inline-flex items-center gap-2 text-xs font-semibold ${
                        canManageProducts
                          ? 'text-[#0B2239] cursor-pointer'
                          : 'text-[#868686] cursor-not-allowed'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={canManageProducts && saveProducts}
                        disabled={!canManageProducts}
                        onChange={(e) => setSaveProducts(e.target.checked)}
                        className="w-4 h-4 accent-[#0066B3]"
                      />
                      <span>
                        Seçili {selectedItemsCount} ürünü Teklif Ürünleri / Ürün Veritabanına (firma ve birim fiyatıyla) otomatik kaydet
                      </span>
                    </label>
                    {!canManageProducts && (
                      <div className="text-[11px] text-amber-700 mt-0.5 ml-6">
                        Ürün kartı oluşturma yetkiniz (`canManageProducts`) bulunmadığı için ürünler veritabanına eklenmeyecek.
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}

          {saveError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium"
            >
              {saveError}
            </div>
          )}

          <div className="pt-2 border-t border-[#DCE3EC] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || parsing}
              className="min-h-[42px] px-4 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={!hasParsedData || saving || parsing}
              className="min-h-[42px] px-5 inline-flex items-center gap-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Kaydediliyor…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#34D399]" />
                  <span>Onayla ve Otomatik Kaydet</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
