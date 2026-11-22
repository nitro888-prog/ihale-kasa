import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  CalendarPlus,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { CompanyProfile, STATUS_LABELS, Tender } from '../types/tender';
import {
  downloadAllTendersICS,
  downloadTenderICS,
  formatCurrency,
  formatTurkishDate,
  formatTurkishDayMonth,
  getGoogleCalendarUrl,
  getMonthGrid,
  getMonthTitle,
  getRelativeDayLabel,
  getTodayDateStr,
  getTurkishDayHeaders,
} from '../lib/trackingAndCalendar';

interface CalendarViewProps {
  tenders: Tender[];
  companyProfile: CompanyProfile | null;
  onSelectTender: (tender: Tender) => void;
  onNewTenderOnDate: (dateStr: string) => void;
  onOpenTenderDay: (tenderId: string) => void;
  canCreateTender?: boolean;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  tenders,
  companyProfile,
  onSelectTender,
  onNewTenderOnDate,
  onOpenTenderDay,
  canCreateTender = true,
}) => {
  const todayStr = getTodayDateStr();
  const [todayY, todayM] = todayStr.split('-').map(Number);
  const [viewYear, setViewYear] = useState(todayY);
  const [viewMonth, setViewMonth] = useState((todayM || 1) - 1);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const cells = useMemo(() => getMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const dayHeaders = getTurkishDayHeaders();

  const tendersByDate = useMemo(() => {
    const map = new Map<string, Tender[]>();
    for (const t of tenders) {
      const list = map.get(t.tenderDate) || [];
      list.push(t);
      map.set(t.tenderDate, list);
    }
    return map;
  }, [tenders]);

  const selectedDayTenders = tendersByDate.get(selectedDate) || [];

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleGoToday = () => {
    setViewYear(todayY);
    setViewMonth((todayM || 1) - 1);
    setSelectedDate(todayStr);
  };

  // Mobile horizontal month days with tenders or around selected month
  const currentMonthCells = cells.filter((c) => c.inCurrentMonth);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Önceki Ay"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] rounded-lg cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="font-display text-base sm:text-lg font-bold text-[#0B2239] min-w-[140px] text-center">
            {getMonthTitle(viewYear, viewMonth)}
          </h2>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Sonraki Ay"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] rounded-lg cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleGoToday}
            className="min-h-[44px] px-3 text-xs font-semibold text-[#0B2239] border border-[#DCE3EC] hover:bg-[#F3F6FA] rounded-lg cursor-pointer whitespace-nowrap"
          >
            Bugün
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadAllTendersICS(tenders, companyProfile?.companyName)}
            disabled={tenders.length === 0}
            className="min-h-[44px] px-3.5 inline-flex items-center gap-2 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Tüm Takvimi İndir (.ics)</span>
          </button>
        </div>
      </div>

      {/* Main Split: Calendar Grid + Selected Day Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Desktop Full Month Grid & Mobile Horizontal Date Scroller */}
        <div className="lg:col-span-8 bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
          {/* Mobile Horizontal Date Scroller */}
          <div className="lg:hidden p-3 border-b border-[#DCE3EC] overflow-x-auto">
            <div className="flex items-center gap-2">
              {currentMonthCells.map((cell) => {
                const count = (tendersByDate.get(cell.dateStr) || []).length;
                const isSelected = cell.dateStr === selectedDate;
                const dm = formatTurkishDayMonth(cell.dateStr);
                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    onClick={() => setSelectedDate(cell.dateStr)}
                    className={`min-w-[54px] min-h-[64px] px-2.5 py-2 rounded-lg flex flex-col items-center justify-center border transition-colors cursor-pointer shrink-0 ${
                      isSelected
                        ? 'bg-[#0066B3] border-[#0066B3] text-white'
                        : cell.isToday
                        ? 'bg-[#F3F6FA] border-[#0B2239] text-[#0B2239]'
                        : 'bg-white border-[#DCE3EC] text-[#0B2239]'
                    }`}
                  >
                    <span className="text-[10px] font-medium opacity-80">{dm.weekday}</span>
                    <span className="text-base font-bold font-mono tabular-nums mt-0.5">
                      {dm.day}
                    </span>
                    <span className="text-[10px] font-mono tabular-nums mt-0.5">
                      {count > 0 ? `${count} ihale` : '·'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop 7-Column Calendar Grid */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-7 border-b border-[#DCE3EC] bg-[#0B2239] text-white">
              {dayHeaders.map((day) => (
                <div
                  key={day}
                  className="py-2.5 px-3 text-xs font-semibold text-slate-200 text-center"
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 divide-x divide-y divide-[#DCE3EC]">
              {cells.map((cell) => {
                const dayTenders = tendersByDate.get(cell.dateStr) || [];
                const isSelected = cell.dateStr === selectedDate;
                return (
                  <div
                    key={cell.dateStr}
                    onClick={() => setSelectedDate(cell.dateStr)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedDate(cell.dateStr);
                      }
                    }}
                    className={`min-h-[112px] p-2 text-left transition-colors cursor-pointer flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-[#0066B3]/10'
                        : cell.inCurrentMonth
                        ? 'bg-white hover:bg-[#F3F6FA]/70'
                        : 'bg-[#F3F6FA]/60 text-[#868686]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded ${
                          cell.isToday
                            ? 'bg-[#0066B3] text-white'
                            : isSelected
                            ? 'text-[#0066B3]'
                            : cell.inCurrentMonth
                            ? 'text-[#0B2239]'
                            : 'text-[#868686]'
                        }`}
                      >
                        {cell.dayNumber}
                      </span>
                      {dayTenders.length > 0 && (
                        <span className="text-[11px] font-mono text-[#4E5D6C] tabular-nums">
                          {dayTenders.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 mt-1">
                      {dayTenders.slice(0, 2).map((t) => (
                        <div
                          key={t.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTender(t);
                          }}
                          className={`px-1.5 py-1 rounded border text-[11px] leading-tight truncate ${
                            t.status === 'iptal'
                              ? 'bg-[#F3F6FA] border-[#DCE3EC] text-[#868686] line-through'
                              : cell.isToday
                              ? 'bg-red-50 border-red-200 text-red-900'
                              : 'bg-[#F3F6FA]/70 border-[#DCE3EC] text-[#0B2239] hover:border-[#0066B3]'
                          }`}
                          title={`${t.trackingCode} — ${t.title}`}
                        >
                          <div className="font-mono font-semibold tabular-nums truncate">
                            {t.tenderTime} · {t.trackingCode}
                          </div>
                          <div className="truncate">{t.title}</div>
                        </div>
                      ))}
                      {dayTenders.length > 2 && (
                        <div className="text-[11px] text-[#0066B3] font-medium pl-1">
                          +{dayTenders.length - 2} ihale daha
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected Date Detail Panel */}
        <aside className="lg:col-span-4 bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#DCE3EC] flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-bold text-[#0B2239]">
                {formatTurkishDate(selectedDate)}
              </h3>
              <p className="text-xs text-[#4E5D6C] mt-0.5">
                {getRelativeDayLabel(selectedDate)} · {selectedDayTenders.length} İhale
              </p>
            </div>
            {canCreateTender && (
              <button
                type="button"
                onClick={() => onNewTenderOnDate(selectedDate)}
                className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Bu Güne Ekle</span>
              </button>
            )}
          </div>

          {selectedDayTenders.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-xs text-[#4E5D6C]">
                Seçili tarihte planlanmış bir ihale kaydı bulunmuyor.
              </p>
              {canCreateTender && (
                <button
                  type="button"
                  onClick={() => onNewTenderOnDate(selectedDate)}
                  className="min-h-[44px] px-4 py-2 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-xs font-semibold text-[#0B2239] rounded-lg cursor-pointer"
                >
                  Bu Tarihe Yeni İhale Planla
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#DCE3EC]">
              {selectedDayTenders.map((t) => (
                <div key={t.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#0066B3] tabular-nums">
                          {t.trackingCode}
                        </span>
                        <span className="text-[#DCE3EC]">·</span>
                        <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
                          {t.tenderTime}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-[#0B2239] mt-1 leading-snug">
                        {t.title}
                      </h4>
                      <p className="text-xs text-[#4E5D6C] mt-0.5">{t.authority}</p>
                    </div>
                  </div>

                  <div className="text-xs text-[#4E5D6C] flex flex-wrap items-center gap-x-2">
                    <span>{STATUS_LABELS[t.status]}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(t.estimatedAmount, t.currency)}
                    </span>
                    {t.ikn && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">İKN {t.ikn}</span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onSelectTender(t)}
                      className="min-h-[40px] px-3 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                    >
                      Detay Penceresi
                    </button>
                    <a
                      href={`?detail=tender&id=${encodeURIComponent(t.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="İhaleyi Yeni Sekmede Aç"
                      title="İhaleyi Yeni Sekmede Aç"
                      className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] rounded-lg"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => onOpenTenderDay(t.id)}
                      className="min-h-[40px] px-3 inline-flex items-center gap-1 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-medium rounded-lg cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 text-[#0066B3]" />
                      <span>İhale Günü</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadTenderICS(t, companyProfile?.companyName)}
                      aria-label=".ics İndir"
                      title=".ics Takvim Dosyası İndir"
                      className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] rounded-lg cursor-pointer"
                    >
                      <CalendarPlus className="w-4 h-4" />
                    </button>
                    <a
                      href={getGoogleCalendarUrl(t)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Google Takvim'e Ekle"
                      title="Google Takvim'e Ekle"
                      className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] rounded-lg"
                    >
                      <CalendarPlus className="w-4 h-4 opacity-0 hidden" />
                      <span className="text-[11px] font-semibold px-1.5">GCal</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
