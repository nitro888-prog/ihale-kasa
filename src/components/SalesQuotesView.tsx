import React, { useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  Search,
  FileDown,
  Briefcase,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  Edit3,
  Eye,
} from 'lucide-react';
import {
  CompanyProfile,
  CurrencyCode,
  SALES_QUOTE_DOC_TYPE_LABELS,
  SALES_QUOTE_STATUS_LABELS,
  SalesQuote,
  SalesQuoteDocType,
  SalesQuoteStatus,
} from '../types/tender';
import { formatCurrency, formatTurkishDate } from '../lib/trackingAndCalendar';
import { downloadSalesQuotePdf } from '../lib/salesQuotePdf';

interface SalesQuotesViewProps {
  quotes: SalesQuote[];
  companyProfile: CompanyProfile | null;
  canManageQuotes: boolean;
  canViewProjects: boolean;
  onNewQuote: (defaultDocType?: SalesQuoteDocType) => void;
  onViewQuote: (quote: SalesQuote) => void;
  onEditQuote: (quote: SalesQuote) => void;
  onUpdateStatus: (quote: SalesQuote, nextStatus: SalesQuoteStatus) => Promise<void>;
  onConvertToProject: (quote: SalesQuote) => void;
  onOpenLinkedProject: (projectId: string) => void;
}

const CURRENCIES: CurrencyCode[] = ['TRY', 'USD', 'EUR'];

function getStatusBadgeStyle(status: SalesQuoteStatus): string {
  switch (status) {
    case 'siparis_onaylandi':
      return 'bg-[#007A53]/15 text-[#007A53]';
    case 'gonderildi':
      return 'bg-[#0066B3]/10 text-[#0066B3]';
    case 'revize':
      return 'bg-amber-100 text-amber-800';
    case 'iptal':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-[#F3F6FA] text-[#4E5D6C]';
  }
}

export const SalesQuotesView: React.FC<SalesQuotesViewProps> = ({
  quotes,
  companyProfile,
  canManageQuotes,
  canViewProjects,
  onNewQuote,
  onViewQuote,
  onEditQuote,
  onUpdateStatus,
  onConvertToProject,
  onOpenLinkedProject,
}) => {
  const [search, setSearch] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | SalesQuoteDocType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | SalesQuoteStatus>('all');
  const [currencyFilter, setCurrencyFilter] = useState<'all' | CurrencyCode>('all');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredQuotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter((item) => {
      if (docTypeFilter !== 'all' && item.docType !== docTypeFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (currencyFilter !== 'all' && item.currency !== currencyFilter) return false;
      if (!q) return true;
      const inItems = (item.items || []).some(
        (it) =>
          it.materialName.toLowerCase().includes(q) ||
          it.stockNumber.toLowerCase().includes(q) ||
          it.partNumber.toLowerCase().includes(q)
      );
      return (
        item.quoteNumber.toLowerCase().includes(q) ||
        item.customerName.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        (item.linkedProjectCode || '').toLowerCase().includes(q) ||
        inItems
      );
    });
  }, [quotes, docTypeFilter, statusFilter, currencyFilter, search]);

  const kpiStats = useMemo(() => {
    const openTotals: Record<CurrencyCode, number> = { TRY: 0, USD: 0, EUR: 0 };
    const approvedTotals: Record<CurrencyCode, number> = { TRY: 0, USD: 0, EUR: 0 };
    let openCount = 0;
    let approvedCount = 0;
    let linkedProjectsCount = 0;
    let pendingProjectLaunchCount = 0;

    for (const q of filteredQuotes) {
      const cur: CurrencyCode = q.currency || 'TRY';
      if (q.status === 'siparis_onaylandi') {
        approvedTotals[cur] += q.grandTotal || 0;
        approvedCount += 1;
        if (q.linkedProjectId) {
          linkedProjectsCount += 1;
        } else {
          pendingProjectLaunchCount += 1;
        }
      } else if (q.status !== 'iptal') {
        openTotals[cur] += q.grandTotal || 0;
        openCount += 1;
      }
    }

    const activeCurrencies = CURRENCIES.filter(
      (c) => openTotals[c] > 0 || approvedTotals[c] > 0
    );

    return {
      openTotals,
      approvedTotals,
      openCount,
      approvedCount,
      linkedProjectsCount,
      pendingProjectLaunchCount,
      activeCurrencies: activeCurrencies.length > 0 ? activeCurrencies : (['TRY'] as CurrencyCode[]),
    };
  }, [filteredQuotes]);

  const handleDownloadPdf = async (quote: SalesQuote, mode: SalesQuoteDocType) => {
    const key = `${quote.id}:${mode}`;
    setBusyKey(key);
    setErrorMsg(null);
    try {
      await downloadSalesQuotePdf({
        quote,
        companyProfile,
        mode,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF indirilemedi.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleQuickApproveOrder = async (quote: SalesQuote) => {
    if (!canManageQuotes) return;
    setBusyKey(`${quote.id}:approve`);
    setErrorMsg(null);
    try {
      await onUpdateStatus(quote, 'siparis_onaylandi');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sipariş onayı kaydedilemedi.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top KPI Strip */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#DCE3EC]">
        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">Toplam Teklif &amp; Proforma</div>
          <div className="mt-1.5 text-2xl font-bold text-[#0B2239] font-mono tabular-nums">
            {filteredQuotes.length}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">
            {filteredQuotes.filter((q) => q.docType === 'teklif').length} Teklif ·{' '}
            {filteredQuotes.filter((q) => q.docType === 'proforma').length} Proforma
          </div>
        </div>

        <div className="p-4 sm:p-5 border-l border-[#DCE3EC] lg:border-l-0">
          <div className="text-xs text-[#4E5D6C]">
            Açık / Bekleyen Teklif ({kpiStats.openCount})
          </div>
          <div className="mt-1.5 space-y-0.5">
            {kpiStats.activeCurrencies.map((cur) => (
              <div
                key={cur}
                className="text-lg sm:text-xl font-bold text-[#0066B3] font-mono tabular-nums"
              >
                {formatCurrency(kpiStats.openTotals[cur], cur)}
              </div>
            ))}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">Taslak, gönderildi ve revize</div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">
            Siparişe Dönen Onaylı ({kpiStats.approvedCount})
          </div>
          <div className="mt-1.5 space-y-0.5">
            {kpiStats.activeCurrencies.map((cur) => (
              <div
                key={cur}
                className="text-lg sm:text-xl font-bold text-[#007A53] font-mono tabular-nums"
              >
                {formatCurrency(kpiStats.approvedTotals[cur], cur)}
              </div>
            ))}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">Özel sektör onaylı satışlar</div>
        </div>

        <div className="p-4 sm:p-5 border-l border-[#DCE3EC] lg:border-l-0">
          <div className="text-xs text-[#4E5D6C]">Proje Yönetimi Entegrasyonu</div>
          <div className="mt-1.5 text-2xl font-bold text-[#0B2239] font-mono tabular-nums">
            {kpiStats.linkedProjectsCount}{' '}
            <span className="text-sm font-normal text-[#4E5D6C]">bağlı proje</span>
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">
            {kpiStats.pendingProjectLaunchCount > 0 ? (
              <span className="text-[#007A53] font-semibold">
                {kpiStats.pendingProjectLaunchCount} onaylı sipariş proje bekliyor
              </span>
            ) : (
              'Onaylı siparişler projeye aktarılır'
            )}
          </div>
        </div>
      </section>

      {errorMsg && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium"
        >
          {errorMsg}
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F3F6FA] rounded-lg">
            {(
              [
                { id: 'all', label: `Tümü (${quotes.length})` },
                {
                  id: 'teklif',
                  label: `Teklif Mektubu (${quotes.filter((q) => q.docType === 'teklif').length})`,
                },
                {
                  id: 'proforma',
                  label: `Proforma Fatura (${quotes.filter((q) => q.docType === 'proforma').length})`,
                },
              ] as { id: 'all' | SalesQuoteDocType; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDocTypeFilter(tab.id)}
                className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                  docTypeFilter === tab.id
                    ? 'bg-white text-[#0B2239] shadow-xs'
                    : 'text-[#4E5D6C] hover:text-[#0B2239]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {canManageQuotes && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNewQuote('teklif')}
                className="min-h-[42px] px-4 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Teklif Mektubu</span>
              </button>
              <button
                type="button"
                onClick={() => onNewQuote('proforma')}
                className="min-h-[42px] px-4 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni Proforma Fatura</span>
              </button>
            </div>
          )}
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#868686] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Teklif no, müşteri firma, konu, ürün adı veya proje kodu ara..."
              className="w-full min-h-[42px] pl-10 pr-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | SalesQuoteStatus)}
            className="min-h-[42px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
          >
            <option value="all">Tüm Durumlar</option>
            {(Object.keys(SALES_QUOTE_STATUS_LABELS) as SalesQuoteStatus[]).map((st) => (
              <option key={st} value={st}>
                {SALES_QUOTE_STATUS_LABELS[st]}
              </option>
            ))}
          </select>

          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value as 'all' | CurrencyCode)}
            className="min-h-[42px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239]"
          >
            <option value="all">Tüm Para Birimleri</option>
            <option value="TRY">TRY (₺)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
          </select>
        </div>
      </div>

      {/* Quotes & Proformas Master List */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#DCE3EC] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-bold text-[#0B2239]">
              Özel Sektör Teklifleri ve Proforma Faturalar ({filteredQuotes.length})
            </h2>
            <p className="text-xs text-[#4E5D6C] mt-0.5">
              Ürünler listesinden seçilen kalemlerle çoklu dövizde Teklif Mektubu ve Proforma PDF oluşturun; siparişe döndüğünde Proje Yönetimine aktarın.
            </p>
          </div>
        </div>

        {filteredQuotes.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <FileText className="w-8 h-8 text-[#868686] mx-auto" />
            <p className="text-sm font-medium text-[#0B2239]">
              Kriterlere uygun teklif veya proforma kaydı bulunamadı.
            </p>
            {canManageQuotes && quotes.length === 0 && (
              <button
                type="button"
                onClick={() => onNewQuote('teklif')}
                className="min-h-[42px] px-4 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>İlk Teklif / Proformayı Oluştur</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0B2239] text-xs font-semibold text-slate-200 border-b border-[#DCE3EC]">
                  <th className="py-3 px-4">Belge No &amp; Tür</th>
                  <th className="py-3 px-4">Tarih / Geçerlilik</th>
                  <th className="py-3 px-4">Müşteri &amp; Konu</th>
                  <th className="py-3 px-4 text-center">Kalem</th>
                  <th className="py-3 px-4">Durum &amp; Proje</th>
                  <th className="py-3 px-4 text-right">Genel Toplam</th>
                  <th className="py-3 px-4 text-right">İşlemler &amp; PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE3EC] text-xs">
                {filteredQuotes.map((quote) => (
                  <tr
                    key={quote.id}
                    onClick={() => onViewQuote(quote)}
                    className="hover:bg-[#F3F6FA]/70 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4 align-top whitespace-nowrap">
                      <div className="font-mono font-bold text-[#0066B3]">
                        {quote.quoteNumber}
                      </div>
                      <div className="text-[11px] font-medium text-[#4E5D6C] mt-0.5">
                        {SALES_QUOTE_DOC_TYPE_LABELS[quote.docType]} · {quote.currency}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 align-top whitespace-nowrap font-mono tabular-nums">
                      <div className="text-[#0B2239] font-medium">
                        {formatTurkishDate(quote.issueDate)}
                      </div>
                      {quote.validUntilDate && (
                        <div className="text-[11px] text-[#4E5D6C] mt-0.5">
                          Son: {formatTurkishDate(quote.validUntilDate)}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top max-w-xs">
                      <div className="font-semibold text-sm text-[#0B2239] truncate">
                        {quote.customerName}
                      </div>
                      <div className="text-xs text-[#4E5D6C] truncate mt-0.5">
                        {quote.title}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 align-top text-center font-mono font-semibold text-[#0B2239] tabular-nums">
                      {(quote.items || []).length}
                    </td>

                    <td className="py-3.5 px-4 align-top whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-semibold ${getStatusBadgeStyle(
                          quote.status
                        )}`}
                      >
                        {SALES_QUOTE_STATUS_LABELS[quote.status]}
                      </span>
                      {quote.linkedProjectCode && (
                        <div className="mt-1 font-mono text-[11px] font-semibold text-[#007A53]">
                          Proje: {quote.linkedProjectCode}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 align-top text-right whitespace-nowrap font-mono tabular-nums">
                      <div className="text-sm font-bold text-[#0B2239]">
                        {formatCurrency(quote.grandTotal, quote.currency)}
                      </div>
                      <div className="text-[11px] text-[#4E5D6C]">
                        KDV Hariç: {formatCurrency(quote.subtotalAmount, quote.currency)}
                      </div>
                    </td>

                    <td
                      className="py-3.5 px-4 align-top text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={busyKey === `${quote.id}:teklif`}
                          onClick={() => handleDownloadPdf(quote, 'teklif')}
                          title="Teklif Mektubu PDF İndir"
                          className="min-h-[34px] px-2.5 inline-flex items-center gap-1 border border-[#DCE3EC] bg-white hover:bg-[#F3F6FA] text-[#0B2239] text-[11px] font-semibold rounded-md cursor-pointer"
                        >
                          <FileDown className="w-3.5 h-3.5 text-[#0B2239]" />
                          <span>Teklif PDF</span>
                        </button>

                        <button
                          type="button"
                          disabled={busyKey === `${quote.id}:proforma`}
                          onClick={() => handleDownloadPdf(quote, 'proforma')}
                          title="Proforma Fatura PDF İndir"
                          className="min-h-[34px] px-2.5 inline-flex items-center gap-1 border border-[#0066B3]/30 bg-white hover:bg-[#0066B3]/10 text-[#0066B3] text-[11px] font-semibold rounded-md cursor-pointer"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>Proforma PDF</span>
                        </button>

                        {quote.linkedProjectId ? (
                          canViewProjects && (
                            <button
                              type="button"
                              onClick={() => onOpenLinkedProject(quote.linkedProjectId)}
                              title="Bağlı Projeyi Aç"
                              className="min-h-[34px] px-2.5 inline-flex items-center gap-1 bg-[#007A53] hover:bg-[#006344] text-white text-[11px] font-semibold rounded-md cursor-pointer"
                            >
                              <Briefcase className="w-3.5 h-3.5" />
                              <span>Projeyi Aç</span>
                            </button>
                          )
                        ) : quote.status !== 'iptal' ? (
                          canViewProjects ? (
                            <button
                              type="button"
                              onClick={() => onConvertToProject(quote)}
                              title="Siparişe Çevir ve Proje Başlat"
                              className="min-h-[34px] px-2.5 inline-flex items-center gap-1 bg-[#007A53] hover:bg-[#006344] text-white text-[11px] font-semibold rounded-md cursor-pointer"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                              <span>
                                {quote.status === 'siparis_onaylandi'
                                  ? 'Proje Başlat'
                                  : 'Sipariş & Proje'}
                              </span>
                            </button>
                          ) : canManageQuotes && quote.status !== 'siparis_onaylandi' ? (
                            <button
                              type="button"
                              disabled={busyKey === `${quote.id}:approve`}
                              onClick={() => handleQuickApproveOrder(quote)}
                              title="Sipariş Olarak Onayla"
                              className="min-h-[34px] px-2.5 inline-flex items-center gap-1 border border-[#007A53]/40 hover:bg-[#007A53]/15 text-[#007A53] text-[11px] font-semibold rounded-md cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Sipariş Onayla</span>
                            </button>
                          ) : null
                        ) : null}

                        {canManageQuotes && (
                          <button
                            type="button"
                            onClick={() => onEditQuote(quote)}
                            title="Düzenle"
                            aria-label="Düzenle"
                            className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] rounded-md cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onViewQuote(quote)}
                          title="Detayı Gör"
                          aria-label="Detayı Gör"
                          className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] rounded-md cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <a
                          href={`?detail=quote&id=${encodeURIComponent(quote.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Yeni Sekmede Aç"
                          aria-label="Yeni Sekmede Aç"
                          className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] rounded-md"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
