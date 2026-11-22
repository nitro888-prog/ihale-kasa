import React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Zap,
  FileSpreadsheet,
  FolderLock,
  Building2,
  Plus,
  LogOut,
  Settings,
  Package,
  ShieldCheck,
  Trash2,
  Calculator,
  Briefcase,
  FileCheck2,
  Percent,
  Home,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  ActiveView,
  CompanyProfile,
  hasProjectsAccess,
  USER_ROLE_LABELS,
  UserAuthorization,
  UserPermissions,
} from '../types/tender';
import { TiniatechLogo } from './TiniatechLogo';

interface AppShellProps {
  user: User;
  userAuth: UserAuthorization;
  permissions: UserPermissions;
  pendingUsersCount?: number;
  trashCount?: number;
  companyProfile: CompanyProfile | null;
  activeView: ActiveView;
  onChangeView: (view: ActiveView) => void;
  onNewTender: () => void;
  onSignOut: () => void;
  todayTendersCount: number;
  children: React.ReactNode;
}

const VIEW_TITLES: Record<ActiveView, string> = {
  home: 'Ana Sayfa',
  overview: 'Genel Bakış',
  calendar: 'İhale Takvimi',
  'tender-day': 'İhale Günü Modu',
  tenders: 'Tüm İhaleler',
  pricing: 'Fiyat Çalışma',
  quotes: 'Teklif & Proforma',
  projects: 'Proje Yönetimi',
  products: 'Teklif Ürünleri',
  accounting: 'Ön Muhasebe',
  vault: 'Doküman Kasası',
  trash: 'Geri Dönüşüm Kutusu',
  settings: 'Firma Ayarları',
  users: 'Kullanıcı Yetkilendirme',
};

interface NavItemConfig {
  id: ActiveView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  section: 'operasyon' | 'finans' | 'kurumsal';
}

export const AppShell: React.FC<AppShellProps> = ({
  user,
  userAuth,
  permissions,
  pendingUsersCount = 0,
  trashCount = 0,
  companyProfile,
  activeView,
  onChangeView,
  onNewTender,
  onSignOut,
  todayTendersCount,
  children,
}) => {
  const isAdmin = userAuth.role === 'admin';
  const canViewProjects = hasProjectsAccess(permissions, userAuth.role);

  const navItems: NavItemConfig[] = [
    { id: 'home', label: 'Ana Sayfa', icon: Home, section: 'operasyon' },
    { id: 'overview', label: 'Genel Bakış', icon: LayoutDashboard, section: 'operasyon' },
    { id: 'calendar', label: 'İhale Takvimi', icon: CalendarDays, section: 'operasyon' },
    { id: 'tender-day', label: 'İhale Günü', icon: Zap, section: 'operasyon' },
    { id: 'tenders', label: 'Tüm İhaleler', icon: FileSpreadsheet, section: 'operasyon' },
    { id: 'pricing', label: 'Fiyat Çalışma', icon: Percent, section: 'operasyon' },
    { id: 'quotes', label: 'Teklif & Proforma', icon: FileCheck2, section: 'finans' },
    ...(canViewProjects
      ? [{ id: 'projects' as ActiveView, label: 'Proje Yönetimi', icon: Briefcase, section: 'finans' as const }]
      : []),
    { id: 'products', label: 'Teklif Ürünleri', icon: Package, section: 'finans' },
    { id: 'accounting', label: 'Ön Muhasebe', icon: Calculator, section: 'finans' },
    { id: 'vault', label: 'Doküman Kasası', icon: FolderLock, section: 'kurumsal' },
    { id: 'trash', label: 'Geri Dönüşüm Kutusu', icon: Trash2, section: 'kurumsal' },
    { id: 'settings', label: 'Firma Ayarları', icon: Building2, section: 'kurumsal' },
    ...(isAdmin
      ? [{ id: 'users' as ActiveView, label: 'Kullanıcı Yetkilendirme', icon: ShieldCheck, section: 'kurumsal' as const }]
      : []),
  ];

  const navGroups: { key: NavItemConfig['section']; title: string }[] = [
    { key: 'operasyon', title: 'İhale Operasyonu' },
    { key: 'finans', title: 'Proje & Finans' },
    { key: 'kurumsal', title: 'Kurumsal Yönetim' },
  ];

  const mobileTabs: { id: ActiveView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'home', label: 'Ana Sayfa', icon: Home },
    { id: 'calendar', label: 'Takvim', icon: CalendarDays },
    { id: 'tender-day', label: 'İhale Günü', icon: Zap },
    { id: 'tenders', label: 'İhaleler', icon: FileSpreadsheet },
    { id: 'vault', label: 'Kasa', icon: FolderLock },
  ];

  const isHome = activeView === 'home';
  const [sidebarMode, setSidebarMode] = React.useState<'fixed' | 'drawer'>('fixed');
  const [drawerOpen, setDrawerOpen] = React.useState<boolean>(false);

  React.useEffect(() => {
    setDrawerOpen(false);
  }, [activeView]);

  React.useEffect(() => {
    if (!drawerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [drawerOpen]);

  const showFixedDesktopSidebar = !isHome && sidebarMode === 'fixed';
  const showOverlayDrawer = !isHome && drawerOpen;

  const handleSelectNav = (view: ActiveView) => {
    setDrawerOpen(false);
    onChangeView(view);
  };

  const renderSidebarBody = (isOverlay: boolean) => (
    <>
      {/* Crisp White Corporate Brand Header */}
      <div className="bg-white border-b border-[#DCE3EC]">
        <div className="h-[72px] px-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => handleSelectNav('home')}
            className="flex-1 min-w-0 flex items-center text-left cursor-pointer hover:opacity-85 transition-opacity"
            title="Ana Sayfaya Dön"
          >
            <TiniatechLogo variant="sidebar" subtitle="İhale · Proje · Muhasebe" />
          </button>

          {isOverlay ? (
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Menüyü Kapat"
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-[#DCE3EC] text-[#0B2239] hover:bg-[#F3F6FA] cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSidebarMode('drawer');
                setDrawerOpen(false);
              }}
              title="Sol menüyü açılır pencere moduna al"
              aria-label="Sol menüyü açılır pencere moduna al"
              className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg border border-[#DCE3EC] text-[#4E5D6C] hover:text-[#0B2239] hover:bg-[#F3F6FA] cursor-pointer shrink-0 transition-colors"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="h-[3px] w-full bg-gradient-to-r from-[#00AEEF] via-[#0066B3] to-[#007A53]" />
      </div>

      {isOverlay && (
        <div className="hidden lg:flex px-3 pt-3">
          <button
            type="button"
            onClick={() => {
              setSidebarMode('fixed');
              setDrawerOpen(false);
            }}
            className="w-full min-h-[36px] px-3 inline-flex items-center justify-center gap-2 rounded-lg border border-[#1E4063] bg-[#143252]/70 hover:bg-[#143252] text-xs font-medium text-slate-200 cursor-pointer transition-colors"
          >
            <PanelLeftOpen className="w-3.5 h-3.5 text-[#7DD3FC]" />
            <span>Sol Menüyü Sabitle</span>
          </button>
        </div>
      )}

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto" aria-label="Ana Menü">
        {navGroups.map((group) => {
          const items = navItems.filter((item) => item.section === group.key);
          if (items.length === 0) return null;
          return (
            <div key={group.key} className="space-y-1">
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                {group.title}
              </div>
              {items.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectNav(item.id)}
                    className={`w-full min-h-[42px] px-3 py-2 rounded-lg flex items-center justify-between text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap relative ${
                      active
                        ? 'bg-[#0066B3] text-white font-semibold shadow-2xs'
                        : 'text-slate-300 hover:bg-[#143252] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          active ? 'text-[#7DD3FC]' : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.id === 'tender-day' && todayTendersCount > 0 && (
                      <span className="text-xs font-mono font-bold text-[#FBBF24] tabular-nums">
                        {todayTendersCount}
                      </span>
                    )}
                    {item.id === 'trash' && trashCount > 0 && (
                      <span className="text-xs font-mono font-semibold text-slate-300 tabular-nums">
                        {trashCount}
                      </span>
                    )}
                    {item.id === 'users' && pendingUsersCount > 0 && (
                      <span className="text-xs font-mono font-bold text-[#FBBF24] tabular-nums">
                        {pendingUsersCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#143252] bg-[#081A2C] space-y-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white truncate">
            {userAuth.displayName || companyProfile?.companyName || user.displayName || 'Firma Hesabı'}
          </div>
          <div className="text-[11px] text-[#34D399] font-medium truncate">
            {USER_ROLE_LABELS[userAuth.role]}
            {userAuth.department ? ` · ${userAuth.department}` : ''}
          </div>
          <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="w-full min-h-[38px] px-3 inline-flex items-center justify-center gap-2 border border-[#1E4063] hover:bg-[#143252] text-slate-200 text-xs font-medium rounded-lg cursor-pointer transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Oturumu Kapat</span>
        </button>
      </div>
    </>
  );

  return (
    <div
      className={`bg-[#F3F6FA] text-[#0B2239] flex flex-col lg:flex-row ${
        isHome ? 'min-h-dvh lg:h-dvh lg:overflow-hidden' : 'min-h-screen'
      }`}
    >
      {/* Desktop Fixed Sidebar (Only on non-home module views when pinned) */}
      {showFixedDesktopSidebar && (
        <aside className="hidden lg:flex lg:w-[264px] lg:flex-col lg:fixed lg:inset-y-0 bg-[#0B2239] text-white border-r border-[#143252] z-20">
          {renderSidebarBody(false)}
        </aside>
      )}

      {/* Overlay Drawer Sidebar (Açılır Pencere Modu on desktop or mobile when inside a module) */}
      {showOverlayDrawer && (
        <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="İşlem Menüsü">
          <div
            className="fixed inset-0 bg-[#0B2239]/45 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-[280px] max-w-[85vw] h-full flex flex-col bg-[#0B2239] text-white border-r border-[#143252] shadow-2xl z-10">
            {renderSidebarBody(true)}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div
        className={`flex-1 flex flex-col min-w-0 ${
          isHome ? 'min-h-dvh lg:h-full' : 'min-h-screen'
        } ${
          showFixedDesktopSidebar ? 'lg:pl-[264px]' : ''
        }`}
      >
        {/* Desktop Top Header */}
        <header className="hidden lg:flex shrink-0 h-[75px] px-6 lg:px-8 bg-white border-b border-[#DCE3EC] items-center justify-between gap-6 sticky top-0 z-10">
          <div className="flex items-center gap-3 text-sm whitespace-nowrap shrink-0">
            {!isHome && sidebarMode === 'drawer' && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="min-h-[38px] px-3 inline-flex items-center gap-2 bg-[#F3F6FA] hover:bg-[#DCE3EC]/60 border border-[#DCE3EC] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
              >
                <PanelLeftOpen className="w-4 h-4 text-[#0066B3]" />
                <span>Menü</span>
              </button>
            )}

            {isHome ? (
              <TiniatechLogo variant="inline" subtitle="İhaleKasa · Ana Sayfa" />
            ) : (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onChangeView('home')}
                  className="text-xs font-bold uppercase tracking-[0.12em] text-[#0066B3] hover:underline cursor-pointer"
                  title="Ana Sayfaya Dön"
                >
                  TINIATECH
                </button>
                <span className="text-[#DCE3EC]" aria-hidden="true">
                  /
                </span>
                <span className="text-xs font-medium text-[#4E5D6C]">İhaleKasa</span>
                <span className="text-[#DCE3EC]" aria-hidden="true">
                  /
                </span>
                <h1 className="font-display text-base font-bold text-[#0B2239]">
                  {VIEW_TITLES[activeView]}
                </h1>
              </div>
            )}
          </div>

          <div className="text-xs font-medium text-[#4E5D6C] truncate">
            {companyProfile?.companyName || 'Tiniatech Kurumsal İhale, Proje ve Ön Muhasebe Alanı'}
          </div>

          <div className="shrink-0 flex items-center gap-2.5">
            {!isHome && (
              <button
                type="button"
                onClick={() => onChangeView('home')}
                className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                <Home className="w-3.5 h-3.5 text-[#0066B3]" />
                <span>Ana Sayfa</span>
              </button>
            )}
            {permissions.canCreateTender ? (
              <button
                type="button"
                onClick={onNewTender}
                className="min-h-[40px] px-4 py-2 inline-flex items-center gap-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Yeni İhale</span>
              </button>
            ) : (
              <span className="text-xs font-medium text-[#4E5D6C] whitespace-nowrap">
                {USER_ROLE_LABELS[userAuth.role]}
              </span>
            )}
            {isHome && (
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 text-[#4E5D6C]" />
                <span>Oturumu Kapat</span>
              </button>
            )}
          </div>
        </header>

        {/* Mobile Top Bar */}
        <header className="lg:hidden bg-[#0B2239] text-white border-b-2 border-[#007A53]">
          <div className="px-4 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {!isHome && (
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  aria-label="İşlem Menüsünü Aç"
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center border border-[#1E4063] bg-[#143252] text-white rounded-lg cursor-pointer shrink-0"
                >
                  <Menu className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onChangeView('home')}
                className="cursor-pointer shrink-0"
                aria-label="Ana Sayfa"
              >
                <TiniatechLogo variant="compact" />
              </button>
              <div className="min-w-0">
                <div className="font-display text-sm font-bold tracking-tight text-white truncate">
                  {VIEW_TITLES[activeView]}
                </div>
                <div className="text-[10px] text-slate-300 truncate">
                  {companyProfile?.companyName || 'İhaleKasa Kurumsal'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {permissions.canCreateTender && (
                <button
                  type="button"
                  onClick={onNewTender}
                  className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden min-[380px]:inline">Yeni İhale</span>
                  <span className="min-[380px]:hidden">Yeni</span>
                </button>
              )}
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Oturumu Kapat"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center border border-[#1E4063] text-slate-200 hover:bg-[#143252] rounded-lg cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!isHome && (
            <div className="px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => onChangeView('overview')}
                className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 border rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  activeView === 'overview'
                    ? 'border-[#00AEEF] bg-[#0066B3] text-white'
                    : 'border-[#1E4063] text-slate-200 hover:bg-[#143252]'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Genel Bakış</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeView('pricing')}
                className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 border rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  activeView === 'pricing'
                    ? 'border-[#00AEEF] bg-[#0066B3] text-white'
                    : 'border-[#1E4063] text-slate-200 hover:bg-[#143252]'
                }`}
              >
                <Percent className="w-3.5 h-3.5" />
                <span>Fiyat Çalışma</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeView('quotes')}
                className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 border rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  activeView === 'quotes'
                    ? 'border-[#00AEEF] bg-[#0066B3] text-white'
                    : 'border-[#1E4063] text-slate-200 hover:bg-[#143252]'
                }`}
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>Teklifler</span>
              </button>
              {canViewProjects && (
                <button
                  type="button"
                  onClick={() => onChangeView('projects')}
                  className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 border rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                    activeView === 'projects'
                      ? 'border-[#00AEEF] bg-[#0066B3] text-white'
                      : 'border-[#1E4063] text-slate-200 hover:bg-[#143252]'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Projeler</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onChangeView('products')}
                className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 border rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  activeView === 'products'
                    ? 'border-[#00AEEF] bg-[#0066B3] text-white'
                    : 'border-[#1E4063] text-slate-200 hover:bg-[#143252]'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Ürünler</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeView('accounting')}
                className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 border rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  activeView === 'accounting'
                    ? 'border-[#00AEEF] bg-[#0066B3] text-white'
                    : 'border-[#1E4063] text-slate-200 hover:bg-[#143252]'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Ön Muhasebe</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeView('trash')}
                className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 border rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  activeView === 'trash'
                    ? 'border-[#00AEEF] bg-[#0066B3] text-white'
                    : 'border-[#1E4063] text-slate-200 hover:bg-[#143252]'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Çöp ({trashCount})</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeView('settings')}
                className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 border rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  activeView === 'settings'
                    ? 'border-[#00AEEF] bg-[#0066B3] text-white'
                    : 'border-[#1E4063] text-slate-200 hover:bg-[#143252]'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Ayarlar</span>
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onChangeView('users')}
                  className={`min-h-[34px] px-2.5 inline-flex items-center gap-1.5 border rounded-lg text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                    activeView === 'users'
                      ? 'border-[#00AEEF] bg-[#0066B3] text-white'
                      : 'border-[#1E4063] text-slate-200 hover:bg-[#143252]'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Yetkiler{pendingUsersCount > 0 ? ` (${pendingUsersCount})` : ''}</span>
                </button>
              )}
            </div>
          )}
        </header>

        {/* Main Viewport */}
        <main
          className={`flex-1 w-full mx-auto ${
            isHome
              ? 'p-0 max-w-none min-h-0 flex flex-col lg:overflow-hidden'
              : activeView === 'pricing'
              ? 'pb-24 lg:pb-10 p-3 sm:p-4 lg:p-5 max-w-none'
              : 'pb-24 lg:pb-10 p-4 sm:p-6 lg:p-8 max-w-7xl'
          }`}
        >
          {children}
        </main>
      </div>

      {/* Mobile Fixed Bottom Tab Bar (Hidden on Ana Sayfa) */}
      {!isHome && (
        <nav
          aria-label="Mobil Alt Menü"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-16 pb-safe bg-white/95 backdrop-blur-md border-t border-[#DCE3EC] grid grid-cols-5 items-center"
        >
          {mobileTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChangeView(tab.id)}
                className={`h-full min-h-[44px] flex flex-col items-center justify-center gap-1 cursor-pointer relative ${
                  active ? 'text-[#0066B3] font-semibold' : 'text-[#4E5D6C]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] tracking-tight whitespace-nowrap">{tab.label}</span>
                {tab.id === 'tender-day' && todayTendersCount > 0 && (
                  <span className="absolute top-1.5 right-3 text-[10px] font-mono font-bold text-red-700 tabular-nums">
                    {todayTendersCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
};
