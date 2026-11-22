import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowUpRight,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  FileCheck2,
  FileSpreadsheet,
  FolderLock,
  LayoutDashboard,
  Package,
  Percent,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react';
import { getAuthBearerHeaders } from '../lib/firebase';
import { formatTurkishDate, getTodayDateStr } from '../lib/trackingAndCalendar';
import homeBackdropUrl from '../assets/images/home_backdrop_final_1795254079778.jpg';
import {
  ActiveView,
  CompanyProfile,
  hasProjectsAccess,
  USER_ROLE_LABELS,
  UserAuthorization,
  UserPermissions,
} from '../types/tender';

interface HomeViewProps {
  user: User;
  userAuth: UserAuthorization;
  permissions: UserPermissions;
  companyProfile: CompanyProfile | null;
  todayTendersCount: number;
  activeTendersCount: number;
  totalTendersCount: number;
  pricingCount: number;
  quotesCount: number;
  projectsCount: number;
  productsCount: number;
  accountingCount: number;
  vaultCount: number;
  trashCount: number;
  pendingUsersCount: number;
  onNavigate: (view: ActiveView) => void;
  onOpenTenderDay: () => void;
}

interface HomeModuleCard {
  id: ActiveView;
  title: string;
  description: string;
  metricLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}

export const HomeView: React.FC<HomeViewProps> = ({
  user,
  userAuth,
  permissions,
  companyProfile,
  todayTendersCount,
  activeTendersCount,
  totalTendersCount,
  pricingCount,
  quotesCount,
  projectsCount,
  productsCount,
  accountingCount,
  vaultCount,
  trashCount,
  pendingUsersCount,
  onNavigate,
  onOpenTenderDay,
}) => {
  const [backdropFailed, setBackdropFailed] = useState(false);
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [ipLoading, setIpLoading] = useState<boolean>(true);
  const [ipError, setIpError] = useState<boolean>(false);

  const fetchClientIp = useCallback(async () => {
    setIpLoading(true);
    setIpError(false);
    try {
      let headers = await getAuthBearerHeaders();
      let res = await fetch('/ihale/api/session/client-ip', { headers });
      if (res.status === 401) {
        headers = await getAuthBearerHeaders(true);
        res = await fetch('/ihale/api/session/client-ip', { headers });
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { ip?: unknown };
      const parsedIp = typeof data.ip === 'string' ? data.ip.trim() : '';
      if (!parsedIp) {
        throw new Error('Boş IP yanıtı');
      }
      setClientIp(parsedIp);
    } catch {
      setIpError(true);
      setClientIp(null);
    } finally {
      setIpLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let headers = await getAuthBearerHeaders();
        let res = await fetch('/ihale/api/session/client-ip', { headers });
        if (res.status === 401) {
          headers = await getAuthBearerHeaders(true);
          res = await fetch('/ihale/api/session/client-ip', { headers });
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as { ip?: unknown };
        const parsedIp = typeof data.ip === 'string' ? data.ip.trim() : '';
        if (!cancelled) {
          setClientIp(parsedIp || null);
          setIpError(!parsedIp);
        }
      } catch {
        if (!cancelled) {
          setIpError(true);
          setClientIp(null);
        }
      } finally {
        if (!cancelled) {
          setIpLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user.uid]);

  const todayStr = getTodayDateStr();
  const displayName =
    userAuth.displayName?.trim() ||
    user.displayName?.trim() ||
    user.email?.split('@')[0] ||
    'Yetkili Kullanıcı';
  const roleLabel = USER_ROLE_LABELS[userAuth.role];
  const isAdmin = userAuth.role === 'admin';
  const canViewProjects = hasProjectsAccess(permissions, userAuth.role);

  const moduleCards: HomeModuleCard[] = useMemo(() => {
    const cards: HomeModuleCard[] = [
      {
        id: 'overview',
        title: 'Genel Bakış',
        description: 'Aktif ihaleler, aylık grafikler ve yaklaşan teslim tarihleri',
        metricLabel: `${activeTendersCount} aktif`,
        icon: LayoutDashboard,
        accentClass: 'text-[#0066B3]',
      },
      {
        id: 'tender-day',
        title: 'İhale Günü Modu',
        description: 'Bugünkü ihalelerde onaylı şartname ve evraklara hızlı erişim',
        metricLabel: todayTendersCount > 0 ? `${todayTendersCount} bugün` : undefined,
        icon: Zap,
        accentClass: todayTendersCount > 0 ? 'text-[#007A53]' : 'text-[#0066B3]',
      },
      {
        id: 'tenders',
        title: 'Tüm İhaleler',
        description: 'İhale dosyaları, kontrol listesi, şartname AI analizi',
        metricLabel: `${totalTendersCount} dosya`,
        icon: FileSpreadsheet,
        accentClass: 'text-[#0066B3]',
      },
      {
        id: 'calendar',
        title: 'İhale Takvimi',
        description: 'Aylık ihale programı ve tarih bazlı dosya planlaması',
        icon: CalendarDays,
        accentClass: 'text-[#0066B3]',
      },
      {
        id: 'pricing',
        title: 'Fiyat Çalışma',
        description: 'Kalem bazlı maliyet, kâr, teslim ve 180 gün KDV finansmanı',
        metricLabel: `${pricingCount} cetvel`,
        icon: Percent,
        accentClass: 'text-[#0066B3]',
      },
      {
        id: 'quotes',
        title: 'Teklif & Proforma',
        description: 'Özel sektör teklif mektupları ve proforma fatura çıktıları',
        metricLabel: `${quotesCount} belge`,
        icon: FileCheck2,
        accentClass: 'text-[#0066B3]',
      },
      ...(canViewProjects
        ? [
            {
              id: 'projects' as ActiveView,
              title: 'Proje Yönetimi',
              description: 'Sözleşme, hakediş, proje fatura ve kârlılık takibi',
              metricLabel: `${projectsCount} proje`,
              icon: Briefcase,
              accentClass: 'text-[#007A53]',
            },
          ]
        : []),
      {
        id: 'products',
        title: 'Teklif Ürünleri',
        description: 'Malzeme kartları, stok/parça kodları ve tedarikçi fiyatları',
        metricLabel: `${productsCount} ürün`,
        icon: Package,
        accentClass: 'text-[#0066B3]',
      },
      {
        id: 'accounting',
        title: 'Ön Muhasebe',
        description: 'Fatura kayıtları, PDF fatura okuma, cari hesaplar ve çekler',
        metricLabel: `${accountingCount} kayıt`,
        icon: Calculator,
        accentClass: 'text-[#0066B3]',
      },
      {
        id: 'vault',
        title: 'Doküman Kasası',
        description: 'İmza sirküleri, vergi levhası ve geçerlilik izlemeli evraklar',
        metricLabel: `${vaultCount} evrak`,
        icon: FolderLock,
        accentClass: 'text-[#0066B3]',
      },
      {
        id: 'settings',
        title: 'Firma Ayarları',
        description: 'Kurumsal ünvan, vergi bilgileri ve sabah bildirim tercihleri',
        icon: Building2,
        accentClass: 'text-[#4E5D6C]',
      },
      ...(isAdmin
        ? [
            {
              id: 'users' as ActiveView,
              title: 'Kullanıcı Yetkilendirme',
              description: 'Personel davetleri, rol yönetimi ve modül erişim izinleri',
              metricLabel: pendingUsersCount > 0 ? `${pendingUsersCount} bekleyen` : undefined,
              icon: ShieldCheck,
              accentClass: 'text-[#0066B3]',
            },
          ]
        : [
            {
              id: 'trash' as ActiveView,
              title: 'Geri Dönüşüm Kutusu',
              description: 'Silinen dosya ve kayıtları inceleme veya geri yükleme',
              metricLabel: trashCount > 0 ? `${trashCount} öğe` : undefined,
              icon: Trash2,
              accentClass: 'text-[#4E5D6C]',
            },
          ]),
    ];

    return cards;
  }, [
    activeTendersCount,
    todayTendersCount,
    totalTendersCount,
    pricingCount,
    quotesCount,
    canViewProjects,
    projectsCount,
    productsCount,
    accountingCount,
    vaultCount,
    isAdmin,
    pendingUsersCount,
    trashCount,
  ]);

  return (
    <div className="relative flex-1 min-h-[calc(100dvh-60px)] lg:min-h-0 lg:h-full lg:overflow-hidden w-full overflow-x-clip bg-gradient-to-br from-[#D9DDE1] via-[#CBCFD4] to-[#BDC3CA]">
      {/* Tam Ekran Kurumsal Arka Plan Görseli (Sol Üstte TINIATECH Logosu ve Sağ Üstte Atatürk Portresi) */}
      {!backdropFailed && (
        <img
          src={homeBackdropUrl}
          alt="Tiniatech Kurumsal Arka Plan"
          referrerPolicy="no-referrer"
          onError={() => setBackdropFailed(true)}
          className="absolute inset-0 w-full h-full object-cover object-top select-none pointer-events-none"
        />
      )}

      {/* Yalnızca alt modül kuşağı arkasında hafif okunabilirlik geçişi; fotoğrafın logo ve portresi tamamen net */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[44%] bg-gradient-to-t from-[#C7CDD4]/55 via-[#D5DBE1]/20 to-transparent pointer-events-none"
      />

      {/* Ana İçerik Katmanı — Fotoğraftaki Logo ve Atatürk Portresi Üst/Orta Alanda Açık, Modüller Altta */}
      <div className="relative z-10 min-h-full lg:h-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-3 lg:py-4 flex flex-col justify-end gap-3">
        {/* Alt Kuşak: Oransal Olarak Büyütülmüş Modül Kartları + Sağ Alt Kullanıcı/Yetki/IP Şeridi */}
        <div className="space-y-3 mt-auto">
          <section aria-label="Modül Kısayolları">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 lg:gap-3">
              {moduleCards.map((card) => {
                const Icon = card.icon;
                const isTodayAlert = card.id === 'tender-day' && todayTendersCount > 0;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() =>
                      card.id === 'tender-day' && todayTendersCount > 0
                        ? onOpenTenderDay()
                        : onNavigate(card.id)
                    }
                    className={`group backdrop-blur-md border rounded-xl p-3 sm:p-3.5 lg:min-h-[98px] xl:min-h-[110px] text-left flex flex-col justify-between gap-2 shadow-sm hover:shadow-md transition-all duration-150 hover:-translate-y-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066B3] ${
                      isTodayAlert
                        ? 'bg-emerald-50/92 hover:bg-white border-[#007A53]/45 hover:border-[#007A53]'
                        : 'bg-white/88 hover:bg-white/98 border-[#DCE3EC] hover:border-[#0066B3]/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`w-9 h-9 lg:w-10 lg:h-10 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                          isTodayAlert
                            ? 'bg-[#007A53]/12 border-[#007A53]/25'
                            : 'bg-[#F3F6FA] border-[#DCE3EC] group-hover:bg-[#EBF3FB] group-hover:border-[#0066B3]/30'
                        }`}
                      >
                        <Icon className={`w-5 h-5 shrink-0 ${card.accentClass}`} />
                      </span>
                      <div className="flex items-center gap-1 min-w-0">
                        {card.metricLabel && (
                          <span
                            className={`text-xs font-mono font-bold tabular-nums whitespace-nowrap ${
                              isTodayAlert ? 'text-[#007A53]' : 'text-[#4E5D6C]'
                            }`}
                          >
                            {card.metricLabel}
                          </span>
                        )}
                        <ArrowUpRight className="w-4 h-4 text-[#4E5D6C] opacity-60 group-hover:opacity-100 group-hover:text-[#0066B3] transition-opacity shrink-0" />
                      </div>
                    </div>

                    <div className="space-y-1 min-w-0">
                      <h3 className="font-display text-sm lg:text-[15px] font-bold text-[#0B2239] group-hover:text-[#0066B3] transition-colors truncate">
                        {card.title}
                      </h3>
                      <p
                        className="text-[11px] lg:text-xs text-[#4E5D6C] leading-snug line-clamp-2"
                        title={card.description}
                      >
                        {card.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Sağ Alt Köşe: Kullanıcı Adı, Yetki ve Gerçek IP Adresi */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-[11px] font-semibold text-[#0B2239]/80 bg-white/75 backdrop-blur-sm border border-white/80 rounded-lg px-3 py-1.5 hidden sm:inline-flex items-center gap-2">
              <span>{formatTurkishDate(todayStr)}</span>
              <span aria-hidden="true">·</span>
              <span>{companyProfile?.companyName || 'Tiniatech Kurumsal Portal'}</span>
            </div>

            <aside
              aria-label="Aktif Oturum ve IP Bilgisi"
              className="ml-auto bg-white/92 backdrop-blur-md border border-[#DCE3EC] rounded-xl px-4 py-2 shadow-sm flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1 text-xs max-w-full"
            >
              <span className="font-bold text-[#0B2239] truncate max-w-[220px]">
                {displayName}
              </span>
              <span className="text-[#DCE3EC]" aria-hidden="true">
                ·
              </span>
              <span className="font-semibold text-[#0066B3] whitespace-nowrap">
                {roleLabel}
              </span>
              <span className="text-[#DCE3EC]" aria-hidden="true">
                |
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#4E5D6C]">
                <span>IP:</span>
                <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
                  {ipLoading
                    ? 'Alınıyor…'
                    : ipError || !clientIp
                    ? 'Tespit edilemedi'
                    : clientIp}
                </span>
                <button
                  type="button"
                  onClick={fetchClientIp}
                  disabled={ipLoading}
                  title="IP adresini yenile"
                  aria-label="IP adresini yenile"
                  className="p-0.5 text-[#4E5D6C] hover:text-[#0066B3] rounded cursor-pointer disabled:opacity-40 transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${ipLoading ? 'animate-spin' : ''}`} />
                </button>
              </span>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};

