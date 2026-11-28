import React, { useMemo, useState } from 'react';
import {
  Briefcase,
  Award,
  Plus,
  Search,
  Download,
  Lock,
  UserCheck,
  ExternalLink,
  CheckCircle2,
  Edit3,
  Trash2,
  BarChart3,
  LayoutGrid,
  List,
} from 'lucide-react';
import {
  ACCOUNTING_PAYMENT_STATUS_LABELS,
  CurrencyCode,
  formatProjectManagerNames,
  getProjectManagers,
  isOwnRecord,
  isProjectIncomeTx,
  isProjectManager,
  Project,
  PROJECT_STATUS_LABELS,
  PROJECT_TX_TYPE_LABELS,
  ProjectStatus,
  ProjectTransaction,
  ProjectTransactionType,
  SalesQuote,
  Tender,
} from '../types/tender';
import { formatCurrency, formatTurkishDate, getTodayDateStr } from '../lib/trackingAndCalendar';

interface ProjectsViewProps {
  currentUid: string;
  projects: Project[];
  transactions: ProjectTransaction[];
  tenders: Tender[];
  salesQuotes?: SalesQuote[];
  canCreateProject: boolean;
  onNewProject: (defaultTenderId?: string) => void;
  onNewProjectFromQuote?: (quoteId: string) => void;
  onViewProject: (project: Project) => void;
  onEditProject: (project: Project) => void;
  onNewTransaction: (projectId: string, txType?: ProjectTransactionType) => void;
  onEditTransaction: (tx: ProjectTransaction) => void;
  onMarkTransactionPaid: (tx: ProjectTransaction) => Promise<void>;
  onDeleteTransaction: (project: Project, tx: ProjectTransaction) => Promise<void>;
  onSelectTenderId: (tenderId: string) => void;
  onSelectQuoteId?: (quoteId: string) => void;
}

type ProjectsTab = 'cost_accounting' | 'cards' | 'ledger';

interface ProjectFinancialSummary {
  project: Project;
  isManager: boolean;
  txCount: number;
  byCurrency: Record<
    CurrencyCode,
    {
      income: number;
      incomingInvoices: number;
      expenses: number;
      totalCost: number;
      netProfit: number;
    }
  >;
}

const CURRENCIES: CurrencyCode[] = ['TRY', 'USD', 'EUR'];

function emptyCurrencyBuckets() {
  return {
    TRY: { income: 0, incomingInvoices: 0, expenses: 0, totalCost: 0, netProfit: 0 },
    USD: { income: 0, incomingInvoices: 0, expenses: 0, totalCost: 0, netProfit: 0 },
    EUR: { income: 0, incomingInvoices: 0, expenses: 0, totalCost: 0, netProfit: 0 },
  };
}

function escapeCsvCell(val: string | number): string {
  const s = String(val ?? '');
  return `"${s.replace(/"/g, '""')}"`;
}

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  currentUid,
  projects,
  transactions,
  tenders,
  salesQuotes = [],
  canCreateProject,
  onNewProject,
  onNewProjectFromQuote,
  onViewProject,
  onEditProject,
  onNewTransaction,
  onEditTransaction,
  onMarkTransactionPaid,
  onDeleteTransaction,
  onSelectTenderId,
  onSelectQuoteId,
}) => {
  const [activeTab, setActiveTab] = useState<ProjectsTab>('cost_accounting');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [onlyManagedByMe, setOnlyManagedByMe] = useState(false);
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'all' | ProjectTransactionType>('all');
  const [confirmDeleteTxId, setConfirmDeleteTxId] = useState<string | null>(null);

  const pendingWonTenders = useMemo(() => {
    const existingTenderIds = new Set(projects.map((p) => p.tenderId).filter(Boolean));
    return tenders.filter(
      (t) => t.status === 'kazanildi' && !existingTenderIds.has(t.id)
    );
  }, [tenders, projects]);

  const pendingApprovedQuotes = useMemo(() => {
    const existingQuoteIds = new Set(
      projects.map((p) => p.quoteId || '').filter(Boolean)
    );
    return salesQuotes.filter(
      (q) =>
        q.status === 'siparis_onaylandi' &&
        !q.linkedProjectId &&
        !existingQuoteIds.has(q.id)
    );
  }, [salesQuotes, projects]);

  const projectSummaries: ProjectFinancialSummary[] = useMemo(() => {
    const txByProject = new Map<string, ProjectTransaction[]>();
    for (const tx of transactions) {
      const list = txByProject.get(tx.projectId) || [];
      list.push(tx);
      txByProject.set(tx.projectId, list);
    }

    return projects.map((project) => {
      const list = txByProject.get(project.id) || [];
      const byCurrency = emptyCurrencyBuckets();

      for (const tx of list) {
        if (tx.paymentStatus === 'iptal') continue;
        const cur: CurrencyCode = tx.currency || 'TRY';
        if (isProjectIncomeTx(tx.txType)) {
          byCurrency[cur].income += tx.totalAmount || 0;
        } else if (tx.txType === 'gelen_fatura') {
          byCurrency[cur].incomingInvoices += tx.totalAmount || 0;
        } else if (tx.txType === 'gider') {
          byCurrency[cur].expenses += tx.totalAmount || 0;
        }
      }

      CURRENCIES.forEach((cur) => {
        byCurrency[cur].totalCost =
          byCurrency[cur].incomingInvoices + byCurrency[cur].expenses;
        byCurrency[cur].netProfit = byCurrency[cur].income - byCurrency[cur].totalCost;
      });

      return {
        project,
        isManager: isProjectManager(project, currentUid),
        txCount: list.filter((t) => t.paymentStatus !== 'iptal').length,
        byCurrency,
      };
    });
  }, [projects, transactions, currentUid]);

  const filteredSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projectSummaries.filter(({ project, isManager }) => {
      if (statusFilter !== 'all' && project.status !== statusFilter) return false;
      if (onlyManagedByMe && !isManager) return false;
      if (!q) return true;
      const managersText = getProjectManagers(project)
        .map((m) => `${m.displayName} ${m.email}`.toLowerCase())
        .join(' ');
      return (
        project.projectCode.toLowerCase().includes(q) ||
        project.title.toLowerCase().includes(q) ||
        project.authority.toLowerCase().includes(q) ||
        project.managerName.toLowerCase().includes(q) ||
        managersText.includes(q) ||
        project.tenderTrackingCode.toLowerCase().includes(q) ||
        (project.quoteNumber || '').toLowerCase().includes(q)
      );
    });
  }, [projectSummaries, search, statusFilter, onlyManagedByMe]);

  const grandTotals = useMemo(() => {
    const totals: Record<
      CurrencyCode,
      {
        contract: number;
        income: number;
        incomingInvoices: number;
        expenses: number;
        totalCost: number;
        netProfit: number;
      }
    > = {
      TRY: { contract: 0, income: 0, incomingInvoices: 0, expenses: 0, totalCost: 0, netProfit: 0 },
      USD: { contract: 0, income: 0, incomingInvoices: 0, expenses: 0, totalCost: 0, netProfit: 0 },
      EUR: { contract: 0, income: 0, incomingInvoices: 0, expenses: 0, totalCost: 0, netProfit: 0 },
    };

    for (const s of filteredSummaries) {
      const cCur: CurrencyCode = s.project.currency || 'TRY';
      totals[cCur].contract += s.project.contractAmount || 0;
      CURRENCIES.forEach((cur) => {
        totals[cur].income += s.byCurrency[cur].income;
        totals[cur].incomingInvoices += s.byCurrency[cur].incomingInvoices;
        totals[cur].expenses += s.byCurrency[cur].expenses;
        totals[cur].totalCost += s.byCurrency[cur].totalCost;
        totals[cur].netProfit += s.byCurrency[cur].netProfit;
      });
    }
    return totals;
  }, [filteredSummaries]);

  const activeCurrencyTotals = useMemo(() => {
    const nonZero = CURRENCIES.filter(
      (c) =>
        grandTotals[c].contract > 0 ||
        grandTotals[c].income > 0 ||
        grandTotals[c].totalCost > 0
    );
    return nonZero.length > 0 ? nonZero : (['TRY'] as CurrencyCode[]);
  }, [grandTotals]);

  const projectMap = useMemo(() => {
    const m = new Map<string, Project>();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const filteredLedger = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (ledgerTypeFilter !== 'all' && tx.txType !== ledgerTypeFilter) return false;
      const parent = projectMap.get(tx.projectId);
      if (onlyManagedByMe && (!parent || !isProjectManager(parent, currentUid))) {
        return false;
      }
      if (!q) return true;
      return (
        tx.title.toLowerCase().includes(q) ||
        tx.companyName.toLowerCase().includes(q) ||
        tx.invoiceNo.toLowerCase().includes(q) ||
        tx.projectTitle.toLowerCase().includes(q) ||
        tx.projectCode.toLowerCase().includes(q)
      );
    });
  }, [transactions, ledgerTypeFilter, onlyManagedByMe, projectMap, currentUid, search]);

  const handleExportCostAccountingCsv = () => {
    const headers = [
      'Proje Kodu',
      'İhale / Teklif No',
      'Proje Adı',
      'Kurum / Müşteri',
      'Proje Yöneticisi',
      'Durum',
      'Para Birimi',
      'Sözleşme Bedeli',
      'Kesilen Faturalar & Gelirler',
      'Gelen Faturalar',
      'Yapılan Giderler',
      'Toplam Maliyet',
      'Net Proje Kârı / Zararı',
      'İşlem Sayısı',
    ];
    const rows = filteredSummaries.map((s) => {
      const cur: CurrencyCode = s.project.currency || 'TRY';
      const b = s.byCurrency[cur];
      return [
        s.project.projectCode,
        s.project.tenderTrackingCode || s.project.quoteNumber || '-',
        s.project.title,
        s.project.authority,
        formatProjectManagerNames(s.project),
        PROJECT_STATUS_LABELS[s.project.status],
        cur,
        s.project.contractAmount.toFixed(2),
        b.income.toFixed(2),
        b.incomingInvoices.toFixed(2),
        b.expenses.toFixed(2),
        b.totalCost.toFixed(2),
        b.netProfit.toFixed(2),
        s.txCount,
      ];
    });
    const csv =
      '\uFEFF' +
      [headers, ...rows].map((r) => r.map(escapeCsvCell).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Genel_Proje_Maliyet_Muhasebesi_${getTodayDateStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportLedgerCsv = () => {
    const headers = [
      'Tarih',
      'Proje Kodu',
      'Proje Adı',
      'İşlem Türü',
      'Kategori',
      'Karşı Firma / Kurum',
      'Belge / Fatura No',
      'Açıklama',
      'KDV Hariç',
      'KDV',
      'Toplam',
      'Para Birimi',
      'Ödeme Durumu',
    ];
    const rows = filteredLedger.map((tx) => [
      tx.txDate,
      tx.projectCode,
      tx.projectTitle,
      PROJECT_TX_TYPE_LABELS[tx.txType],
      tx.category,
      tx.companyName,
      tx.invoiceNo || '-',
      tx.title,
      tx.subtotalAmount.toFixed(2),
      tx.vatAmount.toFixed(2),
      tx.totalAmount.toFixed(2),
      tx.currency,
      ACCOUNTING_PAYMENT_STATUS_LABELS[tx.paymentStatus],
    ]);
    const csv =
      '\uFEFF' +
      [headers, ...rows].map((r) => r.map(escapeCsvCell).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Proje_Fatura_Gider_Defteri_${getTodayDateStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeProjectsCount = projects.filter((p) => p.status === 'aktif').length;
  const managedByMeCount = projects.filter((p) => isProjectManager(p, currentUid)).length;

  return (
    <div className="space-y-6">
      {/* Pending Won Tenders & Approved Private-Sector Orders Prompt */}
      {(pendingWonTenders.length > 0 || pendingApprovedQuotes.length > 0) && (
        <section className="bg-[#0B2239] text-white border border-[#143252] border-b-2 border-b-[#007A53] rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Award className="w-5 h-5 text-[#34D399] shrink-0" />
              <div>
                <h2 className="font-display text-sm font-bold text-white">
                  Proje Başlatmayı Bekleyen Kazanılan İhaleler &amp; Onaylı Siparişler (
                  {pendingWonTenders.length + pendingApprovedQuotes.length})
                </h2>
                <p className="text-xs text-slate-300">
                  Kazanılan ihaleleri veya siparişe dönen özel sektör teklif/proformalarını tek tıkla Proje Yönetimine aktarın.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {pendingWonTenders.map((t) => (
              <div
                key={t.id}
                className="p-3 bg-[#143252] border border-[#1E4063] rounded-lg flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-mono font-semibold text-[#FBBF24]">
                    İHALE · {t.trackingCode} · {formatCurrency(t.estimatedAmount, t.currency)}
                  </div>
                  <div className="text-xs font-semibold text-white truncate">{t.title}</div>
                  <div className="text-[11px] text-slate-300 truncate">{t.authority}</div>
                </div>
                {canCreateProject && (
                  <button
                    type="button"
                    onClick={() => onNewProject(t.id)}
                    className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#006344] text-white text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Proje Başlat</span>
                  </button>
                )}
              </div>
            ))}
            {pendingApprovedQuotes.map((q) => (
              <div
                key={q.id}
                className="p-3 bg-[#143252] border border-[#0066B3]/60 rounded-lg flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-mono font-semibold text-[#7DD3FC]">
                    ÖZEL SEKTÖR SİPARİŞİ · {q.quoteNumber} ·{' '}
                    {formatCurrency(q.grandTotal, q.currency)}
                  </div>
                  <div className="text-xs font-semibold text-white truncate">{q.title}</div>
                  <div className="text-[11px] text-slate-300 truncate">{q.customerName}</div>
                </div>
                {canCreateProject && onNewProjectFromQuote && (
                  <button
                    type="button"
                    onClick={() => onNewProjectFromQuote(q.id)}
                    className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Proje Başlat</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Top KPI Strip */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#DCE3EC]">
        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">Toplam / Aktif Proje</div>
          <div className="mt-1.5 text-2xl font-bold text-[#0B2239] font-mono tabular-nums">
            {projects.length}{' '}
            <span className="text-sm font-normal text-[#007A53]">
              ({activeProjectsCount} aktif)
            </span>
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">
            Sizin yönettiğiniz: <strong>{managedByMeCount}</strong> proje
          </div>
        </div>

        <div className="p-4 sm:p-5 border-l border-[#DCE3EC] lg:border-l-0">
          <div className="text-xs text-[#4E5D6C]">Toplam Proje Geliri</div>
          <div className="mt-1.5 space-y-0.5">
            {activeCurrencyTotals.map((cur) => (
              <div
                key={cur}
                className="text-lg sm:text-xl font-bold text-[#007A53] font-mono tabular-nums"
              >
                +{formatCurrency(grandTotals[cur].income, cur)}
              </div>
            ))}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">Kesilen faturalar &amp; hakedişler</div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">Toplam Proje Maliyeti</div>
          <div className="mt-1.5 space-y-0.5">
            {activeCurrencyTotals.map((cur) => (
              <div
                key={cur}
                className="text-lg sm:text-xl font-bold text-red-700 font-mono tabular-nums"
              >
                -{formatCurrency(grandTotals[cur].totalCost, cur)}
              </div>
            ))}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">Gelen faturalar + yapılan giderler</div>
        </div>

        <div className="p-4 sm:p-5 border-l border-[#DCE3EC] lg:border-l-0">
          <div className="text-xs text-[#4E5D6C]">Genel Net Proje Kârı / Zararı</div>
          <div className="mt-1.5 space-y-0.5">
            {activeCurrencyTotals.map((cur) => (
              <div
                key={cur}
                className={`text-lg sm:text-xl font-bold font-mono tabular-nums ${
                  grandTotals[cur].netProfit >= 0 ? 'text-[#007A53]' : 'text-red-700'
                }`}
              >
                {grandTotals[cur].netProfit >= 0 ? '+' : ''}
                {formatCurrency(grandTotals[cur].netProfit, cur)}
              </div>
            ))}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">Tüm projeler canlı özet</div>
        </div>
      </section>

      {/* Toolbar & Tabs */}
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F3F6FA] rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('cost_accounting')}
              className={`min-h-[38px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                activeTab === 'cost_accounting'
                  ? 'bg-white text-[#0B2239] shadow-xs'
                  : 'text-[#4E5D6C] hover:text-[#0B2239]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#0066B3]" />
              <span>Genel Proje Maliyet Muhasebesi</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cards')}
              className={`min-h-[38px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                activeTab === 'cards'
                  ? 'bg-white text-[#0B2239] shadow-xs'
                  : 'text-[#4E5D6C] hover:text-[#0B2239]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-[#0066B3]" />
              <span>Proje Kartları ({projects.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ledger')}
              className={`min-h-[38px] px-3 py-1.5 inline-flex items-center gap-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                activeTab === 'ledger'
                  ? 'bg-white text-[#0B2239] shadow-xs'
                  : 'text-[#4E5D6C] hover:text-[#0B2239]'
              }`}
            >
              <List className="w-3.5 h-3.5 text-[#0066B3]" />
              <span>Fatura &amp; Gider Defteri ({transactions.length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={
                activeTab === 'ledger' ? handleExportLedgerCsv : handleExportCostAccountingCsv
              }
              className="min-h-[42px] px-3.5 inline-flex items-center gap-1.5 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#0066B3]" />
              <span>CSV İndir</span>
            </button>
            {canCreateProject && (
              <button
                type="button"
                onClick={() => onNewProject()}
                className="min-h-[42px] px-4 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Proje Başlat</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#868686] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Proje kodu, proje adı, ihale no, yönetici veya firma ara..."
              className="w-full min-h-[42px] pl-10 pr-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
            />
          </div>

          {activeTab !== 'ledger' ? (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | ProjectStatus)}
              className="min-h-[42px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
            >
              <option value="all">Tüm Durumlar</option>
              {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((st) => (
                <option key={st} value={st}>
                  {PROJECT_STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={ledgerTypeFilter}
              onChange={(e) =>
                setLedgerTypeFilter(e.target.value as 'all' | ProjectTransactionType)
              }
              className="min-h-[42px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
            >
              <option value="all">Tüm Hareket Türleri</option>
              {(Object.keys(PROJECT_TX_TYPE_LABELS) as ProjectTransactionType[]).map((t) => (
                <option key={t} value={t}>
                  {PROJECT_TX_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          )}

          <label className="min-h-[42px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg inline-flex items-center gap-2 text-xs font-medium text-[#0B2239] cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={onlyManagedByMe}
              onChange={(e) => setOnlyManagedByMe(e.target.checked)}
              className="w-4 h-4 accent-[#0066B3]"
            />
            <span>Sadece Yönettiğim Projeler</span>
          </label>
        </div>
      </div>

      {/* TAB 1: Genel Proje Maliyet Muhasebesi (Master List) */}
      {activeTab === 'cost_accounting' && (
        <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#DCE3EC] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-bold text-[#0B2239]">
                Genel Proje Maliyet Muhasebesi Tablosu ({filteredSummaries.length} Proje)
              </h3>
              <p className="text-xs text-[#4E5D6C] mt-0.5">
                Her projeye yazılan kesilen fatura, gelen fatura ve gider kalemleri bu genel listede anlık olarak konsolide edilir.
              </p>
            </div>
          </div>

          {filteredSummaries.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <Briefcase className="w-8 h-8 text-[#868686] mx-auto" />
              <p className="text-sm font-medium text-[#0B2239]">
                Kriterlere uygun proje kaydı bulunmuyor.
              </p>
              {canCreateProject && projects.length === 0 && (
                <button
                  type="button"
                  onClick={() => onNewProject()}
                  className="min-h-[42px] px-4 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>İlk Projeyi Oluştur</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0B2239] text-xs font-semibold text-slate-200 border-b border-[#DCE3EC]">
                    <th className="py-3 px-4">Proje / İhale</th>
                    <th className="py-3 px-4">Proje Yöneticisi</th>
                    <th className="py-3 px-4 text-right">Sözleşme Bedeli</th>
                    <th className="py-3 px-4 text-right">Kesilen Faturalar / Gelir</th>
                    <th className="py-3 px-4 text-right">Gelen Faturalar</th>
                    <th className="py-3 px-4 text-right">Yapılan Giderler</th>
                    <th className="py-3 px-4 text-right">Toplam Maliyet</th>
                    <th className="py-3 px-4 text-right">Net Kâr / Zarar</th>
                    <th className="py-3 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE3EC] text-xs">
                  {filteredSummaries.map(({ project, isManager, txCount, byCurrency }) => {
                    const cur: CurrencyCode = project.currency || 'TRY';
                    const b = byCurrency[cur];
                    const secondaryCors = CURRENCIES.filter(
                      (c) =>
                        c !== cur &&
                        (byCurrency[c].income > 0 || byCurrency[c].totalCost > 0)
                    );
                    const margin = b.income > 0 ? (b.netProfit / b.income) * 100 : null;

                    return (
                      <tr
                        key={project.id}
                        onClick={() => onViewProject(project)}
                        className="hover:bg-[#F3F6FA]/70 transition-colors cursor-pointer"
                      >
                        <td className="py-3.5 px-4 align-top max-w-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-bold text-[#0066B3]">
                              {project.projectCode}
                            </span>
                            {project.tenderTrackingCode && (
                              <span className="font-mono text-[11px] text-[#007A53] bg-[#007A53]/15 px-1.5 py-0.5 rounded">
                                {project.tenderTrackingCode}
                              </span>
                            )}
                            {project.quoteNumber && (
                              <span className="font-mono text-[11px] text-[#0066B3] bg-[#0066B3]/10 px-1.5 py-0.5 rounded">
                                {project.quoteNumber}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-sm text-[#0B2239] truncate mt-0.5">
                            {project.title}
                          </div>
                          <div className="text-[11px] text-[#4E5D6C] truncate">
                            {project.authority} · {PROJECT_STATUS_LABELS[project.status]} ({txCount} hareket)
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-top">
                          <div className="space-y-1">
                            {getProjectManagers(project).map((m) => {
                              const isSelf = m.uid === currentUid;
                              return (
                                <div
                                  key={m.uid}
                                  className="inline-flex items-center gap-1.5 font-semibold text-[#0B2239] mr-2"
                                >
                                  <UserCheck
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      isSelf ? 'text-[#007A53]' : 'text-[#868686]'
                                    }`}
                                  />
                                  <span>{m.displayName}</span>
                                  {isSelf && (
                                    <span className="text-[10px] font-mono bg-[#007A53]/20 text-[#007A53] px-1.5 py-0.5 rounded">
                                      Siz
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="text-[11px] text-[#4E5D6C] mt-0.5">
                            {isManager ? 'Tam İşlem Yetkili' : 'Salt Okunur'}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap font-mono font-semibold text-[#0B2239] tabular-nums">
                          {formatCurrency(project.contractAmount, cur)}
                        </td>

                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap font-mono font-semibold text-[#007A53] tabular-nums">
                          <div>+{formatCurrency(b.income, cur)}</div>
                          {secondaryCors.map((c) => (
                            <div key={c} className="text-[11px]">
                              +{formatCurrency(byCurrency[c].income, c)}
                            </div>
                          ))}
                        </td>

                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap font-mono font-semibold text-[#0066B3] tabular-nums">
                          <div>-{formatCurrency(b.incomingInvoices, cur)}</div>
                          {secondaryCors.map((c) => (
                            <div key={c} className="text-[11px]">
                              -{formatCurrency(byCurrency[c].incomingInvoices, c)}
                            </div>
                          ))}
                        </td>

                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap font-mono font-semibold text-amber-700 tabular-nums">
                          <div>-{formatCurrency(b.expenses, cur)}</div>
                          {secondaryCors.map((c) => (
                            <div key={c} className="text-[11px]">
                              -{formatCurrency(byCurrency[c].expenses, c)}
                            </div>
                          ))}
                        </td>

                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap font-mono font-bold text-[#0B2239] tabular-nums">
                          <div>-{formatCurrency(b.totalCost, cur)}</div>
                          {secondaryCors.map((c) => (
                            <div key={c} className="text-[11px]">
                              -{formatCurrency(byCurrency[c].totalCost, c)}
                            </div>
                          ))}
                        </td>

                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap font-mono font-bold tabular-nums">
                          <div className={b.netProfit >= 0 ? 'text-[#007A53]' : 'text-red-700'}>
                            {b.netProfit >= 0 ? '+' : ''}
                            {formatCurrency(b.netProfit, cur)}
                          </div>
                          {margin !== null && (
                            <div className="text-[11px] font-normal text-[#4E5D6C]">
                              %{margin.toFixed(1)}
                            </div>
                          )}
                          {secondaryCors.map((c) => (
                            <div
                              key={c}
                              className={`text-[11px] ${
                                byCurrency[c].netProfit >= 0 ? 'text-[#007A53]' : 'text-red-700'
                              }`}
                            >
                              {formatCurrency(byCurrency[c].netProfit, c)}
                            </div>
                          ))}
                        </td>

                        <td
                          className="py-3.5 px-4 align-top text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1">
                            {isManager ? (
                              <button
                                type="button"
                                onClick={() => onNewTransaction(project.id)}
                                title="Fatura / Gider Ekle"
                                className="min-h-[34px] px-2.5 inline-flex items-center gap-1 bg-[#0066B3] hover:bg-[#00508E] text-white text-[11px] font-semibold rounded-md cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>İşlem</span>
                              </button>
                            ) : (
                              <span
                                title={`Yalnızca Proje Yöneticileri (${formatProjectManagerNames(
                                  project
                                )}) işlem yapabilir`}
                                className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center border border-[#DCE3EC] rounded-md text-[#868686]"
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </span>
                            )}
                            <a
                              href={`?detail=project&id=${encodeURIComponent(project.id)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Yeni Sekmede Aç"
                              className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] rounded-md"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-[#F3F6FA] border-t-2 border-[#0B2239] text-xs font-bold text-[#0B2239]">
                  {activeCurrencyTotals.map((cur) => (
                    <tr key={cur}>
                      <td colSpan={2} className="py-3 px-4">
                        GENEL TOPLAM ({cur})
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatCurrency(grandTotals[cur].contract, cur)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#007A53] tabular-nums">
                        +{formatCurrency(grandTotals[cur].income, cur)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[#0066B3] tabular-nums">
                        -{formatCurrency(grandTotals[cur].incomingInvoices, cur)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-amber-700 tabular-nums">
                        -{formatCurrency(grandTotals[cur].expenses, cur)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        -{formatCurrency(grandTotals[cur].totalCost, cur)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          grandTotals[cur].netProfit >= 0 ? 'text-[#007A53]' : 'text-red-700'
                        }`}
                      >
                        {grandTotals[cur].netProfit >= 0 ? '+' : ''}
                        {formatCurrency(grandTotals[cur].netProfit, cur)}
                      </td>
                      <td className="py-3 px-4" />
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: Proje Kartları */}
      {activeTab === 'cards' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredSummaries.length === 0 ? (
            <div className="lg:col-span-2 bg-white border border-[#DCE3EC] rounded-xl p-10 text-center text-sm text-[#4E5D6C]">
              Gösterilecek proje bulunamadı.
            </div>
          ) : (
            filteredSummaries.map(({ project, isManager, txCount, byCurrency }) => {
              const cur: CurrencyCode = project.currency || 'TRY';
              const b = byCurrency[cur];
              return (
                <div
                  key={project.id}
                  className="bg-white border border-[#DCE3EC] rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-[#0066B3]/60 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-bold text-[#0066B3]">
                            {project.projectCode}
                          </span>
                          <span className="text-[#4E5D6C]">
                            · {PROJECT_STATUS_LABELS[project.status]}
                          </span>
                          {project.tenderTrackingCode && (
                            <button
                              type="button"
                              onClick={() => onSelectTenderId(project.tenderId)}
                              className="font-mono text-[11px] font-semibold text-[#007A53] hover:underline cursor-pointer"
                            >
                              İhale: {project.tenderTrackingCode}
                            </button>
                          )}
                          {project.quoteNumber && project.quoteId && (
                            <button
                              type="button"
                              onClick={() => onSelectQuoteId?.(project.quoteId || '')}
                              className="font-mono text-[11px] font-semibold text-[#0066B3] hover:underline cursor-pointer"
                            >
                              Teklif: {project.quoteNumber}
                            </button>
                          )}
                        </div>
                        <h3 className="font-display text-base font-bold text-[#0B2239] mt-1">
                          {project.title}
                        </h3>
                        <p className="text-xs text-[#4E5D6C]">{project.authority}</p>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-[11px] text-[#4E5D6C]">Sözleşme</div>
                        <div className="text-sm font-mono font-bold text-[#0B2239] tabular-nums">
                          {formatCurrency(project.contractAmount, cur)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-3 bg-[#F3F6FA]/70 rounded-lg text-xs">
                      <div>
                        <div className="text-[11px] text-[#4E5D6C]">Kesilen / Gelir</div>
                        <div className="font-mono font-bold text-[#007A53] tabular-nums">
                          +{formatCurrency(b.income, cur)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[#4E5D6C]">Maliyet (Fat.+Gid.)</div>
                        <div className="font-mono font-bold text-red-700 tabular-nums">
                          -{formatCurrency(b.totalCost, cur)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-[#4E5D6C]">Net Kâr / Zarar</div>
                        <div
                          className={`font-mono font-bold tabular-nums ${
                            b.netProfit >= 0 ? 'text-[#007A53]' : 'text-red-700'
                          }`}
                        >
                          {b.netProfit >= 0 ? '+' : ''}
                          {formatCurrency(b.netProfit, cur)}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4E5D6C]">
                      <div className="inline-flex items-center gap-1.5">
                        <UserCheck
                          className={`w-3.5 h-3.5 ${
                            isManager ? 'text-[#007A53]' : 'text-[#868686]'
                          }`}
                        />
                        <span>
                          {getProjectManagers(project).length > 1 ? 'Yöneticiler:' : 'Yönetici:'}{' '}
                          <strong className="text-[#0B2239]">
                            {formatProjectManagerNames(project)}
                          </strong>
                        </span>
                      </div>
                      <span>{txCount} finansal hareket</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#DCE3EC] flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onViewProject(project)}
                      className="min-h-[38px] px-3.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Proje Detayını Aç
                    </button>

                    <div className="flex items-center gap-1.5">
                      {isManager ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onNewTransaction(project.id)}
                            className="min-h-[38px] px-3 inline-flex items-center gap-1 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Fatura / Gider</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditProject(project)}
                            aria-label="Projeyi Düzenle"
                            className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] rounded-lg cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#4E5D6C] px-2.5 py-1.5 bg-[#F3F6FA] rounded-md">
                          <Lock className="w-3 h-3" />
                          <span>Sadece Yönetici İşlem Yapabilir</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: Tüm Fatura & Gider Defteri */}
      {activeTab === 'ledger' && (
        <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#DCE3EC]">
            <h3 className="font-display text-sm font-bold text-[#0B2239]">
              Tüm Proje Fatura ve Gider Hareketleri ({filteredLedger.length})
            </h3>
            <p className="text-xs text-[#4E5D6C] mt-0.5">
              Düzenleme, ödeme onaylama ve silme işlemleri yalnızca ilgili projenin yöneticisi tarafından yapılabilir.
            </p>
          </div>

          {filteredLedger.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#4E5D6C]">
              Proje fatura veya gider kaydı bulunamadı.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0B2239] text-xs font-semibold text-slate-200 border-b border-[#DCE3EC]">
                    <th className="py-3 px-4">Tarih</th>
                    <th className="py-3 px-4">Proje</th>
                    <th className="py-3 px-4">Tür &amp; Kalem</th>
                    <th className="py-3 px-4">Firma / Belge No</th>
                    <th className="py-3 px-4">Açıklama</th>
                    <th className="py-3 px-4 text-right">Tutar</th>
                    <th className="py-3 px-4 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE3EC] text-xs">
                  {filteredLedger.map((tx) => {
                    const parent = projectMap.get(tx.projectId);
                    const isManager = Boolean(parent && isProjectManager(parent, currentUid));
                    const isIncome = isProjectIncomeTx(tx.txType);
                    const canDel = Boolean(parent && isManager && isOwnRecord(tx, currentUid));

                    return (
                      <tr key={tx.id} className="hover:bg-[#F3F6FA]/60">
                        <td className="py-3 px-4 align-top whitespace-nowrap font-mono text-[#0B2239] tabular-nums">
                          {formatTurkishDate(tx.txDate)}
                        </td>
                        <td className="py-3 px-4 align-top max-w-[200px]">
                          {parent ? (
                            <button
                              type="button"
                              onClick={() => onViewProject(parent)}
                              className="text-left hover:underline cursor-pointer"
                            >
                              <div className="font-mono font-semibold text-[#0066B3]">
                                {tx.projectCode}
                              </div>
                              <div className="text-[#0B2239] truncate">{tx.projectTitle}</div>
                            </button>
                          ) : (
                            <span className="text-[#4E5D6C]">{tx.projectTitle}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 align-top whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-semibold ${
                              isIncome
                                ? 'bg-[#007A53]/15 text-[#007A53]'
                                : tx.txType === 'gelen_fatura'
                                ? 'bg-[#0066B3]/10 text-[#0066B3]'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {PROJECT_TX_TYPE_LABELS[tx.txType]}
                          </span>
                          <div className="text-[11px] text-[#4E5D6C] mt-0.5">{tx.category}</div>
                        </td>
                        <td className="py-3 px-4 align-top">
                          <div className="font-semibold text-[#0B2239]">{tx.companyName}</div>
                          <div className="font-mono text-[11px] text-[#4E5D6C]">
                            {tx.invoiceNo || 'Belge No Yok'}
                          </div>
                        </td>
                        <td className="py-3 px-4 align-top max-w-xs">
                          <div className="font-semibold text-[#0B2239]">{tx.title}</div>
                          <div className="text-[11px] text-[#4E5D6C]">
                            {ACCOUNTING_PAYMENT_STATUS_LABELS[tx.paymentStatus]}
                          </div>
                        </td>
                        <td className="py-3 px-4 align-top text-right whitespace-nowrap font-mono font-bold tabular-nums">
                          <span
                            className={
                              tx.paymentStatus === 'iptal'
                                ? 'text-[#868686] line-through'
                                : isIncome
                                ? 'text-[#007A53]'
                                : 'text-red-700'
                            }
                          >
                            {isIncome ? '+' : '-'}
                            {formatCurrency(tx.totalAmount, tx.currency)}
                          </span>
                        </td>
                        <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                          {isManager && parent ? (
                            <div className="inline-flex items-center gap-1">
                              {tx.paymentStatus !== 'odendi' && tx.paymentStatus !== 'iptal' && (
                                <button
                                  type="button"
                                  onClick={() => onMarkTransactionPaid(tx)}
                                  title="Ödendi İşaretle"
                                  className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center border border-[#007A53]/50 hover:bg-[#007A53]/15 text-[#007A53] rounded-md cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onEditTransaction(tx)}
                                title="Düzenle"
                                className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] rounded-md cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {canDel &&
                                (confirmDeleteTxId === tx.id ? (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await onDeleteTransaction(parent, tx);
                                      setConfirmDeleteTxId(null);
                                    }}
                                    className="min-h-[32px] px-2 bg-red-700 text-white text-[11px] font-semibold rounded-md cursor-pointer"
                                  >
                                    Onayla
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteTxId(tx.id)}
                                    title="Sil"
                                    className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-red-50 hover:text-red-700 text-[#4E5D6C] rounded-md cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                ))}
                            </div>
                          ) : (
                            <span
                              title="Yetki yalnızca ilgili proje yöneticisindedir"
                              className="inline-flex items-center justify-center min-w-[28px] text-[#868686]"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </span>
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
    </div>
  );
};
