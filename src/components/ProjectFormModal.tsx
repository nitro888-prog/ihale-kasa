import React, { useEffect, useMemo, useState } from 'react';
import { X, Briefcase, Award, ShieldAlert, UserCheck } from 'lucide-react';
import {
  CurrencyCode,
  formatProjectManagerNames,
  getProjectManagers,
  hasProjectsAccess,
  Project,
  PROJECT_STATUS_LABELS,
  ProjectManagerEntry,
  ProjectStatus,
  SalesQuote,
  SCHEMA_LIMITS,
  Tender,
  UserAuthorization,
} from '../types/tender';
import { ProjectInput } from '../services/firestoreService';
import { formatCurrency, getTodayDateStr } from '../lib/trackingAndCalendar';

interface ProjectFormModalProps {
  open: boolean;
  onClose: () => void;
  tenders: Tender[];
  salesQuotes?: SalesQuote[];
  existingProjects: Project[];
  editingProject: Project | null;
  defaultTenderId?: string;
  defaultQuoteId?: string;
  currentUid: string;
  currentEmail: string;
  currentDisplayName: string;
  isAdmin: boolean;
  workspaceUsers: UserAuthorization[];
  onSubmit: (
    data: ProjectInput,
    options?: { grantProjectViewToManagers?: UserAuthorization[] }
  ) => Promise<void>;
}

export const ProjectFormModal: React.FC<ProjectFormModalProps> = ({
  open,
  onClose,
  tenders,
  salesQuotes = [],
  existingProjects,
  editingProject,
  defaultTenderId = '',
  defaultQuoteId = '',
  currentUid,
  currentEmail,
  currentDisplayName,
  isAdmin,
  workspaceUsers,
  onSubmit,
}) => {
  const [tenderId, setTenderId] = useState('');
  const [quoteId, setQuoteId] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [title, setTitle] = useState('');
  const [authority, setAuthority] = useState('');
  const [contractAmount, setContractAmount] = useState('0');
  const [currency, setCurrency] = useState<CurrencyCode>('TRY');
  const [startDate, setStartDate] = useState(getTodayDateStr());
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('aktif');
  const [selectedManagerUids, setSelectedManagerUids] = useState<string[]>([]);
  const [grantAccessIfMissing, setGrantAccessIfMissing] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeUsers = useMemo(() => {
    const actives = workspaceUsers.filter((u) => u.status === 'active');
    if (actives.length > 0) return actives;
    return [
      {
        uid: currentUid,
        email: currentEmail,
        displayName: currentDisplayName || currentEmail,
        department: '',
        role: isAdmin ? 'admin' : 'ihale_sorumlusu',
        status: 'active',
        workspaceOwnerId: currentUid,
        inviteId: '',
        permissions: {
          canCreateTender: true,
          canEditTender: true,
          canDeleteTender: false,
          canManageVault: false,
          canManageProducts: false,
          canAnalyzeDocuments: false,
          canManageSettings: false,
          canViewProjects: true,
        },
        approvedBy: currentUid,
      } as UserAuthorization,
    ];
  }, [workspaceUsers, currentUid, currentEmail, currentDisplayName, isAdmin]);

  const wonTenders = useMemo(() => {
    return tenders.filter((t) => t.status === 'kazanildi');
  }, [tenders]);

  const linkedTenderIds = useMemo(() => {
    return new Set(
      existingProjects
        .filter((p) => p.id !== editingProject?.id && p.tenderId)
        .map((p) => p.tenderId)
    );
  }, [existingProjects, editingProject?.id]);

  const linkedQuoteIds = useMemo(() => {
    return new Set(
      existingProjects
        .filter((p) => p.id !== editingProject?.id && p.quoteId)
        .map((p) => p.quoteId || '')
    );
  }, [existingProjects, editingProject?.id]);

  const approvedQuotes = useMemo(() => {
    return salesQuotes.filter((q) => q.status === 'siparis_onaylandi');
  }, [salesQuotes]);

  const generateNextCode = (sourceCode?: string) => {
    if (sourceCode) {
      return `PRJ-${sourceCode}`.slice(0, SCHEMA_LIMITS.PROJECT_CODE_MAX);
    }
    const year = new Date().getFullYear();
    const nextNum = existingProjects.length + 1;
    return `PRJ-${year}-${String(nextNum).padStart(3, '0')}`;
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    setGrantAccessIfMissing(true);

    if (editingProject) {
      setTenderId(editingProject.tenderId || '');
      setQuoteId(editingProject.quoteId || '');
      setProjectCode(editingProject.projectCode || '');
      setTitle(editingProject.title || '');
      setAuthority(editingProject.authority || '');
      setContractAmount(String(editingProject.contractAmount ?? 0));
      setCurrency(editingProject.currency || 'TRY');
      setStartDate(editingProject.startDate || getTodayDateStr());
      setEndDate(editingProject.endDate || '');
      setStatus(editingProject.status || 'aktif');
      setSelectedManagerUids(getProjectManagers(editingProject).map((m) => m.uid));
      setNotes(editingProject.notes || '');
      return;
    }

    const initialQuote = defaultQuoteId
      ? salesQuotes.find((q) => q.id === defaultQuoteId) || null
      : null;

    const initialTender =
      !initialQuote
        ? (defaultTenderId ? tenders.find((t) => t.id === defaultTenderId) : null) ||
          wonTenders.find((t) => !linkedTenderIds.has(t.id)) ||
          null
        : null;

    if (initialQuote) {
      setQuoteId(initialQuote.id);
      setTenderId('');
      setProjectCode(generateNextCode(initialQuote.quoteNumber));
      setTitle(initialQuote.title);
      setAuthority(initialQuote.customerName);
      setContractAmount(String(initialQuote.grandTotal || 0));
      setCurrency(initialQuote.currency || 'TRY');
    } else if (initialTender) {
      setQuoteId('');
      setTenderId(initialTender.id);
      setProjectCode(generateNextCode(initialTender.trackingCode));
      setTitle(initialTender.title);
      setAuthority(initialTender.authority);
      setContractAmount(String(initialTender.estimatedAmount || 0));
      setCurrency(initialTender.currency || 'TRY');
    } else {
      const pendingApprovedQuote = approvedQuotes.find((q) => !linkedQuoteIds.has(q.id));
      if (pendingApprovedQuote && !defaultTenderId) {
        setQuoteId(pendingApprovedQuote.id);
        setTenderId('');
        setProjectCode(generateNextCode(pendingApprovedQuote.quoteNumber));
        setTitle(pendingApprovedQuote.title);
        setAuthority(pendingApprovedQuote.customerName);
        setContractAmount(String(pendingApprovedQuote.grandTotal || 0));
        setCurrency(pendingApprovedQuote.currency || 'TRY');
      } else {
        setQuoteId('');
        setTenderId('');
        setProjectCode(generateNextCode());
        setTitle('');
        setAuthority('');
        setContractAmount('0');
        setCurrency('TRY');
      }
    }

    setStartDate(getTodayDateStr());
    setEndDate('');
    setStatus('aktif');
    setSelectedManagerUids(currentUid ? [currentUid] : []);
    setNotes('');
  }, [open, editingProject, defaultTenderId, defaultQuoteId, currentUid]);

  if (!open) return null;

  const handleSelectTender = (selectedId: string) => {
    setTenderId(selectedId);
    if (selectedId) setQuoteId('');
    const t = tenders.find((item) => item.id === selectedId);
    if (!t) return;
    if (!editingProject) {
      setProjectCode(generateNextCode(t.trackingCode));
      setTitle(t.title);
      setAuthority(t.authority);
      setContractAmount(String(t.estimatedAmount || 0));
      setCurrency(t.currency || 'TRY');
    }
  };

  const handleSelectQuote = (selectedQuoteId: string) => {
    setQuoteId(selectedQuoteId);
    if (selectedQuoteId) setTenderId('');
    const q = salesQuotes.find((item) => item.id === selectedQuoteId);
    if (!q) return;
    if (!editingProject) {
      setProjectCode(generateNextCode(q.quoteNumber));
      setTitle(q.title);
      setAuthority(q.customerName);
      setContractAmount(String(q.grandTotal || 0));
      setCurrency(q.currency || 'TRY');
    }
  };

  const selectedManagerUsers = selectedManagerUids
    .map((uid) => activeUsers.find((u) => u.uid === uid))
    .filter((u): u is UserAuthorization => Boolean(u));

  const managersMissingProjectScreenPerm = isAdmin
    ? selectedManagerUsers.filter(
        (u) => u.role !== 'admin' && !hasProjectsAccess(u.permissions, u.role)
      )
    : [];

  const toggleManagerSelection = (uid: string) => {
    setError(null);
    setSelectedManagerUids((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((id) => id !== uid);
      }
      if (prev.length >= 20) {
        setError('Bir projeye en fazla 20 yönetici atanabilir.');
        return prev;
      }
      return [...prev, uid];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectCode.trim()) {
      setError('Proje kodu zorunludur.');
      return;
    }
    if (!title.trim()) {
      setError('Proje adı zorunludur.');
      return;
    }
    if (!authority.trim()) {
      setError('İdare / Müşteri kurum adı zorunludur.');
      return;
    }

    const chosenManagers: ProjectManagerEntry[] = editingProject
      ? getProjectManagers(editingProject)
      : isAdmin
      ? selectedManagerUsers.map((u) => ({
          uid: u.uid,
          email: u.email,
          displayName: u.displayName || u.email,
        }))
      : [
          {
            uid: currentUid,
            email: currentEmail,
            displayName: currentDisplayName || currentEmail,
          },
        ];

    if (chosenManagers.length === 0 || !chosenManagers[0].uid) {
      setError('Lütfen en az bir Proje Yöneticisi seçin.');
      return;
    }

    const linkedTender = tenders.find((t) => t.id === tenderId);
    const linkedQuote = salesQuotes.find((q) => q.id === quoteId);
    setSaving(true);
    setError(null);
    try {
      await onSubmit(
        {
          projectCode: projectCode.trim(),
          tenderId: linkedTender?.id || '',
          tenderTrackingCode: linkedTender?.trackingCode || '',
          quoteId: linkedQuote?.id || '',
          quoteNumber: linkedQuote?.quoteNumber || '',
          title: title.trim(),
          authority: authority.trim(),
          contractAmount: Math.max(0, Number(contractAmount) || 0),
          currency,
          startDate: startDate || getTodayDateStr(),
          endDate: endDate || '',
          status,
          managerUid: chosenManagers[0].uid,
          managerEmail: chosenManagers[0].email,
          managerName: chosenManagers.map((m) => m.displayName).join(', '),
          managerUids: chosenManagers.map((m) => m.uid),
          managers: chosenManagers,
          notes: notes.trim(),
        },
        {
          grantProjectViewToManagers:
            !editingProject &&
            grantAccessIfMissing &&
            managersMissingProjectScreenPerm.length > 0
              ? managersMissingProjectScreenPerm
              : undefined,
        }
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Proje kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B2239]/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={editingProject ? 'Projeyi Düzenle' : 'Yeni Proje Oluştur'}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[#DCE3EC] rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="px-5 py-4 bg-[#0B2239] text-white border-b-2 border-[#007A53] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Briefcase className="w-5 h-5 text-[#34D399] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-white truncate">
                {editingProject
                  ? 'Proje Bilgilerini Düzenle'
                  : quoteId
                  ? 'Özel Sektör Siparişinden Proje Başlat'
                  : 'İhale veya Siparişten Proje Başlat'}
              </h2>
              <p className="text-xs text-slate-300 truncate">
                Proje işlemleri yalnızca atanan Proje Yöneticisinin yetkisindedir.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-slate-300 hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Source Picker: Won Tender OR Private-Sector Quote/Proforma */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[#0B2239]">
                <Award className="w-4 h-4 text-[#007A53]" />
                <span>Bağlı İhale (Kamu İhaleleri)</span>
              </label>
              <select
                value={tenderId}
                onChange={(e) => handleSelectTender(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                <option value="">— İhale Seçimi Yok —</option>
                {wonTenders.length > 0 && (
                  <optgroup label="Kazanılan İhaleler">
                    {wonTenders.map((t) => {
                      const alreadyLinked = linkedTenderIds.has(t.id);
                      return (
                        <option key={t.id} value={t.id}>
                          {t.trackingCode} · {t.title} ({formatCurrency(t.estimatedAmount, t.currency)})
                          {alreadyLinked ? ' [Projesi Mevcut]' : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                {tenders.filter((t) => t.status !== 'kazanildi').length > 0 && (
                  <optgroup label="Diğer İhale Kayıtları">
                    {tenders
                      .filter((t) => t.status !== 'kazanildi')
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.trackingCode} · {t.title}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-[#0B2239]">
                <Briefcase className="w-4 h-4 text-[#0066B3]" />
                <span>Bağlı Özel Sektör Teklif / Proforma</span>
              </label>
              <select
                value={quoteId}
                onChange={(e) => handleSelectQuote(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                <option value="">— Teklif / Proforma Seçimi Yok —</option>
                {approvedQuotes.length > 0 && (
                  <optgroup label="Siparişe Dönen Onaylı Teklifler">
                    {approvedQuotes.map((q) => {
                      const alreadyLinked = linkedQuoteIds.has(q.id);
                      return (
                        <option key={q.id} value={q.id}>
                          {q.quoteNumber} · {q.customerName} ({formatCurrency(q.grandTotal, q.currency)})
                          {alreadyLinked ? ' [Projesi Mevcut]' : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                {salesQuotes.filter((q) => q.status !== 'siparis_onaylandi' && q.status !== 'iptal').length > 0 && (
                  <optgroup label="Açık Teklif / Proformalar">
                    {salesQuotes
                      .filter((q) => q.status !== 'siparis_onaylandi' && q.status !== 'iptal')
                      .map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.quoteNumber} · {q.customerName} ({formatCurrency(q.grandTotal, q.currency)})
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Proje Kodu *
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.PROJECT_CODE_MAX}
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value)}
                placeholder="Örn: PRJ-2026-001"
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-mono text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Proje Adı / Konusu *
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.TITLE_MAX}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Örn: İl Sağlık Müdürlüğü Cihaz Kurulum Projesi"
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İdare / Kurum / Müşteri *
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.AUTHORITY_MAX}
                value={authority}
                onChange={(e) => setAuthority(e.target.value)}
                placeholder="Kurum veya firma adı"
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Proje Durumu
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {PROJECT_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Sözleşme / İhale Bedeli
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={contractAmount}
                onChange={(e) => setContractAmount(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-mono text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Para Birimi
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                <option value="TRY">TRY (₺)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Başlangıç Tarihi *
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-mono text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Hedef Bitiş Tarihi (İsteğe Bağlı)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-mono text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-[#0B2239]">
                  Yetkili Proje Yöneticileri *
                </label>
                {!editingProject && isAdmin && (
                  <span className="text-[11px] font-mono text-[#4E5D6C]">
                    {selectedManagerUids.length} yönetici seçili
                  </span>
                )}
              </div>
              {editingProject ? (
                <div className="min-h-[44px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#0066B3] shrink-0" />
                  <span className="font-medium">
                    {formatProjectManagerNames(editingProject)}
                  </span>
                </div>
              ) : isAdmin ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2.5 bg-[#F3F6FA]/60 border border-[#DCE3EC] rounded-lg">
                  {activeUsers.map((u) => {
                    const checked = selectedManagerUids.includes(u.uid);
                    const hasView = hasProjectsAccess(u.permissions, u.role);
                    return (
                      <label
                        key={u.uid}
                        className={`p-2 rounded-md border text-xs flex items-start gap-2 cursor-pointer transition-colors ${
                          checked
                            ? 'bg-white border-[#0066B3]/60 text-[#0B2239]'
                            : 'bg-white/70 border-[#DCE3EC] text-[#4E5D6C] hover:bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleManagerSelection(u.uid)}
                          className="mt-0.5 w-4 h-4 accent-[#0066B3] shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[#0B2239] truncate">
                            {u.displayName || u.email}
                          </div>
                          <div className="text-[11px] text-[#4E5D6C] truncate">
                            {u.email} {hasView ? '· Proje Yetkili' : '· Ekran Yetkisi Yok'}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="min-h-[44px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#007A53] shrink-0" />
                  <span className="truncate font-medium">
                    {currentDisplayName || currentEmail} (Siz)
                  </span>
                </div>
              )}
            </div>
          </div>

          {!editingProject && managersMissingProjectScreenPerm.length > 0 && (
            <label className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={grantAccessIfMissing}
                onChange={(e) => setGrantAccessIfMissing(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#0066B3]"
              />
              <div className="text-xs text-amber-900">
                <span className="font-semibold flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  Seçilen {managersMissingProjectScreenPerm.length} yöneticide &ldquo;Proje Yönetimi Ekranı&rdquo; görme yetkisi henüz açık değil.
                </span>
                <span className="block text-[11px] text-amber-800 mt-0.5">
                  Bu kutu işaretliyken proje oluşturulduğunda seçili kullanıcılara ({managersMissingProjectScreenPerm.map((u) => u.displayName || u.email).join(', ')}) Proje Yönetimi ekranı yetkisi otomatik tanımlanır.
                </span>
              </div>
            </label>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
              Proje Notları / Teslimat Kapsamı
            </label>
            <textarea
              rows={3}
              maxLength={SCHEMA_LIMITS.NOTES_MAX}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Sözleşme süresi, hakediş takvimi, teslimat koşulları..."
              className="w-full px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
            />
          </div>

          {error && (
            <p className="text-xs text-red-700 font-medium" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 py-4 bg-[#F3F6FA] border-t border-[#DCE3EC] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[42px] px-5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60"
          >
            {saving
              ? 'Kaydediliyor…'
              : editingProject
              ? 'Projeyi Güncelle'
              : 'Projeyi Oluştur'}
          </button>
        </div>
      </form>
    </div>
  );
};
