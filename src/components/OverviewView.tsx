import React, { useState } from 'react';
import {
  ArrowRight,
  Calendar,
  FileWarning,
  Plus,
  Sparkles,
  Zap,
  CheckCircle2,
  Clock,
  Bell,
} from 'lucide-react';
import {
  CHECKLIST_ITEMS,
  COMPANY_VAULT_CATEGORY_LABELS,
  CompanyProfile,
  CompanyVaultDocument,
  STATUS_LABELS,
  Tender,
} from '../types/tender';
import {
  formatCurrency,
  formatTurkishDate,
  getDaysDifference,
  getRelativeDayLabel,
  getTodayDateStr,
} from '../lib/trackingAndCalendar';
import { MonthlyTenderSummaryChart } from './MonthlyTenderSummaryChart';
import { TiniatechLogo } from './TiniatechLogo';

interface OverviewViewProps {
  tenders: Tender[];
  companyVault: CompanyVaultDocument[];
  companyProfile: CompanyProfile | null;
  notificationPermission?: NotificationPermission | 'unsupported';
  morningTime?: string;
  onEnableNotifications?: () => Promise<void>;
  onNewTender: () => void;
  onSelectTender: (tender: Tender) => void;
  onOpenCalendar: () => void;
  onOpenTenderDay: (tenderId?: string) => void;
  onOpenVault: () => void;
  onLoadSampleData: () => Promise<void>;
  canCreateTender?: boolean;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  tenders,
  companyVault,
  companyProfile,
  notificationPermission,
  morningTime = '08:00',
  onEnableNotifications,
  onNewTender,
  onSelectTender,
  onOpenCalendar,
  onOpenTenderDay,
  onOpenVault,
  onLoadSampleData,
  canCreateTender = true,
}) => {
  const [seeding, setSeeding] = useState(false);
  const todayStr = getTodayDateStr();
  const currentMonthPrefix = todayStr.slice(0, 7);

  const activeTenders = tenders.filter(
    (t) => t.status !== 'sonuclandi' && t.status !== 'iptal'
  );
  const todayTenders = tenders.filter(
    (t) => t.tenderDate === todayStr && t.status !== 'iptal'
  );
  const upcomingTenders = activeTenders
    .filter((t) => getDaysDifference(t.tenderDate) >= 0)
    .slice(0, 6);
  const monthTendersCount = tenders.filter((t) =>
    t.tenderDate.startsWith(currentMonthPrefix)
  ).length;

  const totalTryVolume = activeTenders
    .filter((t) => t.currency === 'TRY')
    .reduce((acc, t) => acc + (t.estimatedAmount || 0), 0);

  const expiringVaultDocs = companyVault.filter((doc) => {
    if (!doc.expiryDate) return false;
    return getDaysDifference(doc.expiryDate) <= 30;
  });

  const handleLoadSample = async () => {
    setSeeding(true);
    try {
      await onLoadSampleData();
    } finally {
      setSeeding(false);
    }
  };

  if (tenders.length === 0) {
    return (
      <div className="space-y-8">
        <div className="bg-white border border-[#DCE3EC] rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto">
          <div className="flex justify-center mb-5">
            <TiniatechLogo variant="hero" subtitle="Kurumsal İhale Paneli" />
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0B2239]">
            {companyProfile?.companyName
              ? `${companyProfile.companyName} İhale Paneli Hazır`
              : 'Firmanıza Özel İhale Takip Paneliniz Hazır'}
          </h2>
          <p className="text-sm text-[#4E5D6C] mt-2 max-w-lg mx-auto leading-relaxed">
            İlk ihale kaydınızı oluşturarak kendi belirlediğiniz takip numaranızı girin veya
            takvimle senkronize{' '}
            <span className="font-mono text-[#0B2239]">IH-YYYYAAGG-01</span> kodunuzu alın ve
            ihale dokümanlarınızı güvenli kasanızda toplamaya başlayın.
          </p>

          {canCreateTender ? (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={onNewTender}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 inline-flex items-center justify-center gap-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-sm font-semibold rounded-lg cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>İlk İhaleyi Oluştur</span>
              </button>
              <button
                type="button"
                onClick={handleLoadSample}
                disabled={seeding}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 inline-flex items-center justify-center gap-2 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-sm font-medium rounded-lg cursor-pointer disabled:opacity-60 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-[#0066B3]" />
                <span>{seeding ? 'Örnek İhaleler Yükleniyor…' : 'Örnek İhale Senaryosu Yükle'}</span>
              </button>
            </div>
          ) : (
            <p className="mt-5 text-xs text-[#4E5D6C]">
              Çalışma alanında henüz ihale kaydı bulunmuyor. Yeni ihale oluşturma yetkisi olan bir ekip üyesi kayıt eklediğinde burada görüntülenecektir.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Kurumsal Firma Başlık Şeridi */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <TiniatechLogo variant="compact" />
          <div className="min-w-0">
            <h2 className="font-display text-sm sm:text-base font-bold text-[#0B2239] truncate">
              {companyProfile?.companyName || 'Tiniatech Kurumsal Yönetim Merkezi'}
            </h2>
            <div className="text-xs text-[#4E5D6C] flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{formatTurkishDate(todayStr)}</span>
              {companyProfile?.taxNumber && (
                <>
                  <span className="text-[#DCE3EC]" aria-hidden="true">
                    ·
                  </span>
                  <span className="font-mono tabular-nums">
                    VKN {companyProfile.taxNumber}
                  </span>
                </>
              )}
              {companyProfile?.taxOffice && (
                <>
                  <span className="text-[#DCE3EC]" aria-hidden="true">
                    ·
                  </span>
                  <span>{companyProfile.taxOffice}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCalendar}
            className="min-h-[38px] px-3.5 inline-flex items-center gap-1.5 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
          >
            <Calendar className="w-3.5 h-3.5 text-[#0066B3]" />
            <span>İhale Takvimi</span>
          </button>
          {todayTenders.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenTenderDay(todayTenders[0].id)}
              className="min-h-[38px] px-3.5 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#006344] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>İhale Günü Modu</span>
            </button>
          )}
        </div>
      </section>

      {/* Bugün İhale Günü Uyarı Şeridi */}
      {todayTenders.length > 0 && (
        <section className="bg-[#0B2239] text-white rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#143252]">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#FBBF24]">
              <Zap className="w-4 h-4 shrink-0" />
              <span>Bugün İhale Günü · {todayTenders.length} Aktif İhale</span>
            </div>
            <h2 className="font-display text-base sm:text-lg font-bold text-white leading-snug">
              {todayTenders[0].trackingCode} — {todayTenders[0].title}
            </h2>
            <p className="text-xs text-slate-300">
              Saat <span className="font-mono tabular-nums">{todayTenders[0].tenderTime}</span> ·{' '}
              {todayTenders[0].authority}
              {todayTenders[0].location ? ` · ${todayTenders[0].location}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenTenderDay(todayTenders[0].id)}
            className="min-h-[44px] px-5 py-2.5 bg-[#007A53] hover:bg-[#006344] text-white text-sm font-bold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 whitespace-nowrap transition-colors"
          >
            <span>Tüm Dokümanlara Git</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </section>
      )}

      {/* Tarayıcı Sabah Bildirimi İzni */}
      {notificationPermission === 'default' && onEnableNotifications && (
        <section className="bg-white border border-[#DCE3EC] rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-[#0B2239]">
            <Bell className="w-4 h-4 text-[#0066B3] shrink-0" />
            <span>
              İhale günü sabah <span className="font-mono font-semibold">{morningTime}</span> itibarıyla masaüstü ve mobil tarayıcı bildirimi almak için izin verin.
            </span>
          </div>
          <button
            type="button"
            onClick={onEnableNotifications}
            className="min-h-[40px] px-4 py-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer shrink-0 whitespace-nowrap"
          >
            Sabah Bildirimlerini Aç
          </button>
        </section>
      )}

      {/* 4-Kolonlu KPI Şeridi */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#DCE3EC]">
        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">Bugünkü İhaleler</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#0B2239] font-mono tabular-nums">
            {todayTenders.length}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">
            {todayTenders.length > 0 ? 'İhale günü erişimi aktif' : 'Bugün planlı ihale yok'}
          </div>
        </div>

        <div className="p-4 sm:p-5 border-l border-[#DCE3EC] lg:border-l-0">
          <div className="text-xs text-[#4E5D6C]">Aktif Süreçteki İhaleler</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#0066B3] font-mono tabular-nums">
            {activeTenders.length}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">Hazırlık, onay ve teslim</div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">Bu Ayki İhale Sayısı</div>
          <div className="mt-1.5 text-2xl sm:text-3xl font-bold text-[#0B2239] font-mono tabular-nums">
            {monthTendersCount}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">Takvimle senkronize kayıt</div>
        </div>

        <div className="p-4 sm:p-5 border-l border-[#DCE3EC] lg:border-l-0">
          <div className="text-xs text-[#4E5D6C]">Aktif Teklif Hacmi (TRY)</div>
          <div className="mt-1.5 text-xl sm:text-2xl font-bold text-[#007A53] font-mono tabular-nums truncate">
            {formatCurrency(totalTryVolume, 'TRY')}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">TRY bazlı aktif dosyalar</div>
        </div>
      </section>

      {/* Aylık İhale Sayısı ve Durum Dağılımı Grafiği */}
      <MonthlyTenderSummaryChart tenders={tenders} />

      {/* Ana 2 Kolonlu Çalışma Alanı */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sol Kolon: Yaklaşan İhale Takvimi */}
        <section className="lg:col-span-8 bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#DCE3EC] flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-bold text-[#0B2239]">
                Yaklaşan İhaleler ve Takip Kodları
              </h2>
              <p className="text-xs text-[#4E5D6C] mt-0.5">
                Tarih sırasına göre yaklaşan ihale dosyalarınız
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenCalendar}
              className="min-h-[40px] px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0066B3] hover:bg-[#0066B3]/10 rounded-lg cursor-pointer whitespace-nowrap transition-colors"
            >
              <Calendar className="w-4 h-4" />
              <span>Takvimi Aç</span>
            </button>
          </div>

          {upcomingTenders.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#4E5D6C]">
              Yaklaşan tarihli aktif ihale bulunmuyor.
            </div>
          ) : (
            <div className="divide-y divide-[#DCE3EC]">
              {upcomingTenders.map((t) => {
                const diff = getDaysDifference(t.tenderDate);
                const doneCount = CHECKLIST_ITEMS.filter((i) => t.checklist?.[i.key]).length;
                const isToday = diff === 0;
                const isSoon = diff > 0 && diff <= 3;

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectTender(t)}
                    className="w-full px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left hover:bg-[#F3F6FA]/80 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span className="font-mono font-semibold text-[#0066B3] tabular-nums">
                          {t.trackingCode}
                        </span>
                        {t.ikn && (
                          <>
                            <span className="text-[#DCE3EC]" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono text-[#4E5D6C] tabular-nums">
                              İKN {t.ikn}
                            </span>
                          </>
                        )}
                        <span className="text-[#DCE3EC]" aria-hidden="true">
                          ·
                        </span>
                        <span
                          className={`font-medium ${
                            isToday
                              ? 'text-red-700'
                              : isSoon
                              ? 'text-amber-700'
                              : 'text-[#4E5D6C]'
                          }`}
                        >
                          {getRelativeDayLabel(t.tenderDate)}
                        </span>
                      </div>

                      <div className="text-sm font-semibold text-[#0B2239] truncate">
                        {t.title}
                      </div>
                      <div className="text-xs text-[#4E5D6C] truncate">{t.authority}</div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                      <div className="text-xs font-mono font-semibold text-[#0B2239] tabular-nums">
                        {formatTurkishDate(t.tenderDate)} · {t.tenderTime}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[#4E5D6C]">
                        <span>{STATUS_LABELS[t.status]}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Kontrol {doneCount}/{CHECKLIST_ITEMS.length}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Sağ Kolon: Sabit Firma Evrakları & Süre Kontrolleri */}
        <section className="lg:col-span-4 bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#DCE3EC] flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-[#0B2239]">
                Kurumsal Evrak Kasası
              </h2>
              <p className="text-xs text-[#4E5D6C] mt-0.5">
                {companyVault.length} sabit belge kayıtlı
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenVault}
              className="min-h-[40px] px-3 text-xs font-semibold text-[#0066B3] hover:bg-[#0066B3]/10 rounded-lg cursor-pointer transition-colors"
            >
              Kasayı Yönet
            </button>
          </div>

          <div className="p-5 space-y-4">
            {companyVault.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-[#4E5D6C] leading-relaxed">
                  İmza sirküleri, vergi levhası, oda kaydı ve borcu yoktur belgelerinizi bir kez
                  kasaya yükleyin; ihale günü geldiğinde tüm ihalelerde tek dokunuşla erişin.
                </p>
                <button
                  type="button"
                  onClick={onOpenVault}
                  className="w-full min-h-[44px] px-4 py-2 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                >
                  Sabit Firma Evrakı Yükle
                </button>
              </div>
            ) : (
              <>
                {expiringVaultDocs.length > 0 ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                      <FileWarning className="w-4 h-4 shrink-0" />
                      <span>Geçerlilik Tarihi Yaklaşan / Dolan Belgeler</span>
                    </div>
                    <div className="divide-y divide-[#DCE3EC] border border-[#DCE3EC] rounded-lg">
                      {expiringVaultDocs.map((d) => {
                        const diff = getDaysDifference(d.expiryDate);
                        return (
                          <div key={d.id} className="p-3 text-xs">
                            <div className="font-medium text-[#0B2239] truncate">{d.name}</div>
                            <div className="text-[#4E5D6C] mt-0.5 flex items-center gap-1.5">
                              <span>{COMPANY_VAULT_CATEGORY_LABELS[d.category]}</span>
                              <span>·</span>
                              <span
                                className={`font-mono tabular-nums font-medium ${
                                  diff < 0 ? 'text-red-700' : 'text-amber-700'
                                }`}
                              >
                                {diff < 0
                                  ? `${Math.abs(diff)} gün önce doldu`
                                  : `${diff} gün kaldı`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 text-xs text-[#007A53]">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Kasada kayıtlı kurumsal belgelerinizin geçerlilik tarihleri güncel görünüyor.
                    </span>
                  </div>
                )}

                <div className="pt-3 border-t border-[#DCE3EC] space-y-2">
                  <div className="text-xs font-medium text-[#4E5D6C]">Son Eklenen Sabit Evraklar</div>
                  {companyVault.slice(0, 4).map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 text-xs py-1"
                    >
                      <span className="text-[#0B2239] truncate">{d.name}</span>
                      <span className="text-[#4E5D6C] shrink-0 font-mono tabular-nums">
                        {d.expiryDate ? formatTurkishDate(d.expiryDate) : 'Süresiz'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="pt-3 border-t border-[#DCE3EC] flex items-center gap-2 text-xs text-[#4E5D6C]">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                Varsayılan hatırlatma: İhaleden {companyProfile?.defaultReminderDays ?? 3} gün önce
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
