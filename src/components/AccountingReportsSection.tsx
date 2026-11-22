import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  Download,
  FileDown,
  Filter,
  Landmark,
  Loader2,
  Percent,
  Receipt,
  RotateCcw,
  Search,
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
  AccountingPaymentMethod,
  CurrencyCode,
  Tender,
} from '../types/tender';
import {
  formatCurrency,
  formatTurkishDate,
  getTodayDateStr,
} from '../lib/trackingAndCalendar';
import {
  downloadAccountingReportPdf,
  formatCurrencyBucketsCompact,
} from '../lib/accountingReportPdf';

type ReportMode = 'open_accounts' | 'invoices' | 'cheques' | 'tax_summary';
type OpenAccountFilterMode =
  | 'only_open'
  | 'receivable'
  | 'payable'
  | 'overdue'
  | 'with_open_cheques'
  | 'all';
type InvoiceScopeFilter =
  | 'invoices_only'
  | 'all'
  | 'satis_faturasi'
  | 'alis_faturasi'
  | 'gider'
  | 'cash_flow';
type InvoiceOpenFilter = 'all' | 'open_only' | 'paid' | 'overdue' | 'cancelled';
type ChequeReportStatusScope =
  | 'all'
  | 'open_only'
  | 'settled'
  | 'endorsed'
  | 'bounced_returned'
  | 'overdue_or_7days';

interface AccountingReportsSectionProps {
  companyName?: string;
  companies: AccountingCompany[];
  entries: AccountingEntry[];
  cheques: AccountingCheque[];
  tenders: Tender[];
  onViewEntry: (entry: AccountingEntry) => void;
  onViewCheque: (cheque: AccountingCheque) => void;
  onSelectTenderId: (tenderId: string) => void;
  onInspectCompanyInEntries: (companyName: string) => void;
  onInspectCompanyInCheques: (companyName: string) => void;
}

const CURRENCIES: CurrencyCode[] = ['TRY', 'USD', 'EUR'];

function emptyBuckets(): Record<CurrencyCode, number> {
  return { TRY: 0, USD: 0, EUR: 0 };
}

function diffDays(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso) return 0;
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function escapeCsvCell(val: string | number): string {
  const s = String(val ?? '');
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

interface CurrencyAccountStat {
  salesTotal: number;
  salesPaid: number;
  openReceivable: number;
  purchaseTotal: number;
  purchasePaid: number;
  openPayable: number;
  openIncomingCheque: number;
  openOutgoingCheque: number;
  netOpen: number;
}

interface OpenAccountRow {
  key: string;
  companyName: string;
  companyObj: AccountingCompany | null;
  byCurrency: Record<CurrencyCode, CurrencyAccountStat>;
  entryCount: number;
  chequeCount: number;
  overdueCount: number;
  earliestOpenDueDate: string;
  hasAnyOpenBalance: boolean;
  hasAnyOpenCheque: boolean;
}

export const AccountingReportsSection: React.FC<AccountingReportsSectionProps> = ({
  companyName,
  companies,
  entries,
  cheques,
  tenders,
  onViewEntry,
  onViewCheque,
  onSelectTenderId,
  onInspectCompanyInEntries,
  onInspectCompanyInCheques,
}) => {
  const [reportMode, setReportMode] = useState<ReportMode>('open_accounts');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | CurrencyCode>('all');
  const [tenderFilter, setTenderFilter] = useState('all');

  // Alt rapor özel filtreleri
  const [openAccountMode, setOpenAccountMode] =
    useState<OpenAccountFilterMode>('only_open');
  const [invoiceScope, setInvoiceScope] =
    useState<InvoiceScopeFilter>('invoices_only');
  const [invoiceOpenFilter, setInvoiceOpenFilter] =
    useState<InvoiceOpenFilter>('all');
  const [invoiceMethodFilter, setInvoiceMethodFilter] = useState<
    'all' | AccountingPaymentMethod
  >('all');
  const [chequeDirection, setChequeDirection] = useState<
    'all' | AccountingChequeDirection
  >('all');
  const [chequeScope, setChequeScope] = useState<ChequeReportStatusScope>('all');
  const [corpTaxRate, setCorpTaxRate] = useState<number>(25);
  const [includeGeneralExpensesInTax, setIncludeGeneralExpensesInTax] =
    useState<boolean>(true);

  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const todayStr = getTodayDateStr();
  const inSevenDaysStr = useMemo(() => {
    const base = new Date(`${todayStr}T00:00:00`);
    base.setDate(base.getDate() + 7);
    const y = base.getFullYear();
    const m = String(base.getMonth() + 1).padStart(2, '0');
    const d = String(base.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [todayStr]);

  const allCompanyNames = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => c.name && set.add(c.name.trim()));
    entries.forEach((e) => e.companyName && set.add(e.companyName.trim()));
    cheques.forEach((c) => c.companyName && set.add(c.companyName.trim()));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [companies, entries, cheques]);

  const applyDatePreset = (
    preset: 'all' | 'this_month' | 'this_quarter' | 'last_30' | 'this_year' | 'next_30'
  ) => {
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const now = new Date(`${todayStr}T00:00:00`);
    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    if (preset === 'this_month') {
      setDateFrom(`${todayStr.slice(0, 7)}-01`);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setDateTo(fmt(lastDay));
    } else if (preset === 'this_quarter') {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qStartMonth, 1);
      const end = new Date(now.getFullYear(), qStartMonth + 3, 0);
      setDateFrom(fmt(start));
      setDateTo(fmt(end));
    } else if (preset === 'last_30') {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      setDateFrom(fmt(start));
      setDateTo(todayStr);
    } else if (preset === 'this_year') {
      setDateFrom(`${todayStr.slice(0, 4)}-01-01`);
      setDateTo(`${todayStr.slice(0, 4)}-12-31`);
    } else if (preset === 'next_30') {
      const end = new Date(now);
      end.setDate(end.getDate() + 30);
      setDateFrom(todayStr);
      setDateTo(fmt(end));
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setCompanyFilter('all');
    setCurrencyFilter('all');
    setTenderFilter('all');
    setOpenAccountMode('only_open');
    setInvoiceScope('invoices_only');
    setInvoiceOpenFilter('all');
    setInvoiceMethodFilter('all');
    setChequeDirection('all');
    setChequeScope('all');
    setCorpTaxRate(25);
    setIncludeGeneralExpensesInTax(true);
  };

  // 1. AÇIK CARİLER & YAŞLANDIRMA RAPORU VERİSİ
  const openAccountRows = useMemo<OpenAccountRow[]>(() => {
    const companyByLower = new Map<string, AccountingCompany>();
    for (const c of companies) {
      companyByLower.set(c.name.trim().toLowerCase(), c);
    }

    const rowMap = new Map<string, OpenAccountRow>();
    const ensureRow = (rawName: string): OpenAccountRow => {
      const trimmed = rawName.trim() || 'Firma';
      const key = trimmed.toLowerCase();
      const existing = rowMap.get(key);
      if (existing) return existing;
      const compObj = companyByLower.get(key) || null;
      const makeStat = (): CurrencyAccountStat => ({
        salesTotal: 0,
        salesPaid: 0,
        openReceivable: 0,
        purchaseTotal: 0,
        purchasePaid: 0,
        openPayable: 0,
        openIncomingCheque: 0,
        openOutgoingCheque: 0,
        netOpen: 0,
      });
      const created: OpenAccountRow = {
        key,
        companyName: compObj?.name || trimmed,
        companyObj: compObj,
        byCurrency: {
          TRY: makeStat(),
          USD: makeStat(),
          EUR: makeStat(),
        },
        entryCount: 0,
        chequeCount: 0,
        overdueCount: 0,
        earliestOpenDueDate: '',
        hasAnyOpenBalance: false,
        hasAnyOpenCheque: false,
      };
      rowMap.set(key, created);
      return created;
    };

    companies.forEach((c) => ensureRow(c.name));

    for (const e of entries) {
      if (e.paymentStatus === 'iptal') continue;
      if (tenderFilter !== 'all' && e.tenderId !== tenderFilter) continue;
      if (currencyFilter !== 'all' && e.currency !== currencyFilter) continue;
      if (dateFrom && e.entryDate < dateFrom) continue;
      if (dateTo && e.entryDate > dateTo) continue;

      const row = ensureRow(e.companyName);
      const cur = e.currency || 'TRY';
      const stat = row.byCurrency[cur];
      row.entryCount += 1;

      const remaining =
        e.paymentStatus === 'odendi'
          ? 0
          : Math.max(0, e.totalAmount - (e.paidAmount || 0));

      if (e.entryType === 'satis_faturasi') {
        stat.salesTotal += e.totalAmount;
        stat.salesPaid += e.paidAmount || 0;
        stat.openReceivable += remaining;
      } else if (e.entryType === 'alis_faturasi' || e.entryType === 'gider') {
        stat.purchaseTotal += e.totalAmount;
        stat.purchasePaid += e.paidAmount || 0;
        stat.openPayable += remaining;
      }

      if (remaining > 0.001) {
        if (e.dueDate && e.dueDate < todayStr) {
          row.overdueCount += 1;
        }
        if (
          e.dueDate &&
          (!row.earliestOpenDueDate || e.dueDate < row.earliestOpenDueDate)
        ) {
          row.earliestOpenDueDate = e.dueDate;
        }
      }
    }

    for (const ch of cheques) {
      if (tenderFilter !== 'all' && ch.tenderId !== tenderFilter) continue;
      if (currencyFilter !== 'all' && ch.currency !== currencyFilter) continue;
      if (dateFrom && ch.dueDate < dateFrom) continue;
      if (dateTo && ch.dueDate > dateTo) continue;

      const row = ensureRow(ch.companyName);
      const cur = ch.currency || 'TRY';
      const stat = row.byCurrency[cur];
      row.chequeCount += 1;

      const isOpenCheque =
        ch.status === 'portfoyde' || ch.status === 'tahsile_verildi';
      if (isOpenCheque) {
        if (ch.direction === 'alinan') {
          stat.openIncomingCheque += ch.amount;
        } else {
          stat.openOutgoingCheque += ch.amount;
        }
        if (ch.dueDate && ch.dueDate < todayStr) {
          row.overdueCount += 1;
        }
        if (
          ch.dueDate &&
          (!row.earliestOpenDueDate || ch.dueDate < row.earliestOpenDueDate)
        ) {
          row.earliestOpenDueDate = ch.dueDate;
        }
      } else if (ch.status === 'karsiliksiz') {
        row.overdueCount += 1;
      }
    }

    const q = search.trim().toLowerCase();
    const list: OpenAccountRow[] = [];

    for (const row of rowMap.values()) {
      let anyOpenBal = false;
      let anyOpenChq = false;
      let anyReceivable = false;
      let anyPayable = false;

      for (const cur of CURRENCIES) {
        const s = row.byCurrency[cur];
        s.netOpen = s.openReceivable - s.openPayable;
        if (s.openReceivable > 0.001) {
          anyReceivable = true;
          anyOpenBal = true;
        }
        if (s.openPayable > 0.001) {
          anyPayable = true;
          anyOpenBal = true;
        }
        if (s.openIncomingCheque > 0.001 || s.openOutgoingCheque > 0.001) {
          anyOpenChq = true;
        }
      }

      row.hasAnyOpenBalance = anyOpenBal;
      row.hasAnyOpenCheque = anyOpenChq;

      if (
        companyFilter !== 'all' &&
        row.companyName.trim().toLowerCase() !== companyFilter.trim().toLowerCase()
      ) {
        continue;
      }

      if (q) {
        const matchesSearch =
          row.companyName.toLowerCase().includes(q) ||
          (row.companyObj?.taxNumber || '').toLowerCase().includes(q) ||
          (row.companyObj?.contactPerson || '').toLowerCase().includes(q);
        if (!matchesSearch) continue;
      }

      if (openAccountMode === 'only_open' && !anyOpenBal && !anyOpenChq) continue;
      if (openAccountMode === 'receivable' && !anyReceivable) continue;
      if (openAccountMode === 'payable' && !anyPayable) continue;
      if (openAccountMode === 'overdue' && row.overdueCount === 0) continue;
      if (openAccountMode === 'with_open_cheques' && !anyOpenChq) continue;

      list.push(row);
    }

    return list.sort((a, b) => {
      if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
      const aTotal = CURRENCIES.reduce(
        (acc, c) =>
          acc + a.byCurrency[c].openReceivable + a.byCurrency[c].openPayable,
        0
      );
      const bTotal = CURRENCIES.reduce(
        (acc, c) =>
          acc + b.byCurrency[c].openReceivable + b.byCurrency[c].openPayable,
        0
      );
      if (bTotal !== aTotal) return bTotal - aTotal;
      return a.companyName.localeCompare(b.companyName, 'tr');
    });
  }, [
    companies,
    entries,
    cheques,
    tenderFilter,
    currencyFilter,
    dateFrom,
    dateTo,
    companyFilter,
    search,
    openAccountMode,
    todayStr,
  ]);

  const openAccountTotals = useMemo(() => {
    const receivable = emptyBuckets();
    const payable = emptyBuckets();
    const incomingCheques = emptyBuckets();
    const outgoingCheques = emptyBuckets();
    let overdueCompanies = 0;

    for (const row of openAccountRows) {
      if (row.overdueCount > 0) overdueCompanies += 1;
      for (const c of CURRENCIES) {
        receivable[c] += row.byCurrency[c].openReceivable;
        payable[c] += row.byCurrency[c].openPayable;
        incomingCheques[c] += row.byCurrency[c].openIncomingCheque;
        outgoingCheques[c] += row.byCurrency[c].openOutgoingCheque;
      }
    }
    const netPosition = emptyBuckets();
    for (const c of CURRENCIES) {
      netPosition[c] = receivable[c] - payable[c];
    }
    return {
      receivable,
      payable,
      incomingCheques,
      outgoingCheques,
      netPosition,
      overdueCompanies,
    };
  }, [openAccountRows]);

  // 2. FATURALAR & HAREKET RAPORU VERİSİ
  const reportInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (invoiceScope === 'invoices_only') {
        if (e.entryType !== 'alis_faturasi' && e.entryType !== 'satis_faturasi') {
          return false;
        }
      } else if (invoiceScope === 'cash_flow') {
        if (e.entryType !== 'tahsilat' && e.entryType !== 'odeme') return false;
      } else if (invoiceScope !== 'all' && e.entryType !== invoiceScope) {
        return false;
      }

      if (invoiceOpenFilter === 'open_only') {
        if (e.paymentStatus !== 'bekliyor' && e.paymentStatus !== 'kismi') {
          return false;
        }
      } else if (invoiceOpenFilter === 'paid') {
        if (e.paymentStatus !== 'odendi') return false;
      } else if (invoiceOpenFilter === 'overdue') {
        if (
          (e.paymentStatus !== 'bekliyor' && e.paymentStatus !== 'kismi') ||
          !e.dueDate ||
          e.dueDate >= todayStr
        ) {
          return false;
        }
      } else if (invoiceOpenFilter === 'cancelled') {
        if (e.paymentStatus !== 'iptal') return false;
      }

      if (invoiceMethodFilter !== 'all' && e.paymentMethod !== invoiceMethodFilter) {
        return false;
      }
      if (currencyFilter !== 'all' && e.currency !== currencyFilter) return false;
      if (tenderFilter !== 'all' && e.tenderId !== tenderFilter) return false;
      if (
        companyFilter !== 'all' &&
        e.companyName.trim().toLowerCase() !== companyFilter.trim().toLowerCase()
      ) {
        return false;
      }
      if (dateFrom && e.entryDate < dateFrom) return false;
      if (dateTo && e.entryDate > dateTo) return false;

      if (!q) return true;
      return (
        e.companyName.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.invoiceNo.toLowerCase().includes(q) ||
        e.tenderTrackingCode.toLowerCase().includes(q) ||
        e.stockNumber.toLowerCase().includes(q) ||
        e.partNumber.toLowerCase().includes(q)
      );
    });
  }, [
    entries,
    invoiceScope,
    invoiceOpenFilter,
    invoiceMethodFilter,
    currencyFilter,
    tenderFilter,
    companyFilter,
    dateFrom,
    dateTo,
    search,
    todayStr,
  ]);

  const invoiceTotals = useMemo(() => {
    const subtotal = emptyBuckets();
    const vat = emptyBuckets();
    const total = emptyBuckets();
    const paid = emptyBuckets();
    const openRemaining = emptyBuckets();
    let overdueCount = 0;

    for (const e of reportInvoices) {
      if (e.paymentStatus === 'iptal') continue;
      const c = e.currency || 'TRY';
      subtotal[c] += e.subtotalAmount || 0;
      vat[c] += e.vatAmount || 0;
      total[c] += e.totalAmount || 0;
      paid[c] += e.paidAmount || 0;
      if (e.paymentStatus !== 'odendi') {
        openRemaining[c] += Math.max(0, e.totalAmount - (e.paidAmount || 0));
      }
      if (
        (e.paymentStatus === 'bekliyor' || e.paymentStatus === 'kismi') &&
        e.dueDate &&
        e.dueDate < todayStr
      ) {
        overdueCount += 1;
      }
    }

    return { subtotal, vat, total, paid, openRemaining, overdueCount };
  }, [reportInvoices, todayStr]);

  // 3. ÇEK PORTFÖY & VADE RAPORU VERİSİ
  const reportCheques = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cheques.filter((ch) => {
      if (chequeDirection !== 'all' && ch.direction !== chequeDirection) {
        return false;
      }

      if (chequeScope === 'open_only') {
        if (ch.status !== 'portfoyde' && ch.status !== 'tahsile_verildi') {
          return false;
        }
      } else if (chequeScope === 'settled') {
        if (ch.status !== 'tahsil_edildi' && ch.status !== 'odendi') return false;
      } else if (chequeScope === 'endorsed') {
        if (ch.status !== 'ciro_edildi') return false;
      } else if (chequeScope === 'bounced_returned') {
        if (ch.status !== 'karsiliksiz' && ch.status !== 'iade') return false;
      } else if (chequeScope === 'overdue_or_7days') {
        const isOpen =
          ch.status === 'portfoyde' || ch.status === 'tahsile_verildi';
        const isDueSoonOrPast =
          isOpen && ch.dueDate && ch.dueDate <= inSevenDaysStr;
        const isBounced = ch.status === 'karsiliksiz';
        if (!isDueSoonOrPast && !isBounced) return false;
      }

      if (currencyFilter !== 'all' && ch.currency !== currencyFilter) return false;
      if (tenderFilter !== 'all' && ch.tenderId !== tenderFilter) return false;
      if (
        companyFilter !== 'all' &&
        ch.companyName.trim().toLowerCase() !== companyFilter.trim().toLowerCase()
      ) {
        return false;
      }
      if (dateFrom && ch.dueDate < dateFrom) return false;
      if (dateTo && ch.dueDate > dateTo) return false;

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
    chequeDirection,
    chequeScope,
    currencyFilter,
    tenderFilter,
    companyFilter,
    dateFrom,
    dateTo,
    search,
    inSevenDaysStr,
  ]);

  const chequeTotals = useMemo(() => {
    const incomingOpen = emptyBuckets();
    const outgoingOpen = emptyBuckets();
    const settled = emptyBuckets();
    const totalAll = emptyBuckets();
    let overdueOrBouncedCount = 0;

    for (const ch of reportCheques) {
      const c = ch.currency || 'TRY';
      totalAll[c] += ch.amount;
      const isOpen = ch.status === 'portfoyde' || ch.status === 'tahsile_verildi';
      if (isOpen) {
        if (ch.direction === 'alinan') incomingOpen[c] += ch.amount;
        else outgoingOpen[c] += ch.amount;
      } else if (ch.status === 'tahsil_edildi' || ch.status === 'odendi') {
        settled[c] += ch.amount;
      }
      if (
        (isOpen && ch.dueDate && ch.dueDate < todayStr) ||
        ch.status === 'karsiliksiz'
      ) {
        overdueOrBouncedCount += 1;
      }
    }

    return {
      incomingOpen,
      outgoingOpen,
      settled,
      totalAll,
      overdueOrBouncedCount,
    };
  }, [reportCheques, todayStr]);

  // 4. KDV & KURUMLAR VERGİSİ RAPORU VERİSİ
  const taxRelevantEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (e.paymentStatus === 'iptal') return false;
      const isAllowedType =
        e.entryType === 'satis_faturasi' ||
        e.entryType === 'alis_faturasi' ||
        (includeGeneralExpensesInTax && e.entryType === 'gider');
      if (!isAllowedType) return false;

      if (currencyFilter !== 'all' && e.currency !== currencyFilter) return false;
      if (tenderFilter !== 'all' && e.tenderId !== tenderFilter) return false;
      if (
        companyFilter !== 'all' &&
        e.companyName.trim().toLowerCase() !== companyFilter.trim().toLowerCase()
      ) {
        return false;
      }
      if (dateFrom && e.entryDate < dateFrom) return false;
      if (dateTo && e.entryDate > dateTo) return false;

      if (!q) return true;
      return (
        e.companyName.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q) ||
        e.invoiceNo.toLowerCase().includes(q) ||
        e.tenderTrackingCode.toLowerCase().includes(q)
      );
    });
  }, [
    entries,
    includeGeneralExpensesInTax,
    currencyFilter,
    tenderFilter,
    companyFilter,
    dateFrom,
    dateTo,
    search,
  ]);

  const taxSummary = useMemo(() => {
    const safeRate = Math.max(0, Math.min(50, Number(corpTaxRate) || 0));

    interface CurrencyTaxRow {
      currency: CurrencyCode;
      salesCount: number;
      salesSubtotal: number;
      outputVat: number;
      salesGross: number;
      purchaseCount: number;
      purchaseSubtotal: number;
      inputVat: number;
      purchaseGross: number;
      netVat: number; // outputVat - inputVat (>0 Ödenecek, <0 Devreden)
      taxBase: number; // salesSubtotal - purchaseSubtotal
      estimatedCorpTax: number;
      netProfitAfterTax: number;
    }

    interface VatRateBreakdownRow {
      key: string;
      currency: CurrencyCode;
      vatRate: number;
      salesSubtotal: number;
      outputVat: number;
      purchaseSubtotal: number;
      inputVat: number;
      netVat: number;
      docCount: number;
    }

    const byCurrencyMap = new Map<CurrencyCode, CurrencyTaxRow>();
    for (const cur of CURRENCIES) {
      byCurrencyMap.set(cur, {
        currency: cur,
        salesCount: 0,
        salesSubtotal: 0,
        outputVat: 0,
        salesGross: 0,
        purchaseCount: 0,
        purchaseSubtotal: 0,
        inputVat: 0,
        purchaseGross: 0,
        netVat: 0,
        taxBase: 0,
        estimatedCorpTax: 0,
        netProfitAfterTax: 0,
      });
    }

    const vatRateMap = new Map<string, VatRateBreakdownRow>();

    const outputVatBuckets = emptyBuckets();
    const inputVatBuckets = emptyBuckets();
    const netVatBuckets = emptyBuckets();
    const salesSubtotalBuckets = emptyBuckets();
    const purchaseSubtotalBuckets = emptyBuckets();
    const taxBaseBuckets = emptyBuckets();
    const corpTaxBuckets = emptyBuckets();
    const netProfitAfterTaxBuckets = emptyBuckets();

    for (const e of taxRelevantEntries) {
      const cur = e.currency || 'TRY';
      const curRow = byCurrencyMap.get(cur)!;
      const sub = e.subtotalAmount || 0;
      const vat = e.vatAmount || 0;
      const tot = e.totalAmount || 0;
      const rateKeyNum = Math.round(e.vatRate ?? 0);
      const rateKey = `${cur}-${rateKeyNum}`;

      if (!vatRateMap.has(rateKey)) {
        vatRateMap.set(rateKey, {
          key: rateKey,
          currency: cur,
          vatRate: rateKeyNum,
          salesSubtotal: 0,
          outputVat: 0,
          purchaseSubtotal: 0,
          inputVat: 0,
          netVat: 0,
          docCount: 0,
        });
      }
      const rateRow = vatRateMap.get(rateKey)!;
      rateRow.docCount += 1;

      if (e.entryType === 'satis_faturasi') {
        curRow.salesCount += 1;
        curRow.salesSubtotal += sub;
        curRow.outputVat += vat;
        curRow.salesGross += tot;
        rateRow.salesSubtotal += sub;
        rateRow.outputVat += vat;
      } else {
        curRow.purchaseCount += 1;
        curRow.purchaseSubtotal += sub;
        curRow.inputVat += vat;
        curRow.purchaseGross += tot;
        rateRow.purchaseSubtotal += sub;
        rateRow.inputVat += vat;
      }
    }

    const activeCurrencyRows: CurrencyTaxRow[] = [];
    for (const cur of CURRENCIES) {
      const r = byCurrencyMap.get(cur)!;
      if (r.salesCount === 0 && r.purchaseCount === 0) continue;
      r.netVat = r.outputVat - r.inputVat;
      r.taxBase = r.salesSubtotal - r.purchaseSubtotal;
      r.estimatedCorpTax = r.taxBase > 0 ? (r.taxBase * safeRate) / 100 : 0;
      r.netProfitAfterTax = r.taxBase - r.estimatedCorpTax;
      activeCurrencyRows.push(r);

      outputVatBuckets[cur] = r.outputVat;
      inputVatBuckets[cur] = r.inputVat;
      netVatBuckets[cur] = r.netVat;
      salesSubtotalBuckets[cur] = r.salesSubtotal;
      purchaseSubtotalBuckets[cur] = r.purchaseSubtotal;
      taxBaseBuckets[cur] = r.taxBase;
      corpTaxBuckets[cur] = r.estimatedCorpTax;
      netProfitAfterTaxBuckets[cur] = r.netProfitAfterTax;
    }

    const vatRateRows = Array.from(vatRateMap.values())
      .map((row) => ({
        ...row,
        netVat: row.outputVat - row.inputVat,
      }))
      .sort((a, b) => {
        if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
        return b.vatRate - a.vatRate;
      });

    return {
      safeRate,
      activeCurrencyRows,
      vatRateRows,
      outputVatBuckets,
      inputVatBuckets,
      netVatBuckets,
      salesSubtotalBuckets,
      purchaseSubtotalBuckets,
      taxBaseBuckets,
      corpTaxBuckets,
      netProfitAfterTaxBuckets,
    };
  }, [taxRelevantEntries, corpTaxRate]);

  // CSV İndirme
  const handleDownloadCsv = () => {
    let headers: string[] = [];
    let rows: (string | number)[][] = [];
    let fileName = `OnMuhasebe_Rapor_${todayStr}.csv`;

    if (reportMode === 'open_accounts') {
      headers = [
        'Cari Firma',
        'Firma Türü',
        'Para Birimi',
        'Toplam Satış',
        'Açık Alacak',
        'Toplam Alış/Gider',
        'Açık Borç',
        'Açık Alınan Çek',
        'Açık Verilen Çek',
        'Net Açık Bakiye',
        'Gecikmiş Kayıt',
        'En Eski Açık Vade',
      ];
      for (const row of openAccountRows) {
        const activeCurs = CURRENCIES.filter((c) => {
          const s = row.byCurrency[c];
          return (
            s.salesTotal > 0 ||
            s.purchaseTotal > 0 ||
            s.openIncomingCheque > 0 ||
            s.openOutgoingCheque > 0
          );
        });
        const listCurs = activeCurs.length > 0 ? activeCurs : (['TRY'] as CurrencyCode[]);
        for (const cur of listCurs) {
          const s = row.byCurrency[cur];
          rows.push([
            row.companyName,
            row.companyObj
              ? ACCOUNTING_COMPANY_TYPE_LABELS[row.companyObj.companyType]
              : 'Kayıtsız Cari',
            cur,
            s.salesTotal.toFixed(2),
            s.openReceivable.toFixed(2),
            s.purchaseTotal.toFixed(2),
            s.openPayable.toFixed(2),
            s.openIncomingCheque.toFixed(2),
            s.openOutgoingCheque.toFixed(2),
            s.netOpen.toFixed(2),
            row.overdueCount,
            row.earliestOpenDueDate || '',
          ]);
        }
      }
      fileName = `Acik_Cariler_Raporu_${todayStr}.csv`;
    } else if (reportMode === 'invoices') {
      headers = [
        'Belge Tarihi',
        'Vade Tarihi',
        'İşlem Türü',
        'Belge / Fatura No',
        'Cari Firma',
        'Açıklama',
        'KDV Hariç',
        'KDV Tutarı',
        'Genel Toplam',
        'Ödenen / Tahsil Edilen',
        'Kalan Açık Tutar',
        'Para Birimi',
        'Ödeme Yöntemi',
        'Durum',
        'İhale Takip No',
      ];
      rows = reportInvoices.map((e) => {
        const remaining =
          e.paymentStatus === 'odendi' || e.paymentStatus === 'iptal'
            ? 0
            : Math.max(0, e.totalAmount - (e.paidAmount || 0));
        return [
          e.entryDate,
          e.dueDate || '',
          ACCOUNTING_ENTRY_TYPE_LABELS[e.entryType],
          e.invoiceNo || '',
          e.companyName,
          e.title,
          (e.subtotalAmount || 0).toFixed(2),
          (e.vatAmount || 0).toFixed(2),
          e.totalAmount.toFixed(2),
          (e.paidAmount || 0).toFixed(2),
          remaining.toFixed(2),
          e.currency,
          ACCOUNTING_PAYMENT_METHOD_LABELS[e.paymentMethod],
          ACCOUNTING_PAYMENT_STATUS_LABELS[e.paymentStatus],
          e.tenderTrackingCode || '',
        ];
      });
      fileName = `Fatura_ve_Hareket_Raporu_${todayStr}.csv`;
    } else if (reportMode === 'cheques') {
      headers = [
        'Vade Tarihi',
        'Keşide Tarihi',
        'Çek Yönü',
        'Çek No',
        'Banka / Şube',
        'Cari Firma',
        'Keşideci / Ciro Edilen',
        'Tutar',
        'Para Birimi',
        'Durum',
        'İhale Takip No',
      ];
      rows = reportCheques.map((ch) => [
        ch.dueDate,
        ch.issueDate || '',
        ACCOUNTING_CHEQUE_DIRECTION_LABELS[ch.direction],
        ch.chequeNo,
        `${ch.bankName}${ch.branchName ? ` / ${ch.branchName}` : ''}`,
        ch.companyName,
        ch.endorsedTo || ch.drawerName || '',
        ch.amount.toFixed(2),
        ch.currency,
        ACCOUNTING_CHEQUE_STATUS_LABELS[ch.status],
        ch.tenderTrackingCode || '',
      ]);
      fileName = `Cek_Portfoy_Raporu_${todayStr}.csv`;
    } else {
      headers = [
        'Para Birimi',
        'Satış Adedi',
        'Satış Matrahı (KDV Hariç)',
        'Hesaplanan KDV (Satış)',
        'Alış/Gider Adedi',
        'Alış/Gider Matrahı (KDV Hariç)',
        'İndirilecek KDV (Alış/Gider)',
        'Net KDV (Ödenecek / -Devreden)',
        'KDV Durumu',
        'Kurumlar Vergisi Matrahı (Ticari Kâr)',
        `Tahmini Kurumlar Vergisi (%${taxSummary.safeRate})`,
        'Vergi Sonrası Net Kâr',
      ];
      rows = taxSummary.activeCurrencyRows.map((r) => [
        r.currency,
        r.salesCount,
        r.salesSubtotal.toFixed(2),
        r.outputVat.toFixed(2),
        r.purchaseCount,
        r.purchaseSubtotal.toFixed(2),
        r.inputVat.toFixed(2),
        r.netVat.toFixed(2),
        r.netVat >= 0 ? 'Ödenecek KDV' : 'Devreden KDV',
        r.taxBase.toFixed(2),
        r.estimatedCorpTax.toFixed(2),
        r.netProfitAfterTax.toFixed(2),
      ]);
      fileName = `KDV_ve_Kurumlar_Vergisi_Raporu_${todayStr}.csv`;
    }

    const csv =
      '\uFEFF' +
      [
        headers.map(escapeCsvCell).join(';'),
        ...rows.map((r) => r.map(escapeCsvCell).join(';')),
      ].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // PDF İndirme
  const handleDownloadPdf = async () => {
    setExportingPdf(true);
    setPdfError(null);
    try {
      const filters: string[] = [];
      if (dateFrom || dateTo) {
        filters.push(
          `Tarih: ${dateFrom ? formatTurkishDate(dateFrom) : 'Başlangıç'} - ${
            dateTo ? formatTurkishDate(dateTo) : 'Bugün'
          }`
        );
      }
      if (companyFilter !== 'all') filters.push(`Firma: ${companyFilter}`);
      if (currencyFilter !== 'all') filters.push(`Döviz: ${currencyFilter}`);
      if (tenderFilter !== 'all') {
        const t = tenders.find((x) => x.id === tenderFilter);
        if (t) filters.push(`İhale: ${t.trackingCode}`);
      }
      if (search.trim()) filters.push(`Arama: "${search.trim()}"`);

      if (reportMode === 'open_accounts') {
        const modeLabels: Record<OpenAccountFilterMode, string> = {
          only_open: 'Yalnızca Açık Cariler',
          receivable: 'Alacaklı Olduğumuz Cariler',
          payable: 'Borçlu Olduğumuz Cariler',
          overdue: 'Vadesi Geçmiş Açık Cariler',
          with_open_cheques: 'Açık Çeki Bulunan Cariler',
          all: 'Tüm Cariler',
        };
        filters.unshift(modeLabels[openAccountMode]);

        const pdfRows = openAccountRows.flatMap((row) => {
          const activeCurs = CURRENCIES.filter((c) => {
            const s = row.byCurrency[c];
            return (
              s.openReceivable > 0 ||
              s.openPayable > 0 ||
              s.openIncomingCheque > 0 ||
              s.openOutgoingCheque > 0 ||
              s.salesTotal > 0 ||
              s.purchaseTotal > 0
            );
          });
          const listCurs = activeCurs.length > 0 ? activeCurs : (['TRY'] as CurrencyCode[]);
          return listCurs.map((cur) => {
            const s = row.byCurrency[cur];
            return [
              { text: row.companyName, bold: true },
              cur,
              { text: formatCurrency(s.openReceivable, cur), color: '#007A53', bold: s.openReceivable > 0 },
              { text: formatCurrency(s.openPayable, cur), color: '#B91C1C', bold: s.openPayable > 0 },
              formatCurrency(s.openIncomingCheque, cur),
              formatCurrency(s.openOutgoingCheque, cur),
              {
                text: formatCurrency(s.netOpen, cur),
                bold: true,
                color: s.netOpen >= 0 ? '#007A53' : '#B91C1C',
              },
              row.overdueCount > 0
                ? { text: `${row.overdueCount} gecikmiş`, color: '#B91C1C', bold: true }
                : row.earliestOpenDueDate
                ? formatTurkishDate(row.earliestOpenDueDate)
                : '—',
            ];
          });
        });

        await downloadAccountingReportPdf({
          companyName,
          reportTitle: 'Açık Cariler & Bakiye Yaşlandırma Raporu',
          reportSubtitle: `${openAccountRows.length} cari hesap listelendi`,
          filterSummary: filters,
          summaryItems: [
            {
              label: 'Toplam Açık Alacak',
              value: formatCurrencyBucketsCompact(openAccountTotals.receivable),
              accentColor: '#007A53',
            },
            {
              label: 'Toplam Açık Borç',
              value: formatCurrencyBucketsCompact(openAccountTotals.payable),
              accentColor: '#B91C1C',
            },
            {
              label: 'Açık Alınan / Verilen Çek',
              value: `${formatCurrencyBucketsCompact(
                openAccountTotals.incomingCheques
              )} / ${formatCurrencyBucketsCompact(openAccountTotals.outgoingCheques)}`,
              accentColor: '#0066B3',
            },
            {
              label: 'Net Açık Pozisyon',
              value: formatCurrencyBucketsCompact(openAccountTotals.netPosition),
            },
          ],
          columns: [
            { header: 'Cari Firma', width: '*' },
            { header: 'Birim', width: 38, align: 'center' },
            { header: 'Açık Alacak', width: 85, align: 'right' },
            { header: 'Açık Borç', width: 85, align: 'right' },
            { header: 'Alınan Açık Çek', width: 85, align: 'right' },
            { header: 'Verilen Açık Çek', width: 85, align: 'right' },
            { header: 'Net Açık Bakiye', width: 90, align: 'right' },
            { header: 'Vade / Risk', width: 78, align: 'center' },
          ],
          rows: pdfRows,
          filePrefix: 'Acik_Cariler_Raporu',
        });
      } else if (reportMode === 'invoices') {
        const pdfRows = reportInvoices.map((e) => {
          const remaining =
            e.paymentStatus === 'odendi' || e.paymentStatus === 'iptal'
              ? 0
              : Math.max(0, e.totalAmount - (e.paidAmount || 0));
          return [
            formatTurkishDate(e.entryDate),
            e.invoiceNo || '—',
            ACCOUNTING_ENTRY_TYPE_LABELS[e.entryType],
            { text: e.companyName, bold: true },
            e.title,
            formatCurrency(e.totalAmount, e.currency),
            {
              text: formatCurrency(remaining, e.currency),
              bold: remaining > 0,
              color: remaining > 0 ? '#B45309' : '#007A53',
            },
            e.dueDate ? formatTurkishDate(e.dueDate) : '—',
            ACCOUNTING_PAYMENT_STATUS_LABELS[e.paymentStatus],
          ];
        });

        await downloadAccountingReportPdf({
          companyName,
          reportTitle: 'Faturalar & Muhasebe Hareketleri Raporu',
          reportSubtitle: `${reportInvoices.length} belge / işlem kaydı listelendi`,
          filterSummary: filters,
          summaryItems: [
            {
              label: 'KDV Hariç Matrah',
              value: formatCurrencyBucketsCompact(invoiceTotals.subtotal),
            },
            {
              label: 'Toplam KDV',
              value: formatCurrencyBucketsCompact(invoiceTotals.vat),
              accentColor: '#0066B3',
            },
            {
              label: 'Genel Toplam',
              value: formatCurrencyBucketsCompact(invoiceTotals.total),
            },
            {
              label: 'Kalan Açık Bakiye',
              value: formatCurrencyBucketsCompact(invoiceTotals.openRemaining),
              accentColor: '#B91C1C',
            },
          ],
          columns: [
            { header: 'Tarih', width: 62 },
            { header: 'Belge No', width: 68 },
            { header: 'İşlem Türü', width: 85 },
            { header: 'Cari Firma', width: 110 },
            { header: 'Açıklama', width: '*' },
            { header: 'Genel Toplam', width: 78, align: 'right' },
            { header: 'Kalan Açık', width: 78, align: 'right' },
            { header: 'Vade', width: 62 },
            { header: 'Durum', width: 72 },
          ],
          rows: pdfRows,
          filePrefix: 'Faturalar_Raporu',
        });
      } else if (reportMode === 'cheques') {
        const pdfRows = reportCheques.map((ch) => [
          { text: formatTurkishDate(ch.dueDate), bold: true },
          ch.direction === 'alinan' ? 'Alınan Çek' : 'Verilen Çek',
          ch.chequeNo,
          `${ch.bankName}${ch.branchName ? ` / ${ch.branchName}` : ''}`,
          { text: ch.companyName, bold: true },
          ch.endorsedTo || ch.drawerName || '—',
          { text: formatCurrency(ch.amount, ch.currency), bold: true },
          ACCOUNTING_CHEQUE_STATUS_LABELS[ch.status],
          ch.tenderTrackingCode || '—',
        ]);

        await downloadAccountingReportPdf({
          companyName,
          reportTitle: 'Çek Portföyü & Vade Takip Raporu',
          reportSubtitle: `${reportCheques.length} çek kaydı listelendi`,
          filterSummary: filters,
          summaryItems: [
            {
              label: 'Açık Alınan Çekler',
              value: formatCurrencyBucketsCompact(chequeTotals.incomingOpen),
              accentColor: '#007A53',
            },
            {
              label: 'Açık Verilen Çekler',
              value: formatCurrencyBucketsCompact(chequeTotals.outgoingOpen),
              accentColor: '#B45309',
            },
            {
              label: 'Tahsil / Ödenen Çekler',
              value: formatCurrencyBucketsCompact(chequeTotals.settled),
              accentColor: '#0066B3',
            },
            {
              label: 'Gecikmiş / Karşılıksız',
              value: `${chequeTotals.overdueOrBouncedCount} adet`,
              accentColor:
                chequeTotals.overdueOrBouncedCount > 0 ? '#B91C1C' : '#0B2239',
            },
          ],
          columns: [
            { header: 'Vade Tarihi', width: 65 },
            { header: 'Yön', width: 62 },
            { header: 'Çek No', width: 68 },
            { header: 'Banka / Şube', width: 105 },
            { header: 'Cari Firma', width: '*' },
            { header: 'Keşideci / Ciro', width: 95 },
            { header: 'Tutar', width: 82, align: 'right' },
            { header: 'Durum', width: 90 },
            { header: 'İhale', width: 60 },
          ],
          rows: pdfRows,
          filePrefix: 'Cek_Portfoy_Raporu',
        });
      } else {
        filters.unshift(`Kurumlar Vergisi Oranı: %${taxSummary.safeRate}`);
        filters.push(
          includeGeneralExpensesInTax
            ? 'Kapsam: Alış/Satış Faturaları + Genel Giderler'
            : 'Kapsam: Yalnızca Alış & Satış Faturaları'
        );

        const pdfRows = taxSummary.activeCurrencyRows.map((r) => [
          { text: r.currency, bold: true },
          formatCurrency(r.salesSubtotal, r.currency),
          { text: formatCurrency(r.outputVat, r.currency), color: '#0066B3', bold: true },
          formatCurrency(r.purchaseSubtotal, r.currency),
          { text: formatCurrency(r.inputVat, r.currency), color: '#007A53', bold: true },
          {
            text:
              r.netVat >= 0
                ? `${formatCurrency(r.netVat, r.currency)} (Ödenecek)`
                : `${formatCurrency(Math.abs(r.netVat), r.currency)} (Devreden)`,
            bold: true,
            color: r.netVat >= 0 ? '#B45309' : '#007A53',
          },
          {
            text: formatCurrency(r.taxBase, r.currency),
            color: r.taxBase >= 0 ? '#0B2239' : '#B91C1C',
          },
          {
            text: formatCurrency(r.estimatedCorpTax, r.currency),
            bold: true,
            color: r.estimatedCorpTax > 0 ? '#B91C1C' : '#4E5D6C',
          },
          {
            text: formatCurrency(r.netProfitAfterTax, r.currency),
            bold: true,
            color: r.netProfitAfterTax >= 0 ? '#007A53' : '#B91C1C',
          },
        ]);

        await downloadAccountingReportPdf({
          companyName,
          reportTitle: 'KDV & Tahmini Kurumlar Vergisi Raporu',
          reportSubtitle: `${taxRelevantEntries.length} belge esas alınarak hesaplandı (Kurumlar Vergisi: %${taxSummary.safeRate})`,
          filterSummary: filters,
          summaryItems: [
            {
              label: 'Hesaplanan KDV (Satış)',
              value: formatCurrencyBucketsCompact(taxSummary.outputVatBuckets),
              accentColor: '#0066B3',
            },
            {
              label: 'İndirilecek KDV (Alış/Gider)',
              value: formatCurrencyBucketsCompact(taxSummary.inputVatBuckets),
              accentColor: '#007A53',
            },
            {
              label: 'Net KDV (Ödenecek / -Devreden)',
              value: formatCurrencyBucketsCompact(taxSummary.netVatBuckets),
              accentColor: '#B45309',
            },
            {
              label: `Tahmini Kurumlar Vergisi (%${taxSummary.safeRate})`,
              value: formatCurrencyBucketsCompact(taxSummary.corpTaxBuckets),
              accentColor: '#B91C1C',
            },
          ],
          columns: [
            { header: 'Birim', width: 34, align: 'center' },
            { header: 'Satış Matrahı', width: 80, align: 'right' },
            { header: 'Hesaplanan KDV', width: 80, align: 'right' },
            { header: 'Alış/Gider Matrahı', width: 82, align: 'right' },
            { header: 'İndirilecek KDV', width: 80, align: 'right' },
            { header: 'Net KDV Durumu', width: 105, align: 'right' },
            { header: 'Vergi Matrahı', width: 80, align: 'right' },
            { header: `Kurumlar V. (%${taxSummary.safeRate})`, width: 85, align: 'right' },
            { header: 'Vergi Sonrası Kâr', width: '*', align: 'right' },
          ],
          rows: pdfRows,
          filePrefix: 'KDV_ve_Kurumlar_Vergisi_Raporu',
        });
      }
    } catch (err) {
      setPdfError(
        err instanceof Error ? err.message : 'PDF raporu oluşturulamadı.'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const activeRowCount =
    reportMode === 'open_accounts'
      ? openAccountRows.length
      : reportMode === 'invoices'
      ? reportInvoices.length
      : reportMode === 'cheques'
      ? reportCheques.length
      : taxRelevantEntries.length;

  return (
    <div className="space-y-5">
      {/* Rapor Türü Seçici + Dışa Aktarım Çubuğu */}
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <BarChart3 className="w-5 h-5 text-[#0066B3] shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display text-sm font-bold text-[#0B2239]">
                Ön Muhasebe Finansal Raporları
              </h3>
              <p className="text-xs text-[#4E5D6C] mt-0.5">
                Açık carileri, kesilen/gelen faturaları ve çek portföyünü tarih, vade, döviz ve firma bazlı filtreleyip Excel (CSV) veya PDF olarak indirin.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadCsv}
              disabled={activeRowCount === 0}
              className="min-h-[40px] px-3.5 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-[#0066B3]" />
              <span>Excel / CSV İndir</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={activeRowCount === 0 || exportingPdf}
              className="min-h-[40px] px-3.5 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
            >
              {exportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#FBBF24]" />
              ) : (
                <FileDown className="w-4 h-4 text-[#34D399]" />
              )}
              <span>{exportingPdf ? 'PDF Hazırlanıyor…' : 'PDF Raporu İndir'}</span>
            </button>
          </div>
        </div>

        {/* 4 Alt Rapor Modu */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-3 border-t border-[#DCE3EC]">
          {(
            [
              {
                id: 'open_accounts',
                title: 'Açık Cariler & Yaşlandırma',
                desc: 'Açık alacak, açık borç, açık çek ve net cari pozisyon',
                icon: Building2,
              },
              {
                id: 'invoices',
                title: 'Faturalar & Hareket Raporu',
                desc: 'Alış/satış faturaları, KDV matrahı, ödenen ve kalan açık tutar',
                icon: Receipt,
              },
              {
                id: 'cheques',
                title: 'Çek Portföy & Vade Raporu',
                desc: 'Alınan/verilen çekler, yaklaşan vadeler ve tahsilat durumu',
                icon: Landmark,
              },
              {
                id: 'tax_summary',
                title: 'KDV & Kurumlar Vergisi',
                desc: 'Hesaplanan/İndirilecek KDV farkı ve tahmini Kurumlar Vergisi',
                icon: Percent,
              },
            ] as {
              id: ReportMode;
              title: string;
              desc: string;
              icon: React.ComponentType<{ className?: string }>;
            }[]
          ).map((item) => {
            const Icon = item.icon;
            const active = reportMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setReportMode(item.id)}
                className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex items-start gap-3 ${
                  active
                    ? 'bg-[#0066B3]/8 border-[#0066B3]'
                    : 'bg-[#F3F6FA]/60 border-[#DCE3EC] hover:bg-white'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    active
                      ? 'bg-[#0B2239] text-[#34D399]'
                      : 'bg-white text-[#4E5D6C] border border-[#DCE3EC]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#0B2239]">{item.title}</div>
                  <div className="text-[11px] text-[#4E5D6C] mt-0.5 leading-snug">
                    {item.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Ortak Filtre Alanları */}
        <div className="p-3.5 bg-[#F3F6FA]/70 border border-[#DCE3EC] rounded-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B2239]">
              <Filter className="w-3.5 h-3.5 text-[#0066B3]" />
              <span>Rapor Filtreleri</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'Tüm Tarihler' },
                  { id: 'this_month', label: 'Bu Ay' },
                  { id: 'this_quarter', label: 'Bu Çeyrek' },
                  { id: 'last_30', label: 'Son 30 Gün' },
                  { id: 'next_30', label: 'Gelecek 30 Gün (Vade)' },
                  { id: 'this_year', label: 'Bu Yıl' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyDatePreset(preset.id)}
                  className="px-2.5 py-1 bg-white border border-[#DCE3EC] hover:bg-[#0066B3] hover:text-white hover:border-[#0066B3] text-[#0B2239] text-[11px] font-semibold rounded-md cursor-pointer transition-colors"
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2.5 py-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[#4E5D6C] hover:text-[#0B2239] cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Sıfırla</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
            <div className="relative lg:col-span-2">
              <Search className="w-3.5 h-3.5 text-[#868686] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Firma, belge no, çek no, banka veya ihale ara..."
                className="w-full min-h-[40px] pl-9 pr-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#4E5D6C] shrink-0" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Başlangıç Tarihi"
                className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239]"
              />
            </div>

            <div>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Bitiş Tarihi"
                className="w-full min-h-[40px] px-2.5 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239]"
              />
            </div>

            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="min-h-[40px] px-2.5 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-medium text-[#0B2239]"
            >
              <option value="all">Tüm Cariler / Firmalar</option>
              {allCompanyNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value as 'all' | CurrencyCode)}
                className="min-h-[40px] px-2 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-mono text-[#0B2239]"
              >
                <option value="all">Tüm Döviz</option>
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>

              <select
                value={tenderFilter}
                onChange={(e) => setTenderFilter(e.target.value)}
                className="min-h-[40px] px-2 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-medium text-[#0B2239]"
              >
                <option value="all">Tüm İhaleler</option>
                {tenders.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.trackingCode}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Rapora Özel İkinci Filtre Satırı */}
          {reportMode === 'open_accounts' && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#DCE3EC]">
              <span className="text-[11px] font-semibold text-[#4E5D6C] mr-1">
                Cari Filtresi:
              </span>
              {(
                [
                  { id: 'only_open', label: 'Yalnızca Açık Cariler' },
                  { id: 'receivable', label: 'Alacaklı Olduklarımız' },
                  { id: 'payable', label: 'Borçlu Olduklarımız' },
                  { id: 'overdue', label: 'Vadesi Geçmiş Açıklar' },
                  { id: 'with_open_cheques', label: 'Açık Çeki Olan Cariler' },
                  { id: 'all', label: 'Tüm Cariler (Kapalılar Dahil)' },
                ] as { id: OpenAccountFilterMode; label: string }[]
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setOpenAccountMode(chip.id)}
                  className={`min-h-[34px] px-3 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                    openAccountMode === chip.id
                      ? 'bg-[#0B2239] text-white'
                      : 'bg-white border border-[#DCE3EC] text-[#4E5D6C] hover:text-[#0B2239]'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {reportMode === 'invoices' && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#DCE3EC]">
              <select
                value={invoiceScope}
                onChange={(e) => setInvoiceScope(e.target.value as InvoiceScopeFilter)}
                className="min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-semibold text-[#0B2239]"
              >
                <option value="invoices_only">Sadece Faturalar (Alış &amp; Satış)</option>
                <option value="satis_faturasi">Satış / Hakediş Faturaları</option>
                <option value="alis_faturasi">Alış Faturaları</option>
                <option value="gider">Genel Giderler</option>
                <option value="cash_flow">Tahsilat &amp; Ödemeler</option>
                <option value="all">Tüm Muhasebe Hareketleri</option>
              </select>

              <select
                value={invoiceOpenFilter}
                onChange={(e) =>
                  setInvoiceOpenFilter(e.target.value as InvoiceOpenFilter)
                }
                className="min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-semibold text-[#0B2239]"
              >
                <option value="all">Tüm Ödeme Durumları</option>
                <option value="open_only">Sadece Açık Faturalar (Bekleyen/Kısmi)</option>
                <option value="overdue">Vadesi Geçmiş Açık Faturalar</option>
                <option value="paid">Ödenmiş / Kapanmış</option>
                <option value="cancelled">İptal Edilenler</option>
              </select>

              <select
                value={invoiceMethodFilter}
                onChange={(e) =>
                  setInvoiceMethodFilter(
                    e.target.value as 'all' | AccountingPaymentMethod
                  )
                }
                className="min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-medium text-[#0B2239]"
              >
                <option value="all">Tüm Ödeme Yöntemleri</option>
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
          )}

          {reportMode === 'cheques' && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#DCE3EC]">
              <select
                value={chequeDirection}
                onChange={(e) =>
                  setChequeDirection(
                    e.target.value as 'all' | AccountingChequeDirection
                  )
                }
                className="min-h-[38px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs font-semibold text-[#0B2239]"
              >
                <option value="all">Tüm Çekler (Alınan &amp; Verilen)</option>
                <option value="alinan">Alınan Çekler (Müşteri)</option>
                <option value="verilen">Verilen Çekler (Firma)</option>
              </select>

              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: 'Tümü' },
                    { id: 'open_only', label: 'Açık / Portföyde & Tahsilde' },
                    { id: 'overdue_or_7days', label: 'Vadesi Geçmiş & 7 Gün İçinde' },
                    { id: 'settled', label: 'Tahsil Edilen / Ödenen' },
                    { id: 'endorsed', label: 'Ciro Edilen' },
                    { id: 'bounced_returned', label: 'Karşılıksız / İade' },
                  ] as { id: ChequeReportStatusScope; label: string }[]
                ).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setChequeScope(chip.id)}
                    className={`min-h-[34px] px-3 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                      chequeScope === chip.id
                        ? 'bg-[#0B2239] text-white'
                        : 'bg-white border border-[#DCE3EC] text-[#4E5D6C] hover:text-[#0B2239]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {reportMode === 'tax_summary' && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#DCE3EC]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-[#4E5D6C]">
                  Kurumlar Vergisi Oranı:
                </span>
                {[25, 20, 23].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setCorpTaxRate(rate)}
                    className={`min-h-[34px] px-3 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                      corpTaxRate === rate
                        ? 'bg-[#0B2239] text-white'
                        : 'bg-white border border-[#DCE3EC] text-[#4E5D6C] hover:text-[#0B2239]'
                    }`}
                  >
                    %{rate}
                    {rate === 25 ? ' (Standart)' : rate === 20 ? ' (İmalat/İhracat)' : ''}
                  </button>
                ))}
                <div className="inline-flex items-center gap-1 bg-white border border-[#DCE3EC] rounded-lg px-2 py-1">
                  <span className="text-[11px] text-[#4E5D6C]">Özel %:</span>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    value={corpTaxRate}
                    onChange={(e) =>
                      setCorpTaxRate(
                        Math.max(0, Math.min(50, Number(e.target.value) || 0))
                      )
                    }
                    className="w-14 text-xs font-mono font-bold text-[#0B2239] focus:outline-none text-right"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B2239] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeGeneralExpensesInTax}
                  onChange={(e) => setIncludeGeneralExpensesInTax(e.target.checked)}
                  className="w-4 h-4 accent-[#0066B3]"
                />
                <span>Genel Giderleri de İndirilecek KDV &amp; Maliyete Dahil Et</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {pdfError && (
        <div
          role="alert"
          className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium"
        >
          {pdfError}
        </div>
      )}

      {/* RAPOR 1: AÇIK CARİLER & YAŞLANDIRMA */}
      {reportMode === 'open_accounts' && (
        <div className="space-y-4">
          <section className="bg-white border border-[#DCE3EC] rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#DCE3EC]">
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Toplam Açık Alacak</div>
              <div className="mt-1 text-base font-bold font-mono text-[#007A53] tabular-nums">
                {formatCurrencyBucketsCompact(openAccountTotals.receivable)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Açık Alınan Çek: {formatCurrencyBucketsCompact(openAccountTotals.incomingCheques)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Toplam Açık Borç</div>
              <div className="mt-1 text-base font-bold font-mono text-red-700 tabular-nums">
                {formatCurrencyBucketsCompact(openAccountTotals.payable)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Açık Verilen Çek: {formatCurrencyBucketsCompact(openAccountTotals.outgoingCheques)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Net Açık Pozisyon</div>
              <div className="mt-1 text-base font-bold font-mono text-[#0B2239] tabular-nums">
                {formatCurrencyBucketsCompact(openAccountTotals.netPosition)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Alacak − Borç (listelenen {openAccountRows.length} cari)
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Gecikmiş Vadesi Olan Cari</div>
              <div
                className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
                  openAccountTotals.overdueCompanies > 0
                    ? 'text-red-700'
                    : 'text-[#0B2239]'
                }`}
              >
                {openAccountTotals.overdueCompanies}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Vadesi geçmiş fatura veya çek bulunan cariler
              </div>
            </div>
          </section>

          <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
            {openAccountRows.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Building2 className="w-8 h-8 text-[#868686] mx-auto" />
                <h4 className="font-display text-sm font-bold text-[#0B2239]">
                  Seçilen Kriterlere Uygun Cari Kayıt Bulunamadı
                </h4>
                <p className="text-xs text-[#4E5D6C] max-w-md mx-auto">
                  Açık bakiyesi olmayan carileri de görmek için &ldquo;Tüm Cariler (Kapalılar Dahil)&rdquo; filtresini seçebilirsiniz.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0B2239] text-slate-200 border-b border-[#DCE3EC] font-semibold">
                      <th className="py-3 px-4">Cari Firma</th>
                      <th className="py-3 px-4 text-center">Birim</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Açık Alacak</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Açık Borç</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Açık Alınan Çek</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Açık Verilen Çek</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Net Açık Bakiye</th>
                      <th className="py-3 px-4 whitespace-nowrap">Vade / Risk</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Detay Gör</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE3EC]">
                    {openAccountRows.map((row) => {
                      const activeCurs = CURRENCIES.filter((c) => {
                        const s = row.byCurrency[c];
                        return (
                          s.openReceivable > 0 ||
                          s.openPayable > 0 ||
                          s.openIncomingCheque > 0 ||
                          s.openOutgoingCheque > 0 ||
                          s.salesTotal > 0 ||
                          s.purchaseTotal > 0
                        );
                      });
                      const displayCurs =
                        activeCurs.length > 0 ? activeCurs : (['TRY'] as CurrencyCode[]);
                      return (
                        <tr key={row.key} className="hover:bg-[#F3F6FA]/60">
                          <td className="py-3.5 px-4 align-top">
                            <div className="font-bold text-[#0B2239]">
                              {row.companyName}
                            </div>
                            <div className="text-[11px] text-[#4E5D6C] mt-0.5">
                              {row.companyObj
                                ? ACCOUNTING_COMPANY_TYPE_LABELS[row.companyObj.companyType]
                                : 'İşlemden Oluşan Cari'}
                              {' · '}
                              {row.entryCount} fatura/işlem · {row.chequeCount} çek
                            </div>
                          </td>
                          <td className="py-3.5 px-4 align-top text-center font-mono font-semibold text-[#4E5D6C]">
                            {displayCurs.map((c) => (
                              <div key={c}>{c}</div>
                            ))}
                          </td>
                          <td className="py-3.5 px-4 align-top text-right font-mono tabular-nums text-[#007A53] font-semibold whitespace-nowrap">
                            {displayCurs.map((c) => (
                              <div key={c}>
                                {formatCurrency(row.byCurrency[c].openReceivable, c)}
                              </div>
                            ))}
                          </td>
                          <td className="py-3.5 px-4 align-top text-right font-mono tabular-nums text-red-700 font-semibold whitespace-nowrap">
                            {displayCurs.map((c) => (
                              <div key={c}>
                                {formatCurrency(row.byCurrency[c].openPayable, c)}
                              </div>
                            ))}
                          </td>
                          <td className="py-3.5 px-4 align-top text-right font-mono tabular-nums text-[#0066B3] whitespace-nowrap">
                            {displayCurs.map((c) => (
                              <div key={c}>
                                {formatCurrency(row.byCurrency[c].openIncomingCheque, c)}
                              </div>
                            ))}
                          </td>
                          <td className="py-3.5 px-4 align-top text-right font-mono tabular-nums text-amber-800 whitespace-nowrap">
                            {displayCurs.map((c) => (
                              <div key={c}>
                                {formatCurrency(row.byCurrency[c].openOutgoingCheque, c)}
                              </div>
                            ))}
                          </td>
                          <td className="py-3.5 px-4 align-top text-right font-mono font-bold tabular-nums whitespace-nowrap">
                            {displayCurs.map((c) => (
                              <div
                                key={c}
                                className={
                                  row.byCurrency[c].netOpen >= 0
                                    ? 'text-[#007A53]'
                                    : 'text-red-700'
                                }
                              >
                                {formatCurrency(row.byCurrency[c].netOpen, c)}
                              </div>
                            ))}
                          </td>
                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            {row.overdueCount > 0 ? (
                              <div className="inline-flex items-center gap-1 text-red-700 font-bold">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>{row.overdueCount} gecikmiş</span>
                              </div>
                            ) : row.earliestOpenDueDate ? (
                              <div className="text-[#4E5D6C] font-mono">
                                Vade: {formatTurkishDate(row.earliestOpenDueDate)}
                              </div>
                            ) : (
                              <span className="text-[#868686]">Kapalı</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onInspectCompanyInEntries(row.companyName)}
                                className="min-h-[34px] px-2.5 border border-[#DCE3EC] bg-white hover:bg-[#F3F6FA] text-[#0B2239] font-semibold rounded-md cursor-pointer"
                              >
                                Faturaları
                              </button>
                              <button
                                type="button"
                                onClick={() => onInspectCompanyInCheques(row.companyName)}
                                className="min-h-[34px] px-2.5 border border-[#DCE3EC] bg-white hover:bg-[#F3F6FA] text-[#0B2239] font-semibold rounded-md cursor-pointer"
                              >
                                Çekleri
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* RAPOR 2: FATURALAR & MUHASEBE HAREKETLERİ */}
      {reportMode === 'invoices' && (
        <div className="space-y-4">
          <section className="bg-white border border-[#DCE3EC] rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#DCE3EC]">
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">KDV Hariç Matrah</div>
              <div className="mt-1 text-base font-bold font-mono text-[#0B2239] tabular-nums">
                {formatCurrencyBucketsCompact(invoiceTotals.subtotal)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Listelenen {reportInvoices.length} belge
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Toplam KDV</div>
              <div className="mt-1 text-base font-bold font-mono text-[#0066B3] tabular-nums">
                {formatCurrencyBucketsCompact(invoiceTotals.vat)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Genel Toplam: {formatCurrencyBucketsCompact(invoiceTotals.total)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Ödenen / Tahsil Edilen</div>
              <div className="mt-1 text-base font-bold font-mono text-[#007A53] tabular-nums">
                {formatCurrencyBucketsCompact(invoiceTotals.paid)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                İptal edilmeyen kayıtlar toplamı
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Kalan Açık Fatura Bakiyesi</div>
              <div className="mt-1 text-base font-bold font-mono text-amber-700 tabular-nums">
                {formatCurrencyBucketsCompact(invoiceTotals.openRemaining)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                {invoiceTotals.overdueCount > 0
                  ? `${invoiceTotals.overdueCount} belgenin vadesi geçmiş`
                  : 'Vadesi geçmiş açık belge yok'}
              </div>
            </div>
          </section>

          <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
            {reportInvoices.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Receipt className="w-8 h-8 text-[#868686] mx-auto" />
                <h4 className="font-display text-sm font-bold text-[#0B2239]">
                  Seçilen Filtrelere Uygun Fatura / Hareket Bulunamadı
                </h4>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0B2239] text-slate-200 border-b border-[#DCE3EC] font-semibold">
                      <th className="py-3 px-4 whitespace-nowrap">Tarih / Belge No</th>
                      <th className="py-3 px-4">Tür &amp; Cari Firma</th>
                      <th className="py-3 px-4">Açıklama</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">KDV Hariç</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">KDV</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Genel Toplam</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Kalan Açık</th>
                      <th className="py-3 px-4 whitespace-nowrap">Vade / Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE3EC]">
                    {reportInvoices.map((e) => {
                      const remaining =
                        e.paymentStatus === 'odendi' || e.paymentStatus === 'iptal'
                          ? 0
                          : Math.max(0, e.totalAmount - (e.paidAmount || 0));
                      const isOverdue =
                        remaining > 0 && Boolean(e.dueDate && e.dueDate < todayStr);
                      return (
                        <tr
                          key={e.id}
                          onClick={() => onViewEntry(e)}
                          className="hover:bg-[#F3F6FA]/70 cursor-pointer transition-colors"
                        >
                          <td className="py-3.5 px-4 align-top font-mono tabular-nums whitespace-nowrap">
                            <div className="font-semibold text-[#0B2239]">
                              {formatTurkishDate(e.entryDate)}
                            </div>
                            <div className="text-[11px] text-[#4E5D6C]">
                              {e.invoiceNo || 'Belge No Yok'}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 align-top max-w-[210px]">
                            <div className="font-semibold text-[#0066B3]">
                              {ACCOUNTING_ENTRY_TYPE_LABELS[e.entryType]}
                            </div>
                            <div
                              className="font-bold text-[#0B2239] truncate mt-0.5"
                              title={e.companyName}
                            >
                              {e.companyName}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 align-top max-w-xs">
                            <div className="font-medium text-[#0B2239]">{e.title}</div>
                            {e.tenderTrackingCode && (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  if (e.tenderId) onSelectTenderId(e.tenderId);
                                }}
                                className="text-[11px] font-mono font-semibold text-[#0066B3] hover:underline mt-0.5 cursor-pointer"
                              >
                                {e.tenderTrackingCode}
                              </button>
                            )}
                          </td>
                          <td className="py-3.5 px-4 align-top text-right font-mono tabular-nums whitespace-nowrap text-[#4E5D6C]">
                            {formatCurrency(e.subtotalAmount || 0, e.currency)}
                          </td>
                          <td className="py-3.5 px-4 align-top text-right font-mono tabular-nums whitespace-nowrap text-[#4E5D6C]">
                            {formatCurrency(e.vatAmount || 0, e.currency)}
                          </td>
                          <td className="py-3.5 px-4 align-top text-right font-mono font-bold tabular-nums whitespace-nowrap text-[#0B2239]">
                            {formatCurrency(e.totalAmount, e.currency)}
                          </td>
                          <td
                            className={`py-3.5 px-4 align-top text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                              remaining > 0 ? 'text-amber-700' : 'text-[#007A53]'
                            }`}
                          >
                            {formatCurrency(remaining, e.currency)}
                          </td>
                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            <div
                              className={`font-semibold ${
                                e.paymentStatus === 'odendi'
                                  ? 'text-[#007A53]'
                                  : isOverdue
                                  ? 'text-red-700'
                                  : e.paymentStatus === 'iptal'
                                  ? 'text-[#868686]'
                                  : 'text-amber-700'
                              }`}
                            >
                              {ACCOUNTING_PAYMENT_STATUS_LABELS[e.paymentStatus]}
                            </div>
                            {e.dueDate && (
                              <div
                                className={`text-[11px] font-mono mt-0.5 ${
                                  isOverdue ? 'text-red-700 font-bold' : 'text-[#4E5D6C]'
                                }`}
                              >
                                {isOverdue
                                  ? `Gecikmiş (${Math.abs(diffDays(todayStr, e.dueDate))} gün)`
                                  : `Vade: ${formatTurkishDate(e.dueDate)}`}
                              </div>
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
        </div>
      )}

      {/* RAPOR 3: ÇEK PORTFÖYÜ & VADE RAPORU */}
      {reportMode === 'cheques' && (
        <div className="space-y-4">
          <section className="bg-white border border-[#DCE3EC] rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#DCE3EC]">
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Açık Alınan Çekler</div>
              <div className="mt-1 text-base font-bold font-mono text-[#007A53] tabular-nums">
                {formatCurrencyBucketsCompact(chequeTotals.incomingOpen)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Portföyde ve bankada tahsilde
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Açık Verilen Çekler</div>
              <div className="mt-1 text-base font-bold font-mono text-amber-800 tabular-nums">
                {formatCurrencyBucketsCompact(chequeTotals.outgoingOpen)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Vadesi beklenen firma çekleri
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Tahsil Edilen / Ödenen</div>
              <div className="mt-1 text-base font-bold font-mono text-[#0066B3] tabular-nums">
                {formatCurrencyBucketsCompact(chequeTotals.settled)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Listelenen {reportCheques.length} çek toplamı:{' '}
                {formatCurrencyBucketsCompact(chequeTotals.totalAll)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Vadesi Geçmiş / Karşılıksız</div>
              <div
                className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
                  chequeTotals.overdueOrBouncedCount > 0
                    ? 'text-red-700'
                    : 'text-[#0B2239]'
                }`}
              >
                {chequeTotals.overdueOrBouncedCount}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Takip ve aksiyon gerektiren çek
              </div>
            </div>
          </section>

          <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
            {reportCheques.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Landmark className="w-8 h-8 text-[#868686] mx-auto" />
                <h4 className="font-display text-sm font-bold text-[#0B2239]">
                  Seçilen Filtrelere Uygun Çek Kaydı Bulunamadı
                </h4>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0B2239] text-slate-200 border-b border-[#DCE3EC] font-semibold">
                      <th className="py-3 px-4 whitespace-nowrap">Vade &amp; Kalan Gün</th>
                      <th className="py-3 px-4">Yön &amp; Çek No</th>
                      <th className="py-3 px-4">Banka / Şube</th>
                      <th className="py-3 px-4">Cari Firma &amp; Keşideci/Ciro</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">Tutar</th>
                      <th className="py-3 px-4 whitespace-nowrap">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE3EC]">
                    {reportCheques.map((ch) => {
                      const isOpen =
                        ch.status === 'portfoyde' || ch.status === 'tahsile_verildi';
                      const daysLeft = ch.dueDate ? diffDays(todayStr, ch.dueDate) : 0;
                      const isOverdue = isOpen && Boolean(ch.dueDate && ch.dueDate < todayStr);
                      return (
                        <tr
                          key={ch.id}
                          onClick={() => onViewCheque(ch)}
                          className="hover:bg-[#F3F6FA]/70 cursor-pointer transition-colors"
                        >
                          <td className="py-3.5 px-4 align-top font-mono tabular-nums whitespace-nowrap">
                            <div className="font-bold text-[#0B2239]">
                              {formatTurkishDate(ch.dueDate)}
                            </div>
                            {isOpen && (
                              <div
                                className={`text-[11px] mt-0.5 font-semibold ${
                                  isOverdue
                                    ? 'text-red-700'
                                    : daysLeft <= 7
                                    ? 'text-amber-700'
                                    : 'text-[#4E5D6C]'
                                }`}
                              >
                                {isOverdue
                                  ? `${Math.abs(daysLeft)} gün gecikti`
                                  : daysLeft === 0
                                  ? 'Vadesi bugün'
                                  : `${daysLeft} gün kaldı`}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            <div
                              className={`font-semibold ${
                                ch.direction === 'alinan'
                                  ? 'text-[#007A53]'
                                  : 'text-[#0066B3]'
                              }`}
                            >
                              {ch.direction === 'alinan' ? 'Alınan Çek' : 'Verilen Çek'}
                            </div>
                            <div className="font-mono font-bold text-[#0B2239] mt-0.5">
                              {ch.chequeNo}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 align-top">
                            <div className="font-semibold text-[#0B2239]">
                              {ch.bankName}
                            </div>
                            {ch.branchName && (
                              <div className="text-[11px] text-[#4E5D6C]">
                                {ch.branchName}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 align-top max-w-xs">
                            <div className="font-bold text-[#0B2239]">
                              {ch.companyName}
                            </div>
                            <div className="text-[11px] text-[#4E5D6C] mt-0.5 flex flex-wrap items-center gap-x-1.5">
                              {ch.endorsedTo ? (
                                <span>Ciro: {ch.endorsedTo}</span>
                              ) : ch.drawerName ? (
                                <span>Keşideci: {ch.drawerName}</span>
                              ) : null}
                              {ch.tenderTrackingCode && (
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    if (ch.tenderId) onSelectTenderId(ch.tenderId);
                                  }}
                                  className="font-mono font-semibold text-[#0066B3] hover:underline cursor-pointer"
                                >
                                  · {ch.tenderTrackingCode}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 align-top text-right font-mono font-bold tabular-nums whitespace-nowrap text-[#0B2239]">
                            {formatCurrency(ch.amount, ch.currency)}
                          </td>
                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            <span
                              className={`font-semibold ${
                                ch.status === 'tahsil_edildi' || ch.status === 'odendi'
                                  ? 'text-[#007A53]'
                                  : ch.status === 'karsiliksiz'
                                  ? 'text-red-700'
                                  : ch.status === 'iade'
                                  ? 'text-[#868686]'
                                  : ch.status === 'ciro_edildi'
                                  ? 'text-[#0066B3]'
                                  : 'text-amber-700'
                              }`}
                            >
                              {ACCOUNTING_CHEQUE_STATUS_LABELS[ch.status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* RAPOR 4: KDV & KURUMLAR VERGİSİ RAPORU */}
      {reportMode === 'tax_summary' && (
        <div className="space-y-4">
          {/* 4 Ana Vergi KPI Kartı */}
          <section className="bg-white border border-[#DCE3EC] rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#DCE3EC]">
            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">Hesaplanan KDV (Satış)</div>
              <div className="mt-1 text-base font-bold font-mono text-[#0066B3] tabular-nums">
                {formatCurrencyBucketsCompact(taxSummary.outputVatBuckets)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Satış Matrahı:{' '}
                {formatCurrencyBucketsCompact(taxSummary.salesSubtotalBuckets)}
              </div>
            </div>

            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">
                İndirilecek KDV (Alış{includeGeneralExpensesInTax ? ' & Gider' : ''})
              </div>
              <div className="mt-1 text-base font-bold font-mono text-[#007A53] tabular-nums">
                {formatCurrencyBucketsCompact(taxSummary.inputVatBuckets)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Maliyet Matrahı:{' '}
                {formatCurrencyBucketsCompact(taxSummary.purchaseSubtotalBuckets)}
              </div>
            </div>

            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">
                Net KDV Farkı (Hesaplanan − İndirilecek)
              </div>
              <div
                className={`mt-1 text-base font-bold font-mono tabular-nums ${
                  CURRENCIES.some((c) => taxSummary.netVatBuckets[c] > 0.001)
                    ? 'text-amber-700'
                    : 'text-[#007A53]'
                }`}
              >
                {formatCurrencyBucketsCompact(taxSummary.netVatBuckets)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Pozitif değer Ödenecek KDV, negatif değer Devreden KDV&apos;dir
              </div>
            </div>

            <div className="p-4">
              <div className="text-xs text-[#4E5D6C]">
                Tahmini Kurumlar Vergisi (%{taxSummary.safeRate})
              </div>
              <div className="mt-1 text-base font-bold font-mono text-red-700 tabular-nums">
                {formatCurrencyBucketsCompact(taxSummary.corpTaxBuckets)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#4E5D6C]">
                Vergi Matrahı:{' '}
                {formatCurrencyBucketsCompact(taxSummary.taxBaseBuckets)}
              </div>
            </div>
          </section>

          {/* Döviz Bazlı KDV & Kurumlar Vergisi İcmal Tablosu */}
          <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-[#F3F6FA]/70 border-b border-[#DCE3EC] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="font-display text-xs font-bold text-[#0B2239]">
                Döviz Bazlı KDV ve Kurumlar Vergisi İcmali ({taxRelevantEntries.length} belge)
              </h4>
              <span className="text-[11px] text-[#4E5D6C]">
                Kurumlar Vergisi Oranı: <strong className="font-mono">%{taxSummary.safeRate}</strong>
              </span>
            </div>

            {taxSummary.activeCurrencyRows.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Percent className="w-8 h-8 text-[#868686] mx-auto" />
                <h4 className="font-display text-sm font-bold text-[#0B2239]">
                  Seçilen Filtrelerde Vergi Hesabına Esas Belge Bulunamadı
                </h4>
                <p className="text-xs text-[#4E5D6C] max-w-md mx-auto">
                  Alış faturası, satış faturası veya genel gider kaydı eklendikçe KDV ve Kurumlar Vergisi özetleri burada otomatik hesaplanır.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0B2239] text-slate-200 border-b border-[#DCE3EC] font-semibold">
                      <th className="py-3 px-4 text-center">Birim</th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">
                        Satış Matrahı (KDV Hariç)
                      </th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">
                        Hesaplanan KDV
                      </th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">
                        Alış/Gider Matrahı
                      </th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">
                        İndirilecek KDV
                      </th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">
                        Ödenecek / Devreden KDV
                      </th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">
                        Ticari Kâr (Vergi Matrahı)
                      </th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">
                        Kurumlar Vergisi (%{taxSummary.safeRate})
                      </th>
                      <th className="py-3 px-4 text-right whitespace-nowrap">
                        Vergi Sonrası Net Kâr
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE3EC] font-mono tabular-nums">
                    {taxSummary.activeCurrencyRows.map((row) => {
                      const isPayableVat = row.netVat >= 0;
                      return (
                        <tr key={row.currency} className="hover:bg-[#F3F6FA]/60">
                          <td className="py-3.5 px-4 text-center font-bold text-[#0B2239]">
                            {row.currency}
                          </td>
                          <td className="py-3.5 px-4 text-right text-[#0B2239] whitespace-nowrap">
                            <div>{formatCurrency(row.salesSubtotal, row.currency)}</div>
                            <div className="text-[10px] font-sans text-[#4E5D6C]">
                              {row.salesCount} satış faturası
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-[#0066B3] whitespace-nowrap">
                            {formatCurrency(row.outputVat, row.currency)}
                          </td>
                          <td className="py-3.5 px-4 text-right text-[#0B2239] whitespace-nowrap">
                            <div>{formatCurrency(row.purchaseSubtotal, row.currency)}</div>
                            <div className="text-[10px] font-sans text-[#4E5D6C]">
                              {row.purchaseCount} alış/gider
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-[#007A53] whitespace-nowrap">
                            {formatCurrency(row.inputVat, row.currency)}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div
                              className={`font-bold ${
                                isPayableVat ? 'text-amber-700' : 'text-[#007A53]'
                              }`}
                            >
                              {formatCurrency(Math.abs(row.netVat), row.currency)}
                            </div>
                            <div className="text-[10px] font-sans text-[#4E5D6C]">
                              {isPayableVat
                                ? 'Ödenecek KDV'
                                : 'Sonraki Döneme Devreden KDV'}
                            </div>
                          </td>
                          <td
                            className={`py-3.5 px-4 text-right font-semibold whitespace-nowrap ${
                              row.taxBase >= 0 ? 'text-[#0B2239]' : 'text-red-700'
                            }`}
                          >
                            {formatCurrency(row.taxBase, row.currency)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-red-700 whitespace-nowrap">
                            {formatCurrency(row.estimatedCorpTax, row.currency)}
                          </td>
                          <td
                            className={`py-3.5 px-4 text-right font-bold whitespace-nowrap ${
                              row.netProfitAfterTax >= 0 ? 'text-[#007A53]' : 'text-red-700'
                            }`}
                          >
                            {formatCurrency(row.netProfitAfterTax, row.currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* KDV Oranı Bazlı Kırılım + Dayanak Belge Özeti */}
          {taxSummary.vatRateRows.length > 0 && (
            <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#F3F6FA]/70 border-b border-[#DCE3EC]">
                <h4 className="font-display text-xs font-bold text-[#0B2239]">
                  KDV Oranı Bazlı Dağılım (%20, %10, %1, %0)
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#DCE3EC] text-[11px] font-semibold text-[#4E5D6C]">
                      <th className="py-2.5 px-4">KDV Oranı &amp; Birim</th>
                      <th className="py-2.5 px-4 text-center">Belge</th>
                      <th className="py-2.5 px-4 text-right">Satış Matrahı</th>
                      <th className="py-2.5 px-4 text-right">Hesaplanan KDV</th>
                      <th className="py-2.5 px-4 text-right">Alış/Gider Matrahı</th>
                      <th className="py-2.5 px-4 text-right">İndirilecek KDV</th>
                      <th className="py-2.5 px-4 text-right">Oran Net KDV Farkı</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE3EC] font-mono tabular-nums">
                    {taxSummary.vatRateRows.map((vr) => (
                      <tr key={vr.key} className="hover:bg-[#F3F6FA]/60">
                        <td className="py-2.5 px-4 font-bold text-[#0B2239]">
                          %{vr.vatRate} KDV · {vr.currency}
                        </td>
                        <td className="py-2.5 px-4 text-center text-[#4E5D6C]">
                          {vr.docCount}
                        </td>
                        <td className="py-2.5 px-4 text-right text-[#0B2239]">
                          {formatCurrency(vr.salesSubtotal, vr.currency)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-[#0066B3] font-semibold">
                          {formatCurrency(vr.outputVat, vr.currency)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-[#0B2239]">
                          {formatCurrency(vr.purchaseSubtotal, vr.currency)}
                        </td>
                        <td className="py-2.5 px-4 text-right text-[#007A53] font-semibold">
                          {formatCurrency(vr.inputVat, vr.currency)}
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-bold ${
                            vr.netVat >= 0 ? 'text-amber-700' : 'text-[#007A53]'
                          }`}
                        >
                          {formatCurrency(vr.netVat, vr.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Dayanak Faturalar Listesi */}
          {taxRelevantEntries.length > 0 && (
            <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#F3F6FA]/70 border-b border-[#DCE3EC] flex items-center justify-between gap-2">
                <h4 className="font-display text-xs font-bold text-[#0B2239]">
                  Hesaplamaya Dahil Edilen Faturalar &amp; Giderler ({taxRelevantEntries.length})
                </h4>
                <span className="text-[11px] text-[#4E5D6C]">
                  Detay için satıra tıklayın
                </span>
              </div>
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-white border-b border-[#DCE3EC]">
                    <tr className="text-[11px] font-semibold text-[#4E5D6C]">
                      <th className="py-2.5 px-4">Tarih / Fatura No</th>
                      <th className="py-2.5 px-4">Tür &amp; Cari Firma</th>
                      <th className="py-2.5 px-4">Açıklama</th>
                      <th className="py-2.5 px-4 text-right">Matrah (KDV Hariç)</th>
                      <th className="py-2.5 px-4 text-right">KDV % / Tutar</th>
                      <th className="py-2.5 px-4 text-right">Genel Toplam</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE3EC]">
                    {taxRelevantEntries.map((e) => (
                      <tr
                        key={e.id}
                        onClick={() => onViewEntry(e)}
                        className="hover:bg-[#F3F6FA]/70 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-4 font-mono tabular-nums whitespace-nowrap">
                          <div className="font-semibold text-[#0B2239]">
                            {formatTurkishDate(e.entryDate)}
                          </div>
                          <div className="text-[11px] text-[#4E5D6C]">
                            {e.invoiceNo || '—'}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 max-w-[220px]">
                          <div
                            className={`font-semibold ${
                              e.entryType === 'satis_faturasi'
                                ? 'text-[#0066B3]'
                                : 'text-[#007A53]'
                            }`}
                          >
                            {e.entryType === 'satis_faturasi'
                              ? 'Hesaplanan KDV (Satış)'
                              : 'İndirilecek KDV (Alış/Gider)'}
                          </div>
                          <div className="font-bold text-[#0B2239] truncate">
                            {e.companyName}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-[#0B2239] max-w-xs truncate">
                          {e.title}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#4E5D6C] whitespace-nowrap">
                          {formatCurrency(e.subtotalAmount || 0, e.currency)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="text-[#4E5D6C] mr-1.5">%{e.vatRate}</span>
                          <span className="font-bold text-[#0B2239]">
                            {formatCurrency(e.vatAmount || 0, e.currency)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums text-[#0B2239] whitespace-nowrap">
                          {formatCurrency(e.totalAmount, e.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="p-3.5 bg-[#F3F6FA]/80 border border-[#DCE3EC] rounded-xl text-[11px] text-[#4E5D6C] leading-relaxed">
            <strong>Bilgilendirme:</strong> KDV ve Kurumlar Vergisi tutarları, seçili tarih ve filtre aralığındaki iptal edilmemiş Ön Muhasebe fatura ve gider kayıtlarından otomatik hesaplanan yönetsel ön izlemedir. Resmi KDV / Kurumlar Vergisi beyannameleri öncesinde önceki dönemden devreden KDV, kanunen kabul edilmeyen giderler (KKEG) ve amortisman kayıtları mali müşavir tarafından dikkate alınmalıdır.
          </div>
        </div>
      )}
    </div>
  );
};
