import React, { useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  MailPlus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  FULL_PERMISSIONS,
  hasAccountingAccess,
  hasPricingAccess,
  hasProjectsAccess,
  hasQuotesAccess,
  PERMISSION_LABELS,
  ROLE_DEFAULT_PERMISSIONS,
  SCHEMA_LIMITS,
  USER_ROLE_DESCRIPTIONS,
  USER_ROLE_LABELS,
  USER_STATUS_LABELS,
  UserAuthStatus,
  UserAuthorization,
  UserInvite,
  UserPermissions,
  UserRole,
} from '../types/tender';
import {
  createUserInvite,
  deleteUserAuthorization,
  deleteUserInvite,
  updateUserAuthorization,
} from '../services/firestoreService';

interface UserManagementViewProps {
  currentUser: UserAuthorization;
  workspaceOwnerId: string;
  users: UserAuthorization[];
  invites: UserInvite[];
  onSyncWorkspace: () => Promise<number>;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  currentUser,
  workspaceOwnerId,
  users,
  invites,
  onSyncWorkspace,
}) => {
  // Invite Form State
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteDept, setInviteDept] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('ihale_sorumlusu');
  const [invitePerms, setInvitePerms] = useState<UserPermissions>({
    ...ROLE_DEFAULT_PERMISSIONS.ihale_sorumlusu,
  });
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<UserAuthorization | null>(null);
  const [editName, setEditName] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('ihale_sorumlusu');
  const [editStatus, setEditStatus] = useState<UserAuthStatus>('active');
  const [editPerms, setEditPerms] = useState<UserPermissions>({
    ...ROLE_DEFAULT_PERMISSIONS.ihale_sorumlusu,
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Sync feedback
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);

  const stats = useMemo(() => {
    const active = users.filter((u) => u.status === 'active').length;
    const pending = users.filter((u) => u.status === 'pending').length;
    const pendingInvites = invites.filter((i) => i.status === 'pending_claim').length;
    return {
      total: users.length,
      active,
      pending,
      pendingInvites,
    };
  }, [users, invites]);

  const managerUids = useMemo(() => {
    const admins = users
      .filter((u) => u.role === 'admin' && u.status === 'active')
      .map((u) => u.uid);
    return Array.from(new Set([workspaceOwnerId, currentUser.uid, ...admins]));
  }, [users, workspaceOwnerId, currentUser.uid]);

  const handleSelectInviteRole = (nextRole: UserRole) => {
    setInviteRole(nextRole);
    setInvitePerms({ ...ROLE_DEFAULT_PERMISSIONS[nextRole] });
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = inviteEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setInviteError('Geçerli bir kurumsal e-posta adresi girin.');
      return;
    }
    setInviteSaving(true);
    setInviteError(null);
    try {
      await createUserInvite(currentUser.uid, workspaceOwnerId, {
        email: cleanEmail,
        displayName: inviteName,
        department: inviteDept,
        role: inviteRole,
        permissions: invitePerms,
      });
      setInviteEmail('');
      setInviteName('');
      setInviteDept('');
      setInviteRole('ihale_sorumlusu');
      setInvitePerms({ ...ROLE_DEFAULT_PERMISSIONS.ihale_sorumlusu });
      setInviteOpen(false);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Davet oluşturulamadı.');
    } finally {
      setInviteSaving(false);
    }
  };

  const openEditModal = (u: UserAuthorization) => {
    setEditingUser(u);
    setEditName(u.displayName || '');
    setEditDept(u.department || '');
    setEditRole(u.role);
    setEditStatus(u.status);
    setEditPerms(
      u.role === 'admin'
        ? { ...FULL_PERMISSIONS }
        : {
            ...u.permissions,
            canManageAccounting: hasAccountingAccess(u.permissions, u.role),
            canViewProjects: hasProjectsAccess(u.permissions, u.role),
            canManageQuotes: hasQuotesAccess(u.permissions, u.role),
            canManagePricing: hasPricingAccess(u.permissions, u.role),
          }
    );
    setEditError(null);
  };

  const handleQuickApprove = async (u: UserAuthorization) => {
    await updateUserAuthorization(
      currentUser.uid,
      workspaceOwnerId,
      u,
      {
        displayName: u.displayName,
        department: u.department || 'İhale Birimi',
        role: 'ihale_sorumlusu',
        status: 'active',
        permissions: { ...ROLE_DEFAULT_PERMISSIONS.ihale_sorumlusu },
      },
      managerUids
    );
    await onSyncWorkspace();
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await updateUserAuthorization(
        currentUser.uid,
        workspaceOwnerId,
        editingUser,
        {
          displayName: editName,
          department: editDept,
          role: editRole,
          status: editStatus,
          permissions: editPerms,
        },
        managerUids
      );
      setEditingUser(null);
      await onSyncWorkspace();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Yetki güncellenemedi.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncFeedback(null);
    try {
      const updatedCount = await onSyncWorkspace();
      setSyncFeedback(
        updatedCount > 0
          ? `${updatedCount} kaydın erişim listesi güncellendi.`
          : 'Tüm ihale ve kasa kayıtları zaten güncel.'
      );
      setTimeout(() => setSyncFeedback(null), 3500);
    } finally {
      setSyncing(false);
    }
  };

  const countPermissions = (u: UserAuthorization): number => {
    if (u.role === 'admin') return PERMISSION_LABELS.length;
    return PERMISSION_LABELS.filter((p) => {
      if (p.key === 'canManageAccounting') return hasAccountingAccess(u.permissions, u.role);
      if (p.key === 'canViewProjects') return hasProjectsAccess(u.permissions, u.role);
      if (p.key === 'canManageQuotes') return hasQuotesAccess(u.permissions, u.role);
      if (p.key === 'canManagePricing') return hasPricingAccess(u.permissions, u.role);
      return u.permissions?.[p.key];
    }).length;
  };

  return (
    <div className="space-y-6">
      {/* Üst KPI Şeridi */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#DCE3EC]">
        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">Kayıtlı Kullanıcı</div>
          <div className="mt-1.5 text-2xl font-bold text-[#0B2239] font-mono tabular-nums">
            {stats.total}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">Panel hesabı bulunanlar</div>
        </div>

        <div className="p-4 sm:p-5 border-l border-[#DCE3EC] lg:border-l-0">
          <div className="text-xs text-[#4E5D6C]">Aktif Yetkili</div>
          <div className="mt-1.5 text-2xl font-bold text-[#007A53] font-mono tabular-nums">
            {stats.active}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">Çalışma alanına erişebilir</div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-xs text-[#4E5D6C]">Onay Bekleyen</div>
          <div
            className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${
              stats.pending > 0 ? 'text-amber-700' : 'text-[#0B2239]'
            }`}
          >
            {stats.pending}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">İlk giriş yapmış bekleyenler</div>
        </div>

        <div className="p-4 sm:p-5 border-l border-[#DCE3EC] lg:border-l-0">
          <div className="text-xs text-[#4E5D6C]">Bekleyen Ön Davet</div>
          <div className="mt-1.5 text-2xl font-bold text-[#0066B3] font-mono tabular-nums">
            {stats.pendingInvites}
          </div>
          <div className="mt-1 text-xs text-[#4E5D6C]">E-posta ön yetkilendirme</div>
        </div>
      </section>

      {/* Araç Çubuğu */}
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#0066B3] shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-base font-bold text-[#0B2239]">
              Kullanıcı Yetkilendirme ve Rol Yönetimi
            </h2>
            <p className="text-xs text-[#4E5D6C] mt-0.5">
              Ekip üyelerinize e-posta ile ön yetki tanımlayın veya panele giriş yapan kullanıcıların rol ve modül izinlerini belirleyin.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={syncing}
            className="min-h-[44px] px-3.5 inline-flex items-center gap-2 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-[#0066B3] ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Senkronize Ediliyor…' : 'Erişimleri Senkronize Et'}</span>
          </button>

          <button
            type="button"
            onClick={() => setInviteOpen((v) => !v)}
            className="min-h-[44px] px-4 inline-flex items-center gap-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Yeni Kullanıcı Yetkilendir</span>
          </button>
        </div>
      </div>

      {syncFeedback && (
        <div className="p-3.5 bg-white border border-[#007A53] rounded-lg text-xs font-medium text-[#007A53] flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* Harici Gmail Erişimi ve 403 Kontrol Rehberi */}
      <div className="bg-[#F8FAFC] border border-[#DCE3EC] rounded-xl p-4 text-xs text-[#4E5D6C] space-y-1.5">
        <div className="font-semibold text-[#0B2239]">
          Ekip Üyeleri İçin Giriş &amp; 403 Erişim Notu
        </div>
        <p className="leading-relaxed">
          Yetki verdiğiniz Gmail hesapları uygulamayı açarken <strong className="text-[#0B2239]">403 Forbidden</strong> hatası
          alıyorsa: (1) geliştirme adresi (<span className="font-mono">ais-dev-...</span>) yerine üst menüdeki{' '}
          <strong className="text-[#0B2239]">Paylaş (Share)</strong> bölümünden alınan{' '}
          <span className="font-mono">ais-pre-...</span> linkini gönderin ve o Gmail adresini Paylaşım listesine ekleyin;
          (2) Google ile giriş penceresinde alan adı uyarısı çıkarsa Firebase Console &gt; Authentication &gt; Authorized
          Domains listesinde paylaşılan alan adının bulunduğunu doğrulayın.
        </p>
      </div>

      {/* E-Posta Ön Yetkilendirme Formu */}
      {inviteOpen && (
        <form
          onSubmit={handleCreateInvite}
          className="bg-white border border-[#0066B3] rounded-xl overflow-hidden"
        >
          <div className="px-5 py-4 bg-[#0B2239] text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <MailPlus className="w-4 h-4 text-[#34D399]" />
              <h3 className="font-display text-sm font-bold text-white">
                E-Posta ile Ön Yetkilendirme Daveti
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              aria-label="Formu Kapat"
              className="text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                  Kurumsal E-Posta *
                </label>
                <input
                  type="email"
                  required
                  maxLength={SCHEMA_LIMITS.EMAIL_MAX}
                  placeholder="ornek@firma.com.tr"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                  Ad Soyad
                </label>
                <input
                  type="text"
                  maxLength={SCHEMA_LIMITS.PERSON_MAX}
                  placeholder="Örn: Ahmet Demir"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                  Birim / Departman
                </label>
                <input
                  type="text"
                  maxLength={SCHEMA_LIMITS.DEPARTMENT_MAX}
                  placeholder="Örn: Teklif & İhale"
                  value={inviteDept}
                  onChange={(e) => setInviteDept(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                  Kullanıcı Rolü
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => handleSelectInviteRole(e.target.value as UserRole)}
                  className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                >
                  {(Object.keys(USER_ROLE_LABELS) as UserRole[]).map((r) => (
                    <option key={r} value={r}>
                      {USER_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#4E5D6C]">
              <strong className="text-[#0B2239]">{USER_ROLE_LABELS[inviteRole]}:</strong>{' '}
              {USER_ROLE_DESCRIPTIONS[inviteRole]}
            </div>

            <div>
              <div className="text-xs font-semibold text-[#0B2239] mb-2">
                Modül Bazlı İşlem İzinleri
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {PERMISSION_LABELS.map((perm) => {
                  const checked =
                    inviteRole === 'admin' ? true : Boolean(invitePerms[perm.key]);
                  return (
                    <label
                      key={perm.key}
                      className={`p-3 border rounded-lg flex items-start gap-2.5 cursor-pointer transition-colors ${
                        checked
                          ? 'border-[#0066B3] bg-[#0066B3]/5'
                          : 'border-[#DCE3EC] bg-white'
                      } ${inviteRole === 'admin' ? 'opacity-75 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={inviteRole === 'admin'}
                        onChange={(e) =>
                          setInvitePerms((prev) => ({
                            ...prev,
                            [perm.key]: e.target.checked,
                          }))
                        }
                        className="mt-0.5 w-4 h-4 accent-[#0066B3]"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#0B2239]">
                          {perm.label}
                        </div>
                        <div className="text-[11px] text-[#4E5D6C] mt-0.5 leading-snug">
                          {perm.hint}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {inviteError && (
              <p className="text-xs text-red-700 font-medium" role="alert">
                {inviteError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#DCE3EC]">
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="min-h-[42px] px-4 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={inviteSaving}
                className="min-h-[42px] px-5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60"
              >
                {inviteSaving ? 'Kaydediliyor…' : 'Ön Yetkiyi Tanımla'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Kayıtlı Kullanıcılar Listesi */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#DCE3EC] flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-sm font-bold text-[#0B2239]">
              Kayıtlı Kullanıcılar ve Yetki Matrisi ({users.length})
            </h3>
            <p className="text-xs text-[#4E5D6C] mt-0.5">
              Kullanıcı onayları ve rol değişiklikleri Firestore güvenlik kuralları ile anında uygulanır.
            </p>
          </div>
        </div>

        {users.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#4E5D6C]">
            Henüz kayıtlı kullanıcı bulunmuyor.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0B2239] text-xs font-semibold text-slate-200 border-b border-[#DCE3EC]">
                    <th className="py-3 px-4">Kullanıcı &amp; E-Posta</th>
                    <th className="py-3 px-4">Birim</th>
                    <th className="py-3 px-4">Rol</th>
                    <th className="py-3 px-4">Modül İzinleri</th>
                    <th className="py-3 px-4">Durum</th>
                    <th className="py-3 px-4 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE3EC] text-xs">
                  {users.map((u) => {
                    const isSelf = u.uid === currentUser.uid;
                    const isBootstrap = u.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
                    const permCount = countPermissions(u);
                    return (
                      <tr key={u.uid} className="hover:bg-[#F3F6FA]/60">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-sm text-[#0B2239]">
                            {u.displayName || 'İsimsiz Kullanıcı'}
                            {isSelf && (
                              <span className="ml-2 text-[11px] font-mono text-[#0066B3]">
                                (Siz)
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[#4E5D6C] mt-0.5">
                            {u.email}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-[#0B2239]">
                          {u.department || '—'}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-[#0B2239]">
                          {USER_ROLE_LABELS[u.role]}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-[#4E5D6C]">
                          {permCount}/{PERMISSION_LABELS.length} yetki
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`font-semibold ${
                              u.status === 'active'
                                ? 'text-[#007A53]'
                                : u.status === 'pending'
                                ? 'text-amber-700'
                                : 'text-red-700'
                            }`}
                          >
                            {USER_STATUS_LABELS[u.status]}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {u.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => handleQuickApprove(u)}
                                className="min-h-[36px] px-3 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#006344] text-white font-bold rounded-md cursor-pointer"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Hızlı Onayla</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditModal(u)}
                              disabled={isBootstrap && !isSelf}
                              className="min-h-[36px] px-3 inline-flex items-center gap-1.5 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] font-semibold rounded-md cursor-pointer disabled:opacity-40"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Yetki Düzenle</span>
                            </button>
                            {!isSelf && !isBootstrap && (
                              confirmDeleteUid === u.uid ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await deleteUserAuthorization(u.uid);
                                    setConfirmDeleteUid(null);
                                    await onSyncWorkspace();
                                  }}
                                  className="min-h-[36px] px-2.5 bg-red-700 text-white font-semibold rounded-md cursor-pointer"
                                >
                                  Silmeyi Onayla
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteUid(u.uid)}
                                  aria-label="Kullanıcıyı Kaldır"
                                  className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-red-50 hover:text-red-700 text-[#4E5D6C] rounded-md cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden divide-y divide-[#DCE3EC]">
              {users.map((u) => {
                const isSelf = u.uid === currentUser.uid;
                const isBootstrap = u.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
                return (
                  <div key={u.uid} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#0B2239] truncate">
                          {u.displayName || 'İsimsiz Kullanıcı'}
                        </div>
                        <div className="text-xs font-mono text-[#4E5D6C] truncate">
                          {u.email}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          u.status === 'active'
                            ? 'text-[#007A53]'
                            : u.status === 'pending'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {USER_STATUS_LABELS[u.status]}
                      </span>
                    </div>

                    <div className="text-xs text-[#4E5D6C] flex flex-wrap items-center gap-x-2">
                      <span className="font-semibold text-[#0B2239]">
                        {USER_ROLE_LABELS[u.role]}
                      </span>
                      <span>·</span>
                      <span>{u.department || 'Birim Belirtilmedi'}</span>
                      <span>·</span>
                      <span className="font-mono">
                        {countPermissions(u)}/{PERMISSION_LABELS.length} izin
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {u.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleQuickApprove(u)}
                          className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#006344] text-white text-xs font-bold rounded-lg cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Hızlı Onayla</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditModal(u)}
                        disabled={isBootstrap && !isSelf}
                        className="min-h-[40px] px-3 inline-flex items-center gap-1.5 border border-[#DCE3EC] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Yetki Düzenle</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Ön Yetkilendirme Davetleri */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#DCE3EC]">
          <h3 className="font-display text-sm font-bold text-[#0B2239]">
            E-Posta Ön Yetkilendirme Davetleri ({invites.length})
          </h3>
          <p className="text-xs text-[#4E5D6C] mt-0.5">
            Davet edilen e-posta Google hesabıyla ilk kez giriş yaptığında rolü ve modül yetkileri otomatik tanımlanır.
          </p>
        </div>

        {invites.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#4E5D6C]">
            Henüz oluşturulmuş ön yetkilendirme daveti yok.
          </div>
        ) : (
          <div className="divide-y divide-[#DCE3EC]">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-[#0B2239]">
                      {inv.email}
                    </span>
                    <span className="text-[#DCE3EC]">·</span>
                    <span className="font-semibold text-[#0066B3]">
                      {USER_ROLE_LABELS[inv.role]}
                    </span>
                    <span className="text-[#DCE3EC]">·</span>
                    <span
                      className={
                        inv.status === 'claimed'
                          ? 'text-[#007A53] font-semibold'
                          : 'text-amber-700 font-semibold'
                      }
                    >
                      {inv.status === 'claimed' ? 'Aktif Edildi' : 'İlk Giriş Bekleniyor'}
                    </span>
                  </div>
                  <div className="text-xs text-[#4E5D6C]">
                    {inv.displayName || 'Ad belirtilmedi'}
                    {inv.department ? ` · ${inv.department}` : ''}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => deleteUserInvite(inv.id)}
                  aria-label="Daveti Sil"
                  className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-red-50 hover:text-red-700 text-[#4E5D6C] rounded-lg cursor-pointer self-end sm:self-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Kullanıcı Yetki Düzenleme Modalı */}
      {editingUser && (
        <div
          className="fixed inset-0 z-50 bg-[#0B2239]/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Kullanıcı Yetkilerini Düzenle"
        >
          <form
            onSubmit={handleSaveEdit}
            className="bg-white border border-[#DCE3EC] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 bg-[#0B2239] text-white border-b-2 border-[#007A53] flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold text-white truncate">
                  Yetki Düzenle: {editingUser.email}
                </h3>
                <p className="text-xs text-slate-300 truncate">
                  UID: {editingUser.uid}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                aria-label="Kapat"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                    Ad Soyad
                  </label>
                  <input
                    type="text"
                    maxLength={SCHEMA_LIMITS.PERSON_MAX}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                    Birim / Departman
                  </label>
                  <input
                    type="text"
                    maxLength={SCHEMA_LIMITS.DEPARTMENT_MAX}
                    value={editDept}
                    onChange={(e) => setEditDept(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                    Rol
                  </label>
                  <select
                    value={editRole}
                    disabled={editingUser.uid === currentUser.uid}
                    onChange={(e) => {
                      const next = e.target.value as UserRole;
                      setEditRole(next);
                      setEditPerms({ ...ROLE_DEFAULT_PERMISSIONS[next] });
                    }}
                    className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] disabled:bg-[#F3F6FA]"
                  >
                    {(Object.keys(USER_ROLE_LABELS) as UserRole[]).map((r) => (
                      <option key={r} value={r}>
                        {USER_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                    Hesap Durumu
                  </label>
                  <select
                    value={editStatus}
                    disabled={editingUser.uid === currentUser.uid}
                    onChange={(e) => setEditStatus(e.target.value as UserAuthStatus)}
                    className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] disabled:bg-[#F3F6FA]"
                  >
                    {(Object.keys(USER_STATUS_LABELS) as UserAuthStatus[]).map((st) => (
                      <option key={st} value={st}>
                        {USER_STATUS_LABELS[st]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#0B2239] mb-2">
                  Modül Yetkileri
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {PERMISSION_LABELS.map((perm) => {
                    const checked =
                      editRole === 'admin' ? true : Boolean(editPerms[perm.key]);
                    return (
                      <label
                        key={perm.key}
                        className={`p-3 border rounded-lg flex items-start gap-2.5 cursor-pointer ${
                          checked
                            ? 'border-[#0066B3] bg-[#0066B3]/5'
                            : 'border-[#DCE3EC] bg-white'
                        } ${editRole === 'admin' ? 'opacity-75 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={editRole === 'admin'}
                          onChange={(e) =>
                            setEditPerms((prev) => ({
                              ...prev,
                              [perm.key]: e.target.checked,
                            }))
                          }
                          className="mt-0.5 w-4 h-4 accent-[#0066B3]"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#0B2239]">
                            {perm.label}
                          </div>
                          <div className="text-[11px] text-[#4E5D6C] mt-0.5 leading-snug">
                            {perm.hint}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {editError && (
                <p className="text-xs text-red-700 font-medium" role="alert">
                  {editError}
                </p>
              )}
            </div>

            <div className="px-5 py-4 bg-[#F3F6FA] border-t border-[#DCE3EC] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="min-h-[42px] px-4 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="min-h-[42px] px-5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60"
              >
                {editSaving ? 'Kaydediliyor…' : 'Yetkileri Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
