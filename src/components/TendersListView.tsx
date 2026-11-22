import React, { useMemo, useState } from 'react';
import { Search, Plus, CalendarPlus, Zap, ChevronRight, ExternalLink } from 'lucide-react';
import {
  CHECKLIST_ITEMS,
  CompanyProfile,
  PROCUREMENT_LABELS,
  STATUS_LABELS,
  Tender,
  TenderStatus,
} from '../types/tender';
import {
  downloadTenderICS,
  formatCurrency,
  formatTurkishDate,
  getDaysDifference,
  getRelativeDayLabel,
} from '../lib/trackingAndCalendar';

interface TendersListViewProps {
  tenders: Tender[];
  companyProfile: CompanyProfile | null;
  onNewTender: () => void;
  onSelectTender: (tender: Tender) => void;
  onOpenTenderDay: (tenderId: string) => void;
  canCreateTender?: boolean;
}

type FilterTab = 'all' | 'active' | 'teslim_edildi' | 'closed';

export const TendersListView: React.FC<TendersListViewProps> = ({
  tenders,
  companyProfile,
  onNewTender,
  onSelectTender,
  onOpenTenderDay,
  canCreateTender = true,
}) => {
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenders.filter((t) => {
      if (filterTab === 'active') {
        if (t.status !== 'hazirlik' && t.status !== 'onay_bekliyor') return false;
      } else if (filterTab === 'teslim_edildi') {
        if (t.status !== 'teslim_edildi' && t.status !== 'kazanildi') return false;
      } else if (filterTab === 'closed') {
        if (t.status !== 'sonuclandi' && t.status !== 'iptal') return false;
      }

      if (!q) return true;
      return (
        t.trackingCode.toLowerCase().includes(q) ||
        t.ikn.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.authority.toLowerCase().includes(q)
      );
    });
  }, [tenders, search, filterTab]);

  const getStatusClass = (status: TenderStatus): string => {
    switch (status) {
      case 'kazanildi':
      case 'teslim_edildi':
        return 'text-[#007A53]';
      case 'onay_bekliyor':
        return 'text-amber-700';
      case 'iptal':
        return 'text-red-700';
      case 'sonuclandi':
        return 'text-[#4E5D6C]';
      default:
        return 'text-[#0066B3]';
    }
  };

  return (
    <div className="space-y-5">
      {/* Search & Segmented Filter Toolbar */}
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#868686] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Takip no, İKN, ihale adı veya kurum ara..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-[#F3F6FA] rounded-lg overflow-x-auto">
            {(
              [
                { id: 'all', label: 'Tümü' },
                { id: 'active', label: 'Hazırlık / Onay' },
                { id: 'teslim_edildi', label: 'Teslim / Kazanılan' },
                { id: 'closed', label: 'Kapanan' },
              ] as { id: FilterTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  filterTab === tab.id
                    ? 'bg-white text-[#0B2239] shadow-xs'
                    : 'text-[#4E5D6C] hover:text-[#0B2239]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {canCreateTender && (
            <button
              type="button"
              onClick={onNewTender}
              className="min-h-[44px] px-4 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni İhale</span>
            </button>
          )}
        </div>
      </div>

      {/* Data View */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-[#DCE3EC] rounded-xl p-10 text-center space-y-3">
          <p className="text-sm font-medium text-[#0B2239]">
            Arama kriterlerinize uygun ihale kaydı bulunamadı.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setFilterTab('all');
            }}
            className="min-h-[44px] px-4 py-2 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-xs font-semibold text-[#0B2239] rounded-lg cursor-pointer"
          >
            Filtreleri Temizle
          </button>
        </div>
      ) : (
        <div className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#DCE3EC] bg-[#0B2239] text-xs font-semibold text-slate-200">
                  <th className="py-3 px-4">Takip No / İKN</th>
                  <th className="py-3 px-4">İhale Konusu &amp; Kurum</th>
                  <th className="py-3 px-4">İhale Tarihi</th>
                  <th className="py-3 px-4">Durum / Kontrol</th>
                  <th className="py-3 px-4 text-right">Tutar</th>
                  <th className="py-3 px-4 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE3EC] text-sm">
                {filtered.map((t) => {
                  const doneCount = CHECKLIST_ITEMS.filter((i) => t.checklist?.[i.key]).length;
                  const diff = getDaysDifference(t.tenderDate);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => onSelectTender(t)}
                      className="hover:bg-[#F3F6FA]/70 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <div className="font-mono font-semibold text-xs text-[#0066B3] tabular-nums">
                          {t.trackingCode}
                        </div>
                        <div className="font-mono text-xs text-[#4E5D6C] tabular-nums mt-0.5">
                          {t.ikn || '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 align-top max-w-md">
                        <div className="font-semibold text-[#0B2239] truncate">{t.title}</div>
                        <div className="text-xs text-[#4E5D6C] truncate mt-0.5">
                          {t.authority} · {PROCUREMENT_LABELS[t.procurementType]}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold text-[#0B2239] tabular-nums">
                          {formatTurkishDate(t.tenderDate)} · {t.tenderTime}
                        </div>
                        <div
                          className={`text-xs mt-0.5 ${
                            diff === 0
                              ? 'text-red-700 font-semibold'
                              : diff > 0 && diff <= 3
                              ? 'text-amber-700 font-medium'
                              : 'text-[#4E5D6C]'
                          }`}
                        >
                          {getRelativeDayLabel(t.tenderDate)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <div className={`text-xs font-semibold ${getStatusClass(t.status)}`}>
                          {STATUS_LABELS[t.status]}
                        </div>
                        <div className="text-xs font-mono text-[#4E5D6C] tabular-nums mt-0.5">
                          {doneCount}/{CHECKLIST_ITEMS.length} hazır
                        </div>
                      </td>
                      <td className="py-3.5 px-4 align-top text-right whitespace-nowrap font-mono text-xs font-semibold text-[#0B2239] tabular-nums">
                        {formatCurrency(t.estimatedAmount, t.currency)}
                      </td>
                      <td
                        className="py-3.5 px-4 align-top text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenTenderDay(t.id)}
                            title="İhale Günü Modu"
                            className="min-h-[36px] px-2.5 inline-flex items-center gap-1 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-xs font-medium text-[#0B2239] rounded-md cursor-pointer"
                          >
                            <Zap className="w-3.5 h-3.5 text-[#0066B3]" />
                            <span>İhale Günü</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadTenderICS(t, companyProfile?.companyName)}
                            title="Takvime Aktar (.ics)"
                            aria-label="Takvime Aktar"
                            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] rounded-md cursor-pointer"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={`?detail=tender&id=${encodeURIComponent(t.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Yeni Sekmede Aç"
                            aria-label="İhaleyi Yeni Sekmede Aç"
                            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] rounded-md"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Rows */}
          <div className="lg:hidden divide-y divide-[#DCE3EC]">
            {filtered.map((t) => {
              const diff = getDaysDifference(t.tenderDate);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTender(t)}
                  className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-[#F3F6FA]/70 cursor-pointer"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-xs">
                      <span className="font-mono font-semibold text-[#0066B3] tabular-nums">
                        {t.trackingCode}
                      </span>
                      <span className="text-[#DCE3EC]">·</span>
                      <span className={`font-semibold ${getStatusClass(t.status)}`}>
                        {STATUS_LABELS[t.status]}
                      </span>
                      <span className="text-[#DCE3EC]">·</span>
                      <span className={diff === 0 ? 'text-red-700 font-semibold' : 'text-[#4E5D6C]'}>
                        {getRelativeDayLabel(t.tenderDate)}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-[#0B2239] truncate">{t.title}</div>
                    <div className="text-xs text-[#4E5D6C] truncate">{t.authority}</div>
                    <div className="text-xs font-mono text-[#4E5D6C] tabular-nums">
                      {formatTurkishDate(t.tenderDate)} · {t.tenderTime} ·{' '}
                      {formatCurrency(t.estimatedAmount, t.currency)}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#868686] shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
