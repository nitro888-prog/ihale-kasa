import React, { useMemo, useState } from 'react';
import {
  Building2,
  Calculator,
  CheckCircle2,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  Landmark,
  Lock,
  Maximize2,
  Package,
  Plus,
  Receipt,
  Search,
  Trash2,
  Upload,
  UserPlus,
  BarChart3,
} from 'lucide-react';
import {
  ACCOUNTING_CHEQUE_DIRECTION_LABELS,
  ACCOUNTING_CHEQUE_STATUS_LABELS,
  ACCOUNTING_COMPANY_TYPE_LABELS,
  ACCOUNTING_ENTRY_TYPE_LABELS,
  ACCOUNTING_PAYMENT_METHOD_LABELS,
  ACCOUNTING_PAYMENT_STATUS_LABELS,
  AccountingCheque,
  AccountingChequeDirection,
  AccountingChequeStatus,
  AccountingCompany,
  AccountingEntry,
  AccountingEntryType,
  AccountingPaymentStatus,
  BidProduct,
  CurrencyCode,
  isOwnRecord,
  Tender,
} from '../types/tender';
import { formatCurrency, formatTurkishDate } from '../lib/trackingAndCalendar';
import { BidProductPrefill } from './BidProductFormModal';
import { AccountingEntryPrefill } from './AccountingEntryModal';
import { AccountingChequePrefill } from './AccountingChequeModal';
import { AccountingReportsSection } from './AccountingReportsSection';
import {
  InvoicePdfImportModal,
  InvoicePdfImportPayload,
  InvoicePdfImportResult,
} from './InvoicePdfImportModal';

type AccountingSubTab =
  | 'entries'
  | 'cheques'
  | 'companies'
  | 'reports'
  | 'product_comparison'
  | 'tender_profit';

interface AccountingViewProps {
  currentUid: string;
  companyName?: string;
  ownTaxNumber?: string;
  companies: AccountingCompany[];
  entries: AccountingEntry[];
  cheques: AccountingCheque[];
  bidProducts: BidProduct[];
  tenders: Tender[];
  canManageAccounting: boolean;
  canManageProducts: boolean;
  onNewEntry: (prefill?: AccountingEntryPrefill) => void;
  onImportInvoicePdf: (payload: InvoicePdfImportPayload) => Promise<InvoicePdfImportResult>;
  onViewEntry: (entry: AccountingEntry) => void;
  onEditEntry: (entry: AccountingEntry) => void;
  onMarkEntryPaid: (entry: AccountingEntry) => Promise<void> | void;
  onDeleteEntry: (entry: AccountingEntry) => Promise<void> | void;
  onNewCheque: (prefill?: AccountingChequePrefill) => void;
  onViewCheque: (cheque: AccountingCheque) => void;
  onEditCheque: (cheque: AccountingCheque) => void;
  onUpdateChequeStatus: (
    cheque: AccountingCheque,
    nextStatus: AccountingChequeStatus,
    endorsedTo?: string
  ) => Promise<void> | void;
  onDeleteCheque: (cheque: AccountingCheque) => Promise<void> | void;
  onNewCompany: (initialName?: string) => void;
  onEditCompany: (company: AccountingCompany) => void;
  onDeleteCompany: (company: AccountingCompany) => Promise<void> | void;
  onImportCompaniesFromProducts: (names: string[]) => Promise<number>;
  onAddProductForAnotherCompany: (tenderId: string, prefill: BidProductPrefill) => void;
  onSelectTenderId: (tenderId: string) => void;
  onViewProduct: (product: BidProduct) => void;
}

const CURRENCIES: CurrencyCode[] = ['TRY', 'USD', 'EUR'];

function normalizeKey(val: string): string {
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

export const AccountingView: React.FC<AccountingViewProps> = ({
  currentUid,
  companyName,
  ownTaxNumber,
  companies,
  entries,
  cheques,
  bidProducts,
  tenders,
  canManageAccounting,
  canManageProducts,
  onNewEntry,
  onImportInvoicePdf,
  onViewEntry,
  onEditEntry,
  onMarkEntryPaid,
  onDeleteEntry,
  onNewCheque,
  onViewCheque,
  onEditCheque,
  onUpdateChequeStatus,
  onDeleteCheque,
  onNewCompany,
  onEditCompany,
  onDeleteCompany,
  onImportCompaniesFromProducts,
  onAddProductForAnotherCompany,
  onSelectTenderId,
  onViewProduct,
}) => {
  const [subTab, setSubTab] = useState<AccountingSubTab>('entries');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | AccountingEntryType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountingPaymentStatus>('all');
  const [chequeDirectionFilter, setChequeDirectionFilter] = useState<
    'all' | AccountingChequeDirection
  >('all');
  const [chequeStatusFilter, setChequeStatusFilter] = useState<'all' | AccountingChequeStatus>(
    'all'
  );
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | CurrencyCode>('all');
  const [importingCompanies, setImportingCompanies] = useState(false);
  const [pdfImportModalOpen, setPdfImportModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // KPI Özetleri (Para birimi bazlı)
  const kpiSummary = useMemo(() => {
    const createBuckets = (): Record<CurrencyCode, number> => ({ TRY: 0, USD: 0, EUR: 0 });
    const sales = createBuckets();
    const purchasesAndExpenses = createBuckets();
    const openReceivables = createBuckets();
    const openPayables = createBuckets();
    let overdueCount = 0;
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const e of entries) {
      if (e.paymentStatus === 'iptal') continue;
      const cur = e.currency || 'TRY';
      const remaining = Math.max(0, e.totalAmount - (e.paidAmount || 0));

      if (e.entryType === 'satis_faturasi') {
        sales[cur] += e.totalAmount;
        if (e.paymentStatus !== 'odendi') {
          openReceivables[cur] += remaining;
        }
      } else if (e.entryType === 'alis_faturasi' || e.entryType === 'gider') {
        purchasesAndExpenses[cur] += e.totalAmount;
        if (e.paymentStatus !== 'odendi') {
          openPayables[cur] += remaining;
        }
      }

      if (
        (e.paymentStatus === 'bekliyor' || e.paymentStatus === 'kismi') &&
        e.dueDate &&
        e.dueDate < todayStr
      ) {
        overdueCount += 1;
      }
    }

    return { sales, purchasesAndExpenses, openReceivables, openPayables, overdueCount };
  }, [entries]);

  const formatBuckets = (buckets: Record<CurrencyCode, number>) => {
    const active = CURRENCIES.filter((c) => Math.abs(buckets[c]) > 0.001);
    if (active.length === 0) return formatCurrency(0, 'TRY');
    return active.map((c) => formatCurrency(buckets[c], c)).join(' · ');
  };

  // Tüm işlemlerde geçen firma listesi
  const allCompanyNames = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => c.name && set.add(c.name));
    entries.forEach((e) => e.companyName && set.add(e.companyName));
    cheques.forEach((c) => c.companyName && set.add(c.companyName));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [companies, entries, cheques]);

  // Ürünlerden aktarılabilir yeni tedarikçi/firma isimleri
  const missingProductCompanies = useMemo(() => {
    const existingLower = new Set(companies.map((c) => c.name.trim().toLowerCase()));
    const missing = new Map<string, string>();
    for (const p of bidProducts) {
      const trimmed = p.supplierCompany.trim();
      if (trimmed && !existingLower.has(trimmed.toLowerCase())) {
        missing.set(trimmed.toLowerCase(), trimmed);
      }
    }
    for (const e of entries) {
      const trimmed = e.companyName.trim();
      if (trimmed && !existingLower.has(trimmed.toLowerCase())) {
        missing.set(trimmed.toLowerCase(), trimmed);
      }
    }
    for (const q of cheques) {
      const trimmed = q.companyName.trim();
      if (trimmed && !existingLower.has(trimmed.toLowerCase())) {
        missing.set(trimmed.toLowerCase(), trimmed);
      }
    }
    return Array.from(missing.values()).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [companies, bidProducts, entries, cheques]);

  // Çek Özet KPI'ları
  const chequeSummary = useMemo(() => {
    const createBuckets = (): Record<CurrencyCode, number> => ({ TRY: 0, USD: 0, EUR: 0 });
    const incomingActive = createBuckets();
    const outgoingActive = createBuckets();
    const settled = createBuckets();
    let dueSoonOrOverdueCount = 0;

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const inSevenDays = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    for (const ch of cheques) {
      const cur = ch.currency || 'TRY';
      const isOpen =
        ch.status === 'portfoyde' || ch.status === 'tahsile_verildi';
      if (ch.direction === 'alinan' && isOpen) {
        incomingActive[cur] += ch.amount;
      } else if (ch.direction === 'verilen' && isOpen) {
        outgoingActive[cur] += ch.amount;
      } else if (ch.status === 'tahsil_edildi' || ch.status === 'odendi') {
        settled[cur] += ch.amount;
      }

      if (isOpen && ch.dueDate && ch.dueDate <= inSevenDays) {
        dueSoonOrOverdueCount += 1;
      }
      if (ch.status === 'karsiliksiz' && ch.dueDate <= todayStr) {
        dueSoonOrOverdueCount += 1;
      }
    }

    return { incomingActive, outgoingActive, settled, dueSoonOrOverdueCount };
  }, [cheques]);

  // Filtrelenmiş çekler
  const filteredCheques = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cheques.filter((ch) => {
      if (chequeDirectionFilter !== 'all' && ch.direction !== chequeDirectionFilter) {
        return false;
      }
      if (chequeStatusFilter !== 'all' && ch.status !== chequeStatusFilter) {
        return false;
      }
      if (currencyFilter !== 'all' && ch.currency !== currencyFilter) return false;
      if (
        companyFilter !== 'all' &&
        ch.companyName.trim().toLowerCase() !== companyFilter.trim().toLowerCase()
      ) {
        return false;
      }
      if (!q) return true;
      return (
        ch.chequeNo.toLowerCase().includes(q) ||
        ch.bankName.toLowerCase().includes(q) ||
        ch.companyName.toLowerCase().includes(q) ||
        ch.drawerName.toLowerCase().includes(q) ||
        ch.endorsedTo.toLowerCase().includes(q) ||
        ch.tenderTrackingCode.toLowerCase().includes(q)
      );
    });
  }, [
    cheques,
    search,
    chequeDirectionFilter,
    chequeStatusFilter,
    companyFilter,
    currencyFilter,
  ]);

  // Filtrelenmiş işlemler
  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (typeFilter !== 'all' && e.entryType !== typeFilter) return false;
      if (statusFilter !== 'all' && e.paymentStatus !== statusFilter) return false;
      if (currencyFilter !== 'all' && e.currency !== currencyFilter) return false;
      if (
        companyFilter !== 'all' &&
        e.companyName.trim().toLowerCase() !== companyFilter.trim().toLowerCase()
      ) {
        return false;
      }
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.companyName.toLowerCase().includes(q) ||
        e.invoiceNo.toLowerCase().includes(q) ||
        e.stockNumber.toLowerCase().includes(q) ||
        e.partNumber.toLowerCase().includes(q) ||
        e.tenderTrackingCode.toLowerCase().includes(q)
      );
    });
  }, [entries, search, typeFilter, statusFilter, companyFilter, currencyFilter]);

  // Cari Firmalar için canlı bakiye hesaplaması
  const companyLedgers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.taxNumber.toLowerCase().includes(q) ||
          c.contactPerson.toLowerCase().includes(q)
        );
      })
      .map((company) => {
        const lowerName = company.name.trim().toLowerCase();
        const relatedEntries = entries.filter(
          (e) =>
            e.paymentStatus !== 'iptal' &&
            (e.companyId === company.id ||
              e.companyName.trim().toLowerCase() === lowerName)
        );
        const relatedProducts = bidProducts.filter(
          (p) => p.supplierCompany.trim().toLowerCase() === lowerName
        );

        const totalsByCurrency: Record<
          CurrencyCode,
          { debt: number; credit: number; txCount: number }
        > = {
          TRY: { debt: 0, credit: 0, txCount: 0 },
          USD: { debt: 0, credit: 0, txCount: 0 },
          EUR: { debt: 0, credit: 0, txCount: 0 },
        };

        for (const e of relatedEntries) {
          const cur = e.currency || 'TRY';
          totalsByCurrency[cur].txCount += 1;
          const remaining = Math.max(0, e.totalAmount - (e.paidAmount || 0));
          if (e.entryType === 'alis_faturasi' || e.entryType === 'gider') {
            if (e.paymentStatus !== 'odendi') totalsByCurrency[cur].debt += remaining;
          } else if (e.entryType === 'satis_faturasi') {
            if (e.paymentStatus !== 'odendi') totalsByCurrency[cur].credit += remaining;
          }
        }

        return {
          company,
          txCount: relatedEntries.length,
          productCount: relatedProducts.length,
          totalsByCurrency,
        };
      });
  }, [companies, entries, bidProducts, search]);

  // Ürün Bazlı Çoklu Firma Karşılaştırması (BidProducts + Alış Faturaları birleşik)
  const productComparisonGroups = useMemo(() => {
    const q = search.trim().toLowerCase();

    interface VendorQuoteItem {
      source: 'product' | 'accounting';
      id: string;
      companyName: string;
      price: number;
      currency: CurrencyCode;
      date: string;
      tenderId: string;
      tenderCode: string;
      productObj?: BidProduct;
      entryObj?: AccountingEntry;
    }

    interface ProductGroup {
      groupKey: string;
      displayName: string;
      stockNumber: string;
      partNumber: string;
      tenderId: string;
      items: VendorQuoteItem[];
      uniqueCompanies: string[];
    }

    const groups = new Map<string, ProductGroup>();

    const upsertItem = (
      name: string,
      stockNumber: string,
      partNumber: string,
      tenderId: string,
      item: VendorQuoteItem
    ) => {
      const keyBase =
        normalizeKey(partNumber) ||
        normalizeKey(stockNumber) ||
        normalizeKey(name);
      if (!keyBase) return;
      const existing = groups.get(keyBase);
      if (!existing) {
        groups.set(keyBase, {
          groupKey: keyBase,
          displayName: name,
          stockNumber,
          partNumber,
          tenderId,
          items: [item],
          uniqueCompanies: [item.companyName],
        });
      } else {
        existing.items.push(item);
        if (!existing.stockNumber && stockNumber) existing.stockNumber = stockNumber;
        if (!existing.partNumber && partNumber) existing.partNumber = partNumber;
        if (!existing.tenderId && tenderId) existing.tenderId = tenderId;
        if (
          !existing.uniqueCompanies.some(
            (c) => c.toLowerCase() === item.companyName.toLowerCase()
          )
        ) {
          existing.uniqueCompanies.push(item.companyName);
        }
      }
    };

    for (const p of bidProducts) {
      upsertItem(p.materialName, p.stockNumber, p.partNumber, p.tenderId, {
        source: 'product',
        id: p.id,
        companyName: p.supplierCompany,
        price: p.offeredSalePrice,
        currency: p.currency,
        date: p.priceDate || p.purchaseDate || p.quotedDate || '',
        tenderId: p.tenderId,
        tenderCode: p.tenderTrackingCode,
        productObj: p,
      });
    }

    for (const e of entries) {
      if (e.entryType !== 'alis_faturasi' || e.paymentStatus === 'iptal') continue;
      upsertItem(e.title, e.stockNumber, e.partNumber, e.tenderId, {
        source: 'accounting',
        id: e.id,
        companyName: e.companyName,
        price: e.unitPrice > 0 ? e.unitPrice : e.totalAmount,
        currency: e.currency,
        date: e.entryDate,
        tenderId: e.tenderId,
        tenderCode: e.tenderTrackingCode,
        entryObj: e,
      });
    }

    return Array.from(groups.values())
      .filter((g) => {
        if (!q) return true;
        return (
          g.displayName.toLowerCase().includes(q) ||
          g.stockNumber.toLowerCase().includes(q) ||
          g.partNumber.toLowerCase().includes(q) ||
          g.uniqueCompanies.some((c) => c.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (b.uniqueCompanies.length !== a.uniqueCompanies.length) {
          return b.uniqueCompanies.length - a.uniqueCompanies.length;
        }
        return a.displayName.localeCompare(b.displayName, 'tr');
      });
  }, [bidProducts, entries, search]);

  // İhale Kâr / Maliyet Özeti
  const tenderFinancials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenders
      .filter((t) => {
        if (!q) return true;
        return (
          t.title.toLowerCase().includes(q) ||
          t.trackingCode.toLowerCase().includes(q) ||
          t.authority.toLowerCase().includes(q)
        );
      })
      .map((tender) => {
        const linkedEntries = entries.filter(
          (e) => e.tenderId === tender.id && e.paymentStatus !== 'iptal'
        );
        const linkedProducts = bidProducts.filter((p) => p.tenderId === tender.id);

        const byCurrency: Record<
          CurrencyCode,
          { sales: number; costs: number; net: number }
        > = {
          TRY: { sales: 0, costs: 0, net: 0 },
          USD: { sales: 0, costs: 0, net: 0 },
          EUR: { sales: 0, costs: 0, net: 0 },
        };

        for (const e of linkedEntries) {
          const cur = e.currency || 'TRY';
          if (e.entryType === 'satis_faturasi') {
            byCurrency[cur].sales += e.totalAmount;
          } else if (e.entryType === 'alis_faturasi' || e.entryType === 'gider') {
            byCurrency[cur].costs += e.totalAmount;
          }
        }
        for (const cur of CURRENCIES) {
          byCurrency[cur].net = byCurrency[cur].sales - byCurrency[cur].costs;
        }

        return {
          tender,
          entryCount: linkedEntries.length,
          productCount: linkedProducts.length,
          byCurrency,
        };
      })
      .sort((a, b) => b.entryCount + b.productCount - (a.entryCount + a.productCount));
  }, [tenders, entries, bidProducts, search]);

  const handleImportCompanies = async () => {
    if (missingProductCompanies.length === 0) return;
    setImportingCompanies(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const added = await onImportCompaniesFromProducts(missingProductCompanies);
      setFeedback(`${added} firma Cari Firmalar listesine başarıyla aktarıldı.`);
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Firmalar aktarılamadı.');
    } finally {
      setImportingCompanies(false);
    }
  };

  const handleExportCsv = () => {
    const escapeCsv = (val: string | number) => {
      const s = String(val ?? '');
      if (s.includes(';') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    if (subTab === 'cheques') {
      const headers = [
        'Vade Tarihi',
        'Keşide Tarihi',
        'Çek Yönü',
        'Çek No',
        'Banka',
        'Şube',
        'Firma Bilgisi',
        'Keşideci',
        'Ciro Edilen',
        'Tutar',
        'Para Birimi',
        'Durum',
        'İhale Takip No',
        'Notlar',
      ];
      const rows = filteredCheques.map((ch) => [
        ch.dueDate,
        ch.issueDate || '',
        ACCOUNTING_CHEQUE_DIRECTION_LABELS[ch.direction],
        ch.chequeNo,
        ch.bankName,
        ch.branchName || '',
        ch.companyName,
        ch.drawerName || '',
        ch.endorsedTo || '',
        ch.amount,
        ch.currency,
        ACCOUNTING_CHEQUE_STATUS_LABELS[ch.status],
        ch.tenderTrackingCode || '',
        ch.notes || '',
      ]);
      const csv =
        '\uFEFF' +
        [headers.map(escapeCsv).join(';'), ...rows.map((r) => r.map(escapeCsv).join(';'))].join(
          '\r\n'
        );
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Cek_Takibi_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }

    const headers = [
      'Tarih',
      'Vade',
      'İşlem Türü',
      'Firma',
      'Belge No',
      'Ürün / Açıklama',
      'Stok No',
      'Parça No',
      'Miktar',
      'Birim',
      'Birim Fiyat',
      'KDV %',
      'KDV Tutarı',
      'Genel Toplam',
      'Ödenen',
      'Para Birimi',
      'Ödeme Yöntemi',
      'Durum',
      'İhale Takip No',
    ];
    const rows = filteredEntries.map((e) => [
      e.entryDate,
      e.dueDate || '',
      ACCOUNTING_ENTRY_TYPE_LABELS[e.entryType],
      e.companyName,
      e.invoiceNo,
      e.title,
      e.stockNumber,
      e.partNumber,
      e.quantity,
      e.unit,
      e.unitPrice,
      e.vatRate,
      e.vatAmount,
      e.totalAmount,
      e.paidAmount,
      e.currency,
      ACCOUNTING_PAYMENT_METHOD_LABELS[e.paymentMethod],
      ACCOUNTING_PAYMENT_STATUS_LABELS[e.paymentStatus],
      e.tenderTrackingCode,
    ]);
    const csv =
      '\uFEFF' +
      [headers.map(escapeCsv).join(';'), ...rows.map((r) => r.map(escapeCsv).join(';'))].join(
        '\r\n'
      );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OnMuhasebe_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      {/* Üst KPI Şeridi */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#DCE3EC]">
        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">Toplam Alış &amp; Gider</div>
          <div className="mt-1.5 text-lg font-bold text-[#0B2239] font-mono tabular-nums">
            {formatBuckets(kpiSummary.purchasesAndExpenses)}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">
            Açık Borç: {formatBuckets(kpiSummary.openPayables)}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">Toplam Satış / Hakediş</div>
          <div className="mt-1.5 text-lg font-bold text-[#007A53] font-mono tabular-nums">
            {formatBuckets(kpiSummary.sales)}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">
            Açık Alacak: {formatBuckets(kpiSummary.openReceivables)}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">Kayıtlı Cari Firma</div>
          <div className="mt-1.5 text-2xl font-bold text-[#0066B3] font-mono tabular-nums">
            {companies.length}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">
            Toplam {entries.length} muhasebe işlemi
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">Vadesi Geçmiş Açık Kayıt</div>
          <div
            className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${
              kpiSummary.overdueCount > 0 ? 'text-red-700' : 'text-[#0B2239]'
            }`}
          >
            {kpiSummary.overdueCount}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">Ödeme veya tahsilat takibi</div>
        </div>
      </section>

      {/* Üst Başlık & Alt Sekme Çubuğu */}
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Calculator className="w-5 h-5 text-[#0066B3] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-base font-bold text-[#0B2239]">
                Ön Muhasebe, Cari Hesaplar ve Çoklu Firma Fiyat Takibi
              </h2>
              <p className="text-xs text-[#4E5D6C] mt-0.5">
                Her alış, satış, tahsilat ve gider kaydında firma bilgisi zorunludur. Aynı ürün için farklı firmalardan yapılan alımları karşılaştırın.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {subTab !== 'reports' && (
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={subTab === 'cheques' ? filteredCheques.length === 0 : filteredEntries.length === 0}
                className="min-h-[42px] px-3.5 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap transition-colors"
              >
                <Download className="w-4 h-4 text-[#0066B3]" />
                <span>{subTab === 'cheques' ? 'Çek Listesi CSV' : 'Excel / CSV İndir'}</span>
              </button>
            )}

            {canManageAccounting && (
              <>
                <button
                  type="button"
                  onClick={() => setPdfImportModalOpen(true)}
                  className="min-h-[42px] px-3.5 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                >
                  <Upload className="w-4 h-4 text-[#FBBF24]" />
                  <span>PDF Fatura Yükle</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNewCompany()}
                  className="min-h-[42px] px-3.5 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                >
                  <Building2 className="w-4 h-4 text-[#0066B3]" />
                  <span>Yeni Cari Firma</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNewCheque()}
                  className="min-h-[42px] px-3.5 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                >
                  <Landmark className="w-4 h-4 text-[#007A53]" />
                  <span>Yeni Çek</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNewEntry()}
                  className="min-h-[42px] px-4 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Yeni Muhasebe Kaydı</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Alt Sekmeler */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#DCE3EC]">
          {(
            [
              { id: 'entries', label: `İşlemler & Faturalar (${entries.length})`, icon: Receipt },
              { id: 'cheques', label: `Çekler (${cheques.length})`, icon: Landmark },
              { id: 'companies', label: `Cari Firmalar (${companies.length})`, icon: Building2 },
              { id: 'reports', label: 'Raporlar', icon: BarChart3 },
              {
                id: 'product_comparison',
                label: `Ürün Bazlı Firma Fiyatları (${productComparisonGroups.length})`,
                icon: Package,
              },
              {
                id: 'tender_profit',
                label: `İhale Kâr / Maliyet (${tenders.length})`,
                icon: FileSpreadsheet,
              },
            ] as {
              id: AccountingSubTab;
              label: string;
              icon: React.ComponentType<{ className?: string }>;
            }[]
          ).map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`min-h-[40px] px-3.5 inline-flex items-center gap-2 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#0B2239] text-white'
                    : 'bg-[#F3F6FA] text-[#4E5D6C] hover:text-[#0B2239]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#34D399]' : ''}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Arama ve Filtre Çubuğu */}
        {subTab !== 'reports' && (
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#868686] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                subTab === 'cheques'
                  ? 'Çek no, banka adı, firma, keşideci veya ciro edilen ara...'
                  : subTab === 'companies'
                  ? 'Firma ünvanı, vergi no veya yetkili kişi ara...'
                  : subTab === 'product_comparison'
                  ? 'Ürün adı, stok/parça no veya tedarikçi firma ara...'
                  : subTab === 'tender_profit'
                  ? 'İhale takip kodu, kurum veya başlık ara...'
                  : 'Firma, ürün/açıklama, belge no, stok veya parça no ara...'
              }
              className="w-full min-h-[42px] pl-10 pr-4 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
            />
          </div>

          {subTab === 'entries' && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | AccountingEntryType)}
                className="min-h-[42px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-medium text-[#0B2239]"
              >
                <option value="all">Tüm İşlem Türleri</option>
                {(Object.keys(ACCOUNTING_ENTRY_TYPE_LABELS) as AccountingEntryType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {ACCOUNTING_ENTRY_TYPE_LABELS[t]}
                    </option>
                  )
                )}
              </select>

              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="min-h-[42px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-medium text-[#0B2239] max-w-[200px]"
              >
                <option value="all">Tüm Firmalar</option>
                {allCompanyNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'all' | AccountingPaymentStatus)
                }
                className="min-h-[42px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-medium text-[#0B2239]"
              >
                <option value="all">Tüm Durumlar</option>
                {(
                  Object.keys(ACCOUNTING_PAYMENT_STATUS_LABELS) as AccountingPaymentStatus[]
                ).map((st) => (
                  <option key={st} value={st}>
                    {ACCOUNTING_PAYMENT_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>

              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value as 'all' | CurrencyCode)}
                className="min-h-[42px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239]"
              >
                <option value="all">Tüm Dövizler</option>
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          )}

          {subTab === 'cheques' && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={chequeDirectionFilter}
                onChange={(e) =>
                  setChequeDirectionFilter(e.target.value as 'all' | AccountingChequeDirection)
                }
                className="min-h-[42px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-medium text-[#0B2239]"
              >
                <option value="all">Tüm Çekler (Alınan &amp; Verilen)</option>
                <option value="alinan">Alınan Çekler</option>
                <option value="verilen">Verilen Çekler</option>
              </select>

              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="min-h-[42px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-medium text-[#0B2239] max-w-[200px]"
              >
                <option value="all">Tüm Firmalar</option>
                {allCompanyNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={chequeStatusFilter}
                onChange={(e) =>
                  setChequeStatusFilter(e.target.value as 'all' | AccountingChequeStatus)
                }
                className="min-h-[42px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-medium text-[#0B2239]"
              >
                <option value="all">Tüm Çek Durumları</option>
                {(
                  Object.keys(ACCOUNTING_CHEQUE_STATUS_LABELS) as AccountingChequeStatus[]
                ).map((st) => (
                  <option key={st} value={st}>
                    {ACCOUNTING_CHEQUE_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>

              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value as 'all' | CurrencyCode)}
                className="min-h-[42px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239]"
              >
                <option value="all">Tüm Dövizler</option>
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          )}
        </div>
        )}
      </div>

      {feedback && (
        <div
          role="status"
          className="p-3.5 bg-[#007A53]/15 border border-[#007A53]/40 rounded-xl text-xs text-[#007A53] font-semibold flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium"
        >
          {errorMsg}
        </div>
      )}

      {/* SEKME 1: İşlemler & Faturalar */}
      {subTab === 'entries' && (
        <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
          {filteredEntries.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <Receipt className="w-8 h-8 text-[#868686] mx-auto" />
              <h3 className="font-display text-base font-bold text-[#0B2239]">
                {entries.length === 0
                  ? 'Henüz Ön Muhasebe Kaydı Oluşturulmadı'
                  : 'Filtrelere Uygun Muhasebe Kaydı Bulunamadı'}
              </h3>
              <p className="text-xs text-[#4E5D6C] max-w-md mx-auto">
                Alış faturaları, satış/hakediş faturaları, tahsilat, ödeme ve gider kayıtlarınızı firma bilgisiyle birlikte oluşturarak cari bakiye ve ürün maliyet takibi yapabilirsiniz.
              </p>
              {canManageAccounting && entries.length === 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPdfImportModalOpen(true)}
                    className="min-h-[42px] px-4 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-[#FBBF24]" />
                    <span>PDF Faturadan Otomatik Aktar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNewEntry()}
                    className="min-h-[42px] px-4 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>İlk Muhasebe Kaydını Ekle</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0B2239] text-xs font-semibold text-slate-200 border-b border-[#DCE3EC]">
                      <th className="py-3 px-4 whitespace-nowrap">Tarih / Belge</th>
                      <th className="py-3 px-4">İşlem Türü &amp; Firma</th>
                      <th className="py-3 px-4">Ürün / Hizmet Açıklaması</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Genel Toplam</th>
                      <th className="py-3 px-4 whitespace-nowrap">Ödeme Durumu</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE3EC] text-xs">
                    {filteredEntries.map((entry) => {
                      const canDeleteOwn =
                        canManageAccounting && isOwnRecord(entry, currentUid);
                      return (
                        <tr
                          key={entry.id}
                          onClick={() => onViewEntry(entry)}
                          className="hover:bg-[#F3F6FA]/70 cursor-pointer transition-colors"
                        >
                          <td className="py-3.5 px-4 align-top whitespace-nowrap font-mono tabular-nums">
                            <div className="font-semibold text-[#0B2239]">
                              {formatTurkishDate(entry.entryDate)}
                            </div>
                            {entry.invoiceNo && (
                              <div className="text-[11px] text-[#4E5D6C] mt-0.5">
                                {entry.invoiceNo}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 align-top max-w-[230px]">
                            <div className="font-semibold text-[#0066B3]">
                              {ACCOUNTING_ENTRY_TYPE_LABELS[entry.entryType]}
                            </div>
                            <div
                              className="font-bold text-[#0B2239] mt-0.5 truncate"
                              title={entry.companyName}
                            >
                              {entry.companyName}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 align-top max-w-sm">
                            <div className="font-semibold text-[#0B2239] leading-snug">
                              {entry.title}
                            </div>
                            <div className="text-[11px] text-[#4E5D6C] mt-0.5 flex flex-wrap items-center gap-x-1.5">
                              <span>
                                {entry.quantity} {entry.unit}
                              </span>
                              <span>·</span>
                              <span>KDV %{entry.vatRate}</span>
                              {entry.tenderTrackingCode && (
                                <>
                                  <span>·</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (entry.tenderId) onSelectTenderId(entry.tenderId);
                                    }}
                                    className="font-mono font-semibold text-[#0066B3] hover:underline cursor-pointer"
                                  >
                                    {entry.tenderTrackingCode}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 align-top text-right whitespace-nowrap font-mono tabular-nums">
                            <div className="text-sm font-bold text-[#0B2239]">
                              {formatCurrency(entry.totalAmount, entry.currency)}
                            </div>
                            {entry.paymentStatus === 'kismi' && (
                              <div className="text-[11px] text-[#4E5D6C] mt-0.5">
                                Ödenen: {formatCurrency(entry.paidAmount, entry.currency)}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            <div
                              className={`font-semibold ${
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
                            {entry.dueDate && (
                              <div className="text-[11px] font-mono text-[#4E5D6C] mt-0.5">
                                Vade: {formatTurkishDate(entry.dueDate)}
                              </div>
                            )}
                          </td>

                          <td
                            className="py-3.5 px-4 align-top text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onViewEntry(entry)}
                                title="Detay Penceresi"
                                className="min-h-[36px] px-2.5 inline-flex items-center gap-1 bg-[#0B2239] hover:bg-[#143252] text-white font-semibold rounded-md cursor-pointer"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                                <span>Detay</span>
                              </button>
                              <a
                                href={`?detail=accounting&id=${encodeURIComponent(entry.id)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Yeni Sekmede Aç"
                                title="Yeni Sekmede Aç"
                                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] rounded-md"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              {canManageAccounting && (
                                <>
                                  {(entry.paymentStatus === 'bekliyor' ||
                                    entry.paymentStatus === 'kismi') && (
                                    <button
                                      type="button"
                                      onClick={() => onMarkEntryPaid(entry)}
                                      title="Ödendi Olarak İşaretle"
                                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#007A53]/20 text-[#007A53] rounded-md cursor-pointer"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => onEditEntry(entry)}
                                    title="Düzenle"
                                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] rounded-md cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  {canDeleteOwn ? (
                                    <button
                                      type="button"
                                      onClick={() => onDeleteEntry(entry)}
                                      title="Geri Dönüşüm Kutusuna Taşı"
                                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-red-50 hover:text-red-700 text-[#4E5D6C] rounded-md cursor-pointer"
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

              {/* Mobil Liste */}
              <div className="lg:hidden divide-y divide-[#DCE3EC]">
                {filteredEntries.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={() => onViewEntry(entry)}
                    className="p-4 space-y-2 hover:bg-[#F3F6FA]/60 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-[#0066B3]">
                          {ACCOUNTING_ENTRY_TYPE_LABELS[entry.entryType]} ·{' '}
                          <span className="font-mono text-[#4E5D6C]">
                            {formatTurkishDate(entry.entryDate)}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-[#0B2239] mt-0.5">
                          {entry.title}
                        </div>
                        <div className="text-xs font-medium text-[#4E5D6C]">
                          {entry.companyName}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-mono font-bold text-[#0B2239] tabular-nums">
                          {formatCurrency(entry.totalAmount, entry.currency)}
                        </div>
                        <div
                          className={`text-[11px] font-semibold mt-0.5 ${
                            entry.paymentStatus === 'odendi'
                              ? 'text-[#007A53]'
                              : 'text-amber-700'
                          }`}
                        >
                          {ACCOUNTING_PAYMENT_STATUS_LABELS[entry.paymentStatus]}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* SEKME 2: Çekler (Alınan & Verilen Çek Takibi) */}
      {subTab === 'cheques' && (
        <div className="space-y-4">
          {/* Çek Portföy Özeti */}
          <section className="bg-white border border-[#DCE3EC] rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#DCE3EC]">
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Portföydeki Alınan Çekler</div>
              <div className="mt-1 text-base font-bold text-[#007A53] font-mono tabular-nums">
                {formatBuckets(chequeSummary.incomingActive)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Portföyde veya tahsile verilmiş
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Bekleyen Verilen Çekler</div>
              <div className="mt-1 text-base font-bold text-[#0B2239] font-mono tabular-nums">
                {formatBuckets(chequeSummary.outgoingActive)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Vadesi beklenen firma çekleri
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Tahsil Edilen / Ödenen</div>
              <div className="mt-1 text-base font-bold text-[#0066B3] font-mono tabular-nums">
                {formatBuckets(chequeSummary.settled)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">Tamamlanmış çek hareketleri</div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Yaklaşan / Kritik Vade (7 Gün)</div>
              <div
                className={`mt-1 text-xl font-bold font-mono tabular-nums ${
                  chequeSummary.dueSoonOrOverdueCount > 0 ? 'text-amber-700' : 'text-[#0B2239]'
                }`}
              >
                {chequeSummary.dueSoonOrOverdueCount}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Yakın vadeli veya karşılıksız
              </div>
            </div>
          </section>

          <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
            {filteredCheques.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <Landmark className="w-8 h-8 text-[#868686] mx-auto" />
                <h3 className="font-display text-base font-bold text-[#0B2239]">
                  {cheques.length === 0
                    ? 'Henüz Çek Kaydı Oluşturulmadı'
                    : 'Filtrelere Uygun Çek Kaydı Bulunamadı'}
                </h3>
                <p className="text-xs text-[#4E5D6C] max-w-md mx-auto">
                  Müşterilerden alınan ve tedarikçilere verilen çekleri banka, seri no, vade tarihi, ciro ve tahsilat durumuyla takip edebilirsiniz.
                </p>
                {canManageAccounting && cheques.length === 0 && (
                  <button
                    type="button"
                    onClick={() => onNewCheque()}
                    className="min-h-[42px] px-4 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>İlk Çek Kaydını Ekle</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#0B2239] text-xs font-semibold text-slate-200 border-b border-[#DCE3EC]">
                        <th className="py-3 px-4 whitespace-nowrap">Vade / Keşide</th>
                        <th className="py-3 px-4 whitespace-nowrap">Yön &amp; Çek No</th>
                        <th className="py-3 px-4">Banka / Şube</th>
                        <th className="py-3 px-4">Firma Bilgisi</th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">Tutar</th>
                        <th className="py-3 px-4 whitespace-nowrap">Durum</th>
                        <th className="py-3 px-4 text-right whitespace-nowrap">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE3EC] text-xs">
                      {filteredCheques.map((ch) => {
                        const canDeleteOwn =
                          canManageAccounting && isOwnRecord(ch, currentUid);
                        const isCompleted =
                          ch.status === 'tahsil_edildi' ||
                          ch.status === 'odendi' ||
                          ch.status === 'iade';
                        const targetCompleteStatus: AccountingChequeStatus =
                          ch.direction === 'alinan' ? 'tahsil_edildi' : 'odendi';

                        return (
                          <tr
                            key={ch.id}
                            onClick={() => onViewCheque(ch)}
                            className="hover:bg-[#F3F6FA]/70 cursor-pointer transition-colors"
                          >
                            <td className="py-3.5 px-4 align-top whitespace-nowrap font-mono tabular-nums">
                              <div className="font-bold text-[#0B2239]">
                                {formatTurkishDate(ch.dueDate)}
                              </div>
                              {ch.issueDate && (
                                <div className="text-[11px] text-[#4E5D6C] mt-0.5">
                                  Keşide: {formatTurkishDate(ch.issueDate)}
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4 align-top whitespace-nowrap">
                              <div
                                className={`font-semibold ${
                                  ch.direction === 'alinan' ? 'text-[#007A53]' : 'text-[#0066B3]'
                                }`}
                              >
                                {ch.direction === 'alinan' ? 'Alınan Çek' : 'Verilen Çek'}
                              </div>
                              <div className="font-mono font-bold text-[#0B2239] mt-0.5 tabular-nums">
                                {ch.chequeNo}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 align-top max-w-[200px]">
                              <div className="font-semibold text-[#0B2239]">{ch.bankName}</div>
                              {ch.branchName && (
                                <div className="text-[11px] text-[#4E5D6C] mt-0.5 truncate">
                                  {ch.branchName}
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4 align-top max-w-[240px]">
                              <div
                                className="font-bold text-[#0B2239] truncate"
                                title={ch.companyName}
                              >
                                {ch.companyName}
                              </div>
                              <div className="text-[11px] text-[#4E5D6C] mt-0.5 flex flex-wrap items-center gap-x-1.5">
                                {ch.endorsedTo && (
                                  <span className="text-[#0066B3] font-medium">
                                    Ciro: {ch.endorsedTo}
                                  </span>
                                )}
                                {ch.tenderTrackingCode && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (ch.tenderId) onSelectTenderId(ch.tenderId);
                                    }}
                                    className="font-mono font-semibold text-[#0066B3] hover:underline cursor-pointer"
                                  >
                                    {ch.tenderTrackingCode}
                                  </button>
                                )}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 align-top text-right whitespace-nowrap font-mono font-bold text-sm text-[#0B2239] tabular-nums">
                              {formatCurrency(ch.amount, ch.currency)}
                            </td>

                            <td className="py-3.5 px-4 align-top whitespace-nowrap">
                              <span
                                className={`font-semibold ${
                                  ch.status === 'tahsil_edildi' || ch.status === 'odendi'
                                    ? 'text-[#007A53]'
                                    : ch.status === 'karsiliksiz'
                                    ? 'text-red-700'
                                    : ch.status === 'ciro_edildi' || ch.status === 'tahsile_verildi'
                                    ? 'text-[#0066B3]'
                                    : ch.status === 'iade'
                                    ? 'text-[#868686]'
                                    : 'text-amber-700'
                                }`}
                              >
                                {ACCOUNTING_CHEQUE_STATUS_LABELS[ch.status]}
                              </span>
                            </td>

                            <td
                              className="py-3.5 px-4 align-top text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onViewCheque(ch)}
                                  title="Detay Penceresi"
                                  className="min-h-[36px] px-2.5 inline-flex items-center gap-1 bg-[#0B2239] hover:bg-[#143252] text-white font-semibold rounded-md cursor-pointer"
                                >
                                  <Maximize2 className="w-3.5 h-3.5" />
                                  <span>Detay</span>
                                </button>
                                <a
                                  href={`?detail=cheque&id=${encodeURIComponent(ch.id)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label="Yeni Sekmede Aç"
                                  title="Yeni Sekmede Aç"
                                  className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] rounded-md"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                                {canManageAccounting && (
                                  <>
                                    {!isCompleted && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onUpdateChequeStatus(
                                            ch,
                                            targetCompleteStatus,
                                            ch.endorsedTo
                                          )
                                        }
                                        title={
                                          ch.direction === 'alinan'
                                            ? 'Tahsil Edildi Olarak İşaretle'
                                            : 'Ödendi Olarak İşaretle'
                                        }
                                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#007A53]/20 text-[#007A53] rounded-md cursor-pointer"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => onEditCheque(ch)}
                                      title="Düzenle"
                                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] rounded-md cursor-pointer"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    {canDeleteOwn ? (
                                      <button
                                        type="button"
                                        onClick={() => onDeleteCheque(ch)}
                                        title="Geri Dönüşüm Kutusuna Taşı"
                                        className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-red-50 hover:text-red-700 text-[#4E5D6C] rounded-md cursor-pointer"
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

                {/* Mobil Çek Listesi */}
                <div className="lg:hidden divide-y divide-[#DCE3EC]">
                  {filteredCheques.map((ch) => (
                    <div
                      key={ch.id}
                      onClick={() => onViewCheque(ch)}
                      className="p-4 space-y-2 hover:bg-[#F3F6FA]/60 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-[#0066B3]">
                            {ch.direction === 'alinan' ? 'Alınan Çek' : 'Verilen Çek'} ·{' '}
                            <span className="font-mono text-[#4E5D6C]">
                              Vade: {formatTurkishDate(ch.dueDate)}
                            </span>
                          </div>
                          <div className="text-sm font-bold text-[#0B2239] mt-0.5">
                            {ch.bankName} · {ch.chequeNo}
                          </div>
                          <div className="text-xs font-medium text-[#4E5D6C]">
                            {ch.companyName}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-mono font-bold text-[#0B2239] tabular-nums">
                            {formatCurrency(ch.amount, ch.currency)}
                          </div>
                          <div className="text-[11px] font-semibold mt-0.5 text-[#0066B3]">
                            {ACCOUNTING_CHEQUE_STATUS_LABELS[ch.status]}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* SEKME 3: Cari Firmalar */}
      {subTab === 'companies' && (
        <div className="space-y-4">
          {canManageAccounting && missingProductCompanies.length > 0 && (
            <div className="bg-white border border-[#0066B3]/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-[#0B2239]">
                <strong>{missingProductCompanies.length} firma</strong> ürün veya işlem kayıtlarında geçiyor ancak henüz Cari Firmalar kartı açılmamış:{' '}
                <span className="text-[#4E5D6C]">
                  {missingProductCompanies.slice(0, 4).join(', ')}
                  {missingProductCompanies.length > 4 ? '…' : ''}
                </span>
              </div>
              <button
                type="button"
                disabled={importingCompanies}
                onClick={handleImportCompanies}
                className="min-h-[40px] px-3.5 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#006344] text-white text-xs font-bold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {importingCompanies ? 'Aktarılıyor…' : 'Firmaları Cari Listeye Aktar'}
                </span>
              </button>
            </div>
          )}

          {companyLedgers.length === 0 ? (
            <div className="bg-white border border-[#DCE3EC] rounded-xl p-10 text-center space-y-3">
              <Building2 className="w-8 h-8 text-[#868686] mx-auto" />
              <h3 className="font-display text-base font-bold text-[#0B2239]">
                Henüz Cari Firma Kartı Yok
              </h3>
              <p className="text-xs text-[#4E5D6C] max-w-md mx-auto">
                Tedarikçi ve müşteri kurumlarınız için vergi no, IBAN ve yetkili iletişim kartları oluşturarak açık alacak/borç bakiyelerini canlı izleyin.
              </p>
              {canManageAccounting && (
                <button
                  type="button"
                  onClick={() => onNewCompany()}
                  className="min-h-[42px] px-4 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>İlk Cari Firmayı Ekle</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {companyLedgers.map(({ company, txCount, productCount, totalsByCurrency }) => {
                const canDeleteOwn =
                  canManageAccounting && isOwnRecord(company, currentUid);
                const activeCurs = CURRENCIES.filter(
                  (c) =>
                    totalsByCurrency[c].debt > 0 ||
                    totalsByCurrency[c].credit > 0 ||
                    totalsByCurrency[c].txCount > 0
                );
                return (
                  <article
                    key={company.id}
                    className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden flex flex-col justify-between"
                  >
                    <div className="p-4 sm:p-5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-[#0066B3]">
                            {ACCOUNTING_COMPANY_TYPE_LABELS[company.companyType]}
                          </div>
                          <h3 className="font-display text-base font-bold text-[#0B2239] leading-snug mt-0.5">
                            {company.name}
                          </h3>
                        </div>
                        <span className="text-[11px] font-mono text-[#4E5D6C] shrink-0">
                          {txCount} işlem · {productCount} ürün
                        </span>
                      </div>

                      <div className="text-xs text-[#4E5D6C] space-y-1">
                        {(company.taxOffice || company.taxNumber) && (
                          <div>
                            {company.taxOffice}
                            {company.taxOffice && company.taxNumber ? ' · ' : ''}
                            {company.taxNumber && (
                              <span className="font-mono">VKN: {company.taxNumber}</span>
                            )}
                          </div>
                        )}
                        {(company.contactPerson || company.phone) && (
                          <div>
                            {company.contactPerson}
                            {company.contactPerson && company.phone ? ' · ' : ''}
                            <span className="font-mono">{company.phone}</span>
                          </div>
                        )}
                        {company.iban && (
                          <div className="font-mono text-[11px] truncate">{company.iban}</div>
                        )}
                      </div>
                    </div>

                    <div className="px-4 sm:px-5 py-3 bg-[#F3F6FA]/70 border-t border-[#DCE3EC] space-y-1.5 text-xs">
                      {activeCurs.length === 0 ? (
                        <div className="text-[#4E5D6C]">Açık bakiye hareketi yok</div>
                      ) : (
                        activeCurs.map((cur) => (
                          <div
                            key={cur}
                            className="flex items-center justify-between font-mono tabular-nums"
                          >
                            <span className="text-[#4E5D6C]">
                              Borç: {formatCurrency(totalsByCurrency[cur].debt, cur)}
                            </span>
                            <span className="text-[#007A53] font-semibold">
                              Alacak: {formatCurrency(totalsByCurrency[cur].credit, cur)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="px-4 sm:px-5 py-2.5 border-t border-[#DCE3EC] flex flex-wrap items-center justify-between gap-2">
                      {canManageAccounting ? (
                        <>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                onNewEntry({
                                  companyId: company.id,
                                  companyName: company.name,
                                  entryType:
                                    company.companyType === 'musteri'
                                      ? 'satis_faturasi'
                                      : 'alis_faturasi',
                                })
                              }
                              className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>İşlem Ekle</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onNewCheque({
                                  companyId: company.id,
                                  companyName: company.name,
                                  direction:
                                    company.companyType === 'musteri' ? 'alinan' : 'verilen',
                                })
                              }
                              className="min-h-[38px] px-2.5 inline-flex items-center gap-1 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer"
                            >
                              <Landmark className="w-3.5 h-3.5 text-[#007A53]" />
                              <span>Çek Ekle</span>
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onEditCompany(company)}
                              className="min-h-[38px] px-2.5 inline-flex items-center gap-1 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-medium rounded-lg cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Düzenle</span>
                            </button>
                            {canDeleteOwn ? (
                              <button
                                type="button"
                                onClick={() => onDeleteCompany(company)}
                                aria-label="Cari Firmayı Sil"
                                className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-red-50 hover:text-red-700 text-[#4E5D6C] rounded-lg cursor-pointer"
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
                          </div>
                        </>
                      ) : (
                        <span className="text-[11px] text-[#4E5D6C]">Salt okunur</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SEKME 3: Ürün Bazlı Çoklu Firma Fiyat Karşılaştırması */}
      {subTab === 'product_comparison' && (
        <div className="space-y-4">
          {productComparisonGroups.length === 0 ? (
            <div className="bg-white border border-[#DCE3EC] rounded-xl p-10 text-center space-y-2">
              <Package className="w-8 h-8 text-[#868686] mx-auto" />
              <h3 className="font-display text-base font-bold text-[#0B2239]">
                Karşılaştırılacak Ürün / Firma Kaydı Yok
              </h3>
              <p className="text-xs text-[#4E5D6C] max-w-md mx-auto">
                Teklif Ürünleri veya Alış Faturaları eklendikçe aynı ürün için farklı firmalardan alınan tüm fiyatlar burada yan yana listelenir.
              </p>
            </div>
          ) : (
            productComparisonGroups.map((group) => (
              <section
                key={group.groupKey}
                className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden"
              >
                <div className="px-5 py-4 bg-[#F3F6FA]/70 border-b border-[#DCE3EC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-[#4E5D6C] font-mono tabular-nums">
                      {group.stockNumber && <span>Stok: {group.stockNumber}</span>}
                      {group.stockNumber && group.partNumber && <span>·</span>}
                      {group.partNumber && <span>Parça: {group.partNumber}</span>}
                      <span>·</span>
                      <span className="font-sans font-semibold text-[#0066B3]">
                        {group.uniqueCompanies.length} Farklı Firma · {group.items.length} Kayıt
                      </span>
                    </div>
                    <h3 className="font-display text-sm font-bold text-[#0B2239] mt-0.5">
                      {group.displayName}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {canManageProducts && (
                      <button
                        type="button"
                        onClick={() =>
                          onAddProductForAnotherCompany(group.tenderId, {
                            materialName: group.displayName,
                            stockNumber: group.stockNumber,
                            partNumber: group.partNumber,
                            supplierCompany: '',
                          })
                        }
                        className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#0066B3]" />
                        <span>Farklı Firmadan Ürün Fiyatı Ekle</span>
                      </button>
                    )}
                    {canManageAccounting && (
                      <button
                        type="button"
                        onClick={() =>
                          onNewEntry({
                            entryType: 'alis_faturasi',
                            title: group.displayName,
                            stockNumber: group.stockNumber,
                            partNumber: group.partNumber,
                            tenderId: group.tenderId,
                          })
                        }
                        className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Farklı Firmadan Alış Faturası İşle</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#DCE3EC] text-[11px] font-semibold text-[#4E5D6C]">
                        <th className="py-2.5 px-4">Firma Bilgisi</th>
                        <th className="py-2.5 px-4">Kaynak</th>
                        <th className="py-2.5 px-4">Tarih</th>
                        <th className="py-2.5 px-4">İhale</th>
                        <th className="py-2.5 px-4 text-right">Fiyat / Birim Maliyet</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#DCE3EC]">
                      {group.items.map((it) => (
                        <tr
                          key={`${it.source}-${it.id}`}
                          onClick={() => {
                            if (it.source === 'product' && it.productObj) {
                              onViewProduct(it.productObj);
                            } else if (it.source === 'accounting' && it.entryObj) {
                              onViewEntry(it.entryObj);
                            }
                          }}
                          className="hover:bg-[#F3F6FA]/60 cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 px-4 font-bold text-[#0B2239]">
                            {it.companyName}
                          </td>
                          <td className="py-2.5 px-4 text-[#4E5D6C]">
                            {it.source === 'product' ? 'Teklif Ürün Kartı' : 'Alış Faturası'}
                          </td>
                          <td className="py-2.5 px-4 font-mono tabular-nums text-[#4E5D6C]">
                            {it.date ? formatTurkishDate(it.date) : '—'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[#0066B3]">
                            {it.tenderCode || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-[#0066B3] tabular-nums">
                            {formatCurrency(it.price, it.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}
        </div>
      )}

      {/* SEKME 4: İhale Kâr / Maliyet Özeti */}
      {subTab === 'tender_profit' && (
        <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
          {tenderFinancials.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#4E5D6C]">
              Kayıtlı ihale bulunamadı.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0B2239] text-slate-200 border-b border-[#DCE3EC] font-semibold">
                    <th className="py-3 px-4">İhale Takip &amp; Başlık</th>
                    <th className="py-3 px-4">Kayıtlar</th>
                    <th className="py-3 px-4 text-right">Satış / Hakediş</th>
                    <th className="py-3 px-4 text-right">Alış &amp; Gider</th>
                    <th className="py-3 px-4 text-right">Net Fark (Kâr/Zarar)</th>
                    <th className="py-3 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE3EC]">
                  {tenderFinancials.map(({ tender, entryCount, productCount, byCurrency }) => {
                    const activeCurs = CURRENCIES.filter(
                      (c) => byCurrency[c].sales > 0 || byCurrency[c].costs > 0
                    );
                    const displayCurs = activeCurs.length > 0 ? activeCurs : [tender.currency];
                    return (
                      <tr key={tender.id} className="hover:bg-[#F3F6FA]/60">
                        <td className="py-3.5 px-4 max-w-sm">
                          <button
                            type="button"
                            onClick={() => onSelectTenderId(tender.id)}
                            className="font-mono font-bold text-[#0066B3] hover:underline cursor-pointer"
                          >
                            {tender.trackingCode}
                          </button>
                          <div className="font-semibold text-[#0B2239] mt-0.5">
                            {tender.title}
                          </div>
                          <div className="text-[11px] text-[#4E5D6C]">{tender.authority}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#4E5D6C] whitespace-nowrap">
                          {entryCount} muhasebe · {productCount} ürün
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#007A53] font-semibold whitespace-nowrap">
                          {displayCurs.map((c) => (
                            <div key={c}>{formatCurrency(byCurrency[c].sales, c)}</div>
                          ))}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#0B2239] whitespace-nowrap">
                          {displayCurs.map((c) => (
                            <div key={c}>{formatCurrency(byCurrency[c].costs, c)}</div>
                          ))}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                          {displayCurs.map((c) => (
                            <div
                              key={c}
                              className={
                                byCurrency[c].net >= 0 ? 'text-[#007A53]' : 'text-red-700'
                              }
                            >
                              {formatCurrency(byCurrency[c].net, c)}
                            </div>
                          ))}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {canManageAccounting && (
                            <button
                              type="button"
                              onClick={() =>
                                onNewEntry({
                                  tenderId: tender.id,
                                  entryType: 'alis_faturasi',
                                })
                              }
                              className="min-h-[36px] px-3 inline-flex items-center gap-1 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] font-semibold rounded-md cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 text-[#0066B3]" />
                              <span>Kayıt Ekle</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* SEKME 5: Raporlar (Açık Cariler, Faturalar, Çekler) */}
      {subTab === 'reports' && (
        <AccountingReportsSection
          companyName={companyName}
          companies={companies}
          entries={entries}
          cheques={cheques}
          tenders={tenders}
          onViewEntry={onViewEntry}
          onViewCheque={onViewCheque}
          onSelectTenderId={onSelectTenderId}
          onInspectCompanyInEntries={(targetCompany) => {
            setCompanyFilter(targetCompany);
            setTypeFilter('all');
            setStatusFilter('all');
            setSubTab('entries');
          }}
          onInspectCompanyInCheques={(targetCompany) => {
            setCompanyFilter(targetCompany);
            setChequeDirectionFilter('all');
            setChequeStatusFilter('all');
            setSubTab('cheques');
          }}
        />
      )}

      <InvoicePdfImportModal
        open={pdfImportModalOpen}
        onClose={() => setPdfImportModalOpen(false)}
        ownCompanyName={companyName}
        ownTaxNumber={ownTaxNumber}
        companies={companies}
        tenders={tenders}
        canManageProducts={canManageProducts}
        onConfirmImport={onImportInvoicePdf}
        onImportSuccess={(result) => {
          const parts: string[] = [];
          if (result.companyCreated) {
            parts.push(`"${result.companyName}" Cari Firması oluşturuldu`);
          } else if (result.companyUpdated) {
            parts.push(`"${result.companyName}" cari bilgileri güncellendi`);
          }
          if (result.entriesCreated > 0) {
            parts.push(`${result.entriesCreated} muhasebe/fatura kaydı işlendi`);
          }
          if (result.productsCreated > 0) {
            parts.push(`${result.productsCreated} ürün kartı otomatik kaydedildi`);
          }
          if (result.productsSkippedDuplicate > 0) {
            parts.push(`${result.productsSkippedDuplicate} mevcut ürün tekrar edilmedi`);
          }
          setFeedback(
            parts.length > 0
              ? `PDF Fatura başarıyla aktarıldı: ${parts.join(', ')}.`
              : 'PDF Fatura işlemi tamamlandı.'
          );
          setTimeout(() => setFeedback(null), 6000);
        }}
      />
    </div>
  );
};
