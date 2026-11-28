import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  ExternalLink,
  Briefcase,
  UserCheck,
  Lock,
  Edit3,
  Plus,
  Trash2,
  CheckCircle2,
  Award,
  RefreshCw,
  FileText,
} from 'lucide-react';
import {
  ACCOUNTING_PAYMENT_METHOD_LABELS,
  ACCOUNTING_PAYMENT_STATUS_LABELS,
  CurrencyCode,
  formatProjectManagerNames,
  getProjectManagers,
  hasProjectsAccess,
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
  UserAuthorization,
  ZERO_PERMISSIONS,
} from '../types/tender';
import { formatCurrency, formatTurkishDate } from '../lib/trackingAndCalendar';

interface ProjectDetailModalProps {
  project: Project | null;
  transactions: ProjectTransaction[];
  tenders: Tender[];
  salesQuotes?: SalesQuote[];
  currentUid: string;
  isAdmin: boolean;
  workspaceUsers: UserAuthorization[];
  disableEscClose?: boolean;
  onClose: () => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (project: Project) => Promise<void>;
  onReassignManagers: (
    project: Project,
    nextManagers: UserAuthorization[]
  ) => Promise<void>;
  onNewTransaction: (projectId: string, txType?: ProjectTransactionType) => void;
  onEditTransaction: (tx: ProjectTransaction) => void;
  onMarkTransactionPaid: (tx: ProjectTransaction) => Promise<void>;
  onDeleteTransaction: (project: Project, tx: ProjectTransaction) => Promise<void>;
  onSelectTenderId: (tenderId: string) => void;
  onSelectQuoteId?: (quoteId: string) => void;
}

type TxFilter = 'all' | 'income' | 'gelen_fatura' | 'gider';

export const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({
  project,
  transactions,
  tenders,
  salesQuotes = [],
  currentUid,
  isAdmin,
  workspaceUsers,
  disableEscClose = false,
  onClose,
  onEditProject,
  onDeleteProject,
  onReassignManagers,
  onNewTransaction,
  onEditTransaction,
  onMarkTransactionPaid,
  onDeleteTransaction,
  onSelectTenderId,
  onSelectQuoteId,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [txFilter, setTxFilter] = useState<TxFilter>('all');
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [confirmDeleteTxId, setConfirmDeleteTxId] = useState<string | null>(null);
  const [busyTxId, setBusyTxId] = useState<string | null>(null);
  const [selectedManagerUids, setSelectedManagerUids] = useState<string[]>([]);
  const [reassigning, setReassigning] = useState(false);
  const [reassignSuccess, setReassignSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!project || disableEscClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project, disableEscClose, onClose]);

  const projectManagersKey = project
    ? getProjectManagers(project)
        .map((m) => m.uid)
        .join(',')
    : '';

  useEffect(() => {
    setConfirmDeleteProject(false);
    setConfirmDeleteTxId(null);
    setErrorMsg(null);
    setReassignSuccess(null);
  }, [project?.id]);

  useEffect(() => {
    if (project) {
      setSelectedManagerUids(getProjectManagers(project).map((m) => m.uid));
    } else {
      setSelectedManagerUids([]);
    }
  }, [project?.id, projectManagersKey]);

  const projectTxs = useMemo(() => {
    if (!project) return [];
    return transactions.filter((t) => t.projectId === project.id);
  }, [transactions, project]);

  const filteredTxs = useMemo(() => {
    return projectTxs.filter((t) => {
      if (txFilter === 'income') return isProjectIncomeTx(t.txType);
      if (txFilter === 'gelen_fatura') return t.txType === 'gelen_fatura';
      if (txFilter === 'gider') return t.txType === 'gider';
      return true;
    });
  }, [projectTxs, txFilter]);

  const financialsByCurrency = useMemo(() => {
    const map: Record<
      CurrencyCode,
      {
        income: number;
        incomingInvoices: number;
        expenses: number;
        totalCost: number;
        netProfit: number;
      }
    > = {
      TRY: { income: 0, incomingInvoices: 0, expenses: 0, totalCost: 0, netProfit: 0 },
      USD: { income: 0, incomingInvoices: 0, expenses: 0, totalCost: 0, netProfit: 0 },
      EUR: { income: 0, incomingInvoices: 0, expenses: 0, totalCost: 0, netProfit: 0 },
    };

    for (const tx of projectTxs) {
      if (tx.paymentStatus === 'iptal') continue;
      const cur: CurrencyCode = tx.currency || 'TRY';
      if (isProjectIncomeTx(tx.txType)) {
        map[cur].income += tx.totalAmount || 0;
      } else if (tx.txType === 'gelen_fatura') {
        map[cur].incomingInvoices += tx.totalAmount || 0;
      } else if (tx.txType === 'gider') {
        map[cur].expenses += tx.totalAmount || 0;
      }
    }

    (['TRY', 'USD', 'EUR'] as CurrencyCode[]).forEach((cur) => {
      map[cur].totalCost = map[cur].incomingInvoices + map[cur].expenses;
      map[cur].netProfit = map[cur].income - map[cur].totalCost;
    });

    return map;
  }, [projectTxs]);

  if (!project) return null;

  const assignedManagers = getProjectManagers(project);
  const assignedManagerSummary = formatProjectManagerNames(project);
  const isManager = isProjectManager(project, currentUid);
  const canDeleteOwnProject = isManager && isOwnRecord(project, currentUid);
  const linkedTender = project.tenderId
    ? tenders.find((t) => t.id === project.tenderId) || null
    : null;
  const linkedQuote = project.quoteId
    ? salesQuotes.find((q) => q.id === project.quoteId) || null
    : null;
  const activeUsers = workspaceUsers.filter((u) => u.status === 'active');

  const currentManagerUidSet = new Set(assignedManagers.map((m) => m.uid));
  const selectedManagerUidSet = new Set(selectedManagerUids);
  const hasManagerChanges =
    currentManagerUidSet.size !== selectedManagerUidSet.size ||
    selectedManagerUids.some((uid) => !currentManagerUidSet.has(uid));

  const mainCur: CurrencyCode = project.currency || 'TRY';
  const mainStats = financialsByCurrency[mainCur];
  const otherCurrencies = (['TRY', 'USD', 'EUR'] as CurrencyCode[]).filter(
    (c) =>
      c !== mainCur &&
      (financialsByCurrency[c].income > 0 || financialsByCurrency[c].totalCost > 0)
  );
  const marginPct =
    mainStats.income > 0 ? (mainStats.netProfit / mainStats.income) * 100 : null;

  const getStatusBadgeClass = (st: ProjectStatus): string => {
    switch (st) {
      case 'aktif':
        return 'bg-[#007A53]/20 text-[#007A53] border-[#007A53]/40';
      case 'tamamlandi':
        return 'bg-[#0066B3]/15 text-[#0066B3] border-[#0066B3]/30';
      case 'askida':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'iptal':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-[#4E5D6C] border-[#DCE3EC]';
    }
  };

  const toggleManagerUid = (uid: string) => {
    setErrorMsg(null);
    setReassignSuccess(null);
    setSelectedManagerUids((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((id) => id !== uid);
      }
      if (prev.length >= 20) {
        setErrorMsg('Bir projeye en fazla 20 yönetici atanabilir.');
        return prev;
      }
      return [...prev, uid];
    });
  };

  const handleReassignSubmit = async () => {
    const nextManagers = selectedManagerUids
      .map((uid) => {
        const active = activeUsers.find((u) => u.uid === uid);
        if (active) return active;
        const existingMgr = assignedManagers.find((m) => m.uid === uid);
        if (!existingMgr) return null;
        return {
          uid: existingMgr.uid,
          email: existingMgr.email,
          displayName: existingMgr.displayName,
          department: '',
          role: 'ihale_sorumlusu',
          status: 'active',
          workspaceOwnerId: project.ownerId,
          inviteId: '',
          permissions: { ...ZERO_PERMISSIONS, canViewProjects: true },
          approvedBy: currentUid,
        } as UserAuthorization;
      })
      .filter((u): u is UserAuthorization => Boolean(u));
    if (nextManagers.length === 0) {
      setErrorMsg('En az bir aktif proje yöneticisi seçilmelidir.');
      return;
    }
    if (!hasManagerChanges) return;
    setReassigning(true);
    setErrorMsg(null);
    setReassignSuccess(null);
    try {
      await onReassignManagers(project, nextManagers);
      setReassignSuccess(
        `${nextManagers.length} proje yöneticisi projeye atandı.`
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Proje yöneticileri güncellenemedi.';
      if (msg.includes('Missing or insufficient permissions')) {
        setErrorMsg(
          'Yönetici atama için Firestore yetkisi reddedildi. Lütfen yönetici oturumunuzu ve kuralları kontrol edin.'
        );
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setReassigning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-[#0B2239]/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Proje Detay ve Maliyet Penceresi"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-white border border-[#DCE3EC] shadow-2xl flex flex-col overflow-hidden transition-all ${
          isMaximized
            ? 'w-full h-full max-w-none rounded-none'
            : 'w-full max-w-5xl h-[92vh] sm:rounded-2xl'
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-[#0B2239] text-white border-b-2 border-[#007A53] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-[#FBBF24] tabular-nums">
                <Briefcase className="w-3.5 h-3.5" />
                <span>{project.projectCode}</span>
              </span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span>{PROJECT_STATUS_LABELS[project.status]}</span>
              {project.tenderTrackingCode && (
                <>
                  <span className="text-slate-500" aria-hidden="true">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#34D399] font-mono font-semibold">
                    <Award className="w-3.5 h-3.5" />
                    <span>İhale: {project.tenderTrackingCode}</span>
                  </span>
                </>
              )}
              {project.quoteNumber && (
                <>
                  <span className="text-slate-500" aria-hidden="true">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#7DD3FC] font-mono font-semibold">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Özel Sektör: {project.quoteNumber}</span>
                  </span>
                </>
              )}
            </div>
            <h2 className="font-display text-lg font-bold text-white mt-1 leading-snug">
              {project.title}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">{project.authority}</p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <a
              href={`?detail=project&id=${encodeURIComponent(project.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Yeni Tarayıcı Sekmesinde Aç"
              className="min-h-[40px] px-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-200 hover:text-white hover:bg-[#143252] rounded-lg whitespace-nowrap transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Yeni Sekmede Aç</span>
            </a>
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              aria-label={isMaximized ? 'Pencereyi Küçült' : 'Pencereyi Büyüt'}
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#143252] rounded-lg cursor-pointer transition-colors"
            >
              {isMaximized ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-[#143252] rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Strip */}
        <div className="px-5 py-3 bg-[#F3F6FA] border-b border-[#DCE3EC] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {isManager ? (
              <>
                <button
                  type="button"
                  onClick={() => onNewTransaction(project.id, 'kesilen_fatura')}
                  className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#326619] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Kesilen Fatura (Gelir)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNewTransaction(project.id, 'gelen_fatura')}
                  className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Gelen Fatura</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNewTransaction(project.id, 'gider')}
                  className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Gider Ekle</span>
                </button>
                <button
                  type="button"
                  onClick={() => onEditProject(project)}
                  className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-medium rounded-lg cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Projeyi Düzenle</span>
                </button>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#DCE3EC] rounded-lg text-xs text-[#4E5D6C]">
                <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>
                  İşlem yetkisi yalnızca atanmış Proje Yöneticilerine (
                  <strong className="text-[#0B2239]">{assignedManagerSummary}</strong>) aittir
                </span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {linkedTender && (
              <button
                type="button"
                onClick={() => onSelectTenderId(linkedTender.id)}
                className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0066B3] text-xs font-semibold rounded-lg cursor-pointer"
              >
                <Award className="w-3.5 h-3.5" />
                <span>İhale Detayı ({linkedTender.trackingCode})</span>
              </button>
            )}
            {linkedQuote && onSelectQuoteId && (
              <button
                type="button"
                onClick={() => onSelectQuoteId(linkedQuote.id)}
                className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0066B3] text-xs font-semibold rounded-lg cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Teklif / Proforma ({linkedQuote.quoteNumber})</span>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium"
            >
              {errorMsg}
            </div>
          )}

          {/* Authority & Manager Info Card */}
          <div className="p-4 border border-[#DCE3EC] rounded-xl bg-[#F3F6FA]/50 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isManager ? 'bg-[#007A53]/20 text-[#007A53]' : 'bg-[#0B2239] text-white'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="text-xs space-y-2 min-w-0 flex-1">
                  <div className="font-semibold text-[#0B2239] flex flex-wrap items-center gap-2">
                    <span>
                      Sorumlu Proje {assignedManagers.length > 1 ? 'Yöneticileri' : 'Yöneticisi'} (
                      {assignedManagers.length})
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md ${getStatusBadgeClass(
                        project.status
                      )}`}
                    >
                      {PROJECT_STATUS_LABELS[project.status]}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {assignedManagers.map((m) => {
                      const isSelf = m.uid === currentUid;
                      return (
                        <div
                          key={m.uid}
                          className={`px-2.5 py-1.5 rounded-md border text-xs inline-flex items-center gap-1.5 ${
                            isSelf
                              ? 'bg-[#007A53]/10 border-[#007A53]/40 text-[#0B2239]'
                              : 'bg-white border-[#DCE3EC] text-[#0B2239]'
                          }`}
                        >
                          <span className="font-semibold">{m.displayName}</span>
                          {m.email && (
                            <span className="text-[11px] text-[#4E5D6C]">({m.email})</span>
                          )}
                          {isSelf && (
                            <span className="text-[10px] font-mono font-semibold bg-[#007A53]/20 text-[#007A53] px-1.5 py-0.5 rounded">
                              Siz
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-[#4E5D6C]">
                    Başlangıç: {formatTurkishDate(project.startDate)}
                    {project.endDate ? ` · Bitiş: ${formatTurkishDate(project.endDate)}` : ''}
                  </div>
                  <div className="text-[11px] text-[#4E5D6C]">
                    {isManager
                      ? 'Yetkili proje yöneticisi olarak fatura kesebilir, gelen fatura ve gider ekleyebilirsiniz.'
                      : 'Bu projede yalnızca görüntüleme yetkiniz var; fatura ve gider yazma yetkisi sadece atanmış proje yöneticilerindedir.'}
                  </div>
                </div>
              </div>
            </div>

            {isAdmin && activeUsers.length > 0 && (
              <div className="pt-3 border-t border-[#DCE3EC] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-[#0B2239]">
                    Yönetici Ata (Aynı projeye birden fazla yönetici seçebilirsiniz)
                  </div>
                  <span className="text-[11px] font-mono text-[#4E5D6C]">
                    {selectedManagerUids.length} / {activeUsers.length} seçili
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-44 overflow-y-auto p-2 bg-white border border-[#DCE3EC] rounded-lg">
                  {activeUsers.map((u) => {
                    const checked = selectedManagerUids.includes(u.uid);
                    const hasAccess = hasProjectsAccess(u.permissions, u.role);
                    return (
                      <label
                        key={u.uid}
                        className={`p-2 rounded-md border text-xs flex items-start gap-2 cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[#0066B3]/8 border-[#0066B3]/50 text-[#0B2239]'
                            : 'bg-[#F3F6FA]/60 border-[#DCE3EC] text-[#4E5D6C] hover:bg-[#F3F6FA]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleManagerUid(u.uid)}
                          className="mt-0.5 w-4 h-4 accent-[#0066B3] shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[#0B2239] truncate">
                            {u.displayName || u.email}
                          </div>
                          <div className="text-[11px] text-[#4E5D6C] truncate">
                            {u.email}
                          </div>
                          {!hasAccess && (
                            <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                              Atanınca proje ekranı açılır
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-[#4E5D6C]">
                    {selectedManagerUids.length === 0 ? (
                      <span className="text-red-700 font-medium">
                        En az 1 proje yöneticisi seçili olmalıdır.
                      </span>
                    ) : hasManagerChanges ? (
                      <span className="text-[#0066B3] font-medium">
                        Değişiklikleri kaydetmek için &ldquo;Yönetici Ata&rdquo; düğmesine tıklayın.
                      </span>
                    ) : (
                      <span>Seçili yöneticiler proje kaydıyla güncel.</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {hasManagerChanges && (
                      <button
                        type="button"
                        disabled={reassigning}
                        onClick={() => {
                          setErrorMsg(null);
                          setReassignSuccess(null);
                          setSelectedManagerUids(assignedManagers.map((m) => m.uid));
                        }}
                        className="min-h-[36px] px-3 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] text-xs font-medium rounded-lg cursor-pointer"
                      >
                        Sıfırla
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={
                        reassigning ||
                        selectedManagerUids.length === 0 ||
                        !hasManagerChanges
                      }
                      onClick={handleReassignSubmit}
                      className="min-h-[38px] px-4 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${reassigning ? 'animate-spin' : ''}`}
                      />
                      <span>{reassigning ? 'Atanıyor…' : 'Yönetici Ata'}</span>
                    </button>
                  </div>
                </div>

                {reassignSuccess && (
                  <div
                    role="status"
                    className="p-2.5 bg-[#007A53]/10 border border-[#007A53]/30 rounded-lg text-xs text-[#007A53] font-medium flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{reassignSuccess}</span>
                  </div>
                )}

                {errorMsg && (
                  <div
                    role="alert"
                    className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium"
                  >
                    {errorMsg}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Financial KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 border border-[#DCE3EC] rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-[#DCE3EC] bg-white overflow-hidden">
            <div className="p-4">
              <div className="text-[11px] text-[#4E5D6C]">Sözleşme Bedeli</div>
              <div className="mt-1 text-base font-mono font-bold text-[#0B2239] tabular-nums">
                {formatCurrency(project.contractAmount, mainCur)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-[11px] text-[#4E5D6C]">Kesilen Faturalar &amp; Gelir</div>
              <div className="mt-1 text-base font-mono font-bold text-[#007A53] tabular-nums">
                +{formatCurrency(mainStats.income, mainCur)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-[11px] text-[#4E5D6C]">Gelen Faturalar</div>
              <div className="mt-1 text-base font-mono font-bold text-[#0066B3] tabular-nums">
                -{formatCurrency(mainStats.incomingInvoices, mainCur)}
              </div>
            </div>
            <div className="p-4">
              <div className="text-[11px] text-[#4E5D6C]">Yapılan Giderler</div>
              <div className="mt-1 text-base font-mono font-bold text-amber-700 tabular-nums">
                -{formatCurrency(mainStats.expenses, mainCur)}
              </div>
            </div>
            <div className="p-4 col-span-2 lg:col-span-1 bg-[#F3F6FA]/40">
              <div className="text-[11px] text-[#4E5D6C]">Net Proje Kârı / Zararı</div>
              <div
                className={`mt-1 text-base font-mono font-bold tabular-nums ${
                  mainStats.netProfit >= 0 ? 'text-[#007A53]' : 'text-red-700'
                }`}
              >
                {mainStats.netProfit >= 0 ? '+' : ''}
                {formatCurrency(mainStats.netProfit, mainCur)}
              </div>
              {marginPct !== null && (
                <div className="text-[11px] font-mono text-[#4E5D6C] tabular-nums">
                  Marj: %{marginPct.toFixed(1)}
                </div>
              )}
            </div>
          </div>

          {otherCurrencies.length > 0 && (
            <div className="p-3 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] flex flex-wrap items-center gap-4">
              <span className="font-semibold">Diğer Döviz Hareketleri:</span>
              {otherCurrencies.map((cur) => (
                <span key={cur} className="font-mono tabular-nums">
                  {cur}: Gelir +{formatCurrency(financialsByCurrency[cur].income, cur)} / Maliyet -
                  {formatCurrency(financialsByCurrency[cur].totalCost, cur)} / Net{' '}
                  {formatCurrency(financialsByCurrency[cur].netProfit, cur)}
                </span>
              ))}
            </div>
          )}

          {project.notes && (
            <div className="p-4 border border-[#DCE3EC] rounded-xl bg-white">
              <div className="text-xs font-semibold text-[#4E5D6C] mb-1">Proje Notları</div>
              <p className="text-sm text-[#0B2239] whitespace-pre-wrap">{project.notes}</p>
            </div>
          )}

          {/* Project Transactions Table */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="font-display text-sm font-bold text-[#0B2239]">
                Proje Fatura ve Gider Hareketleri ({projectTxs.length})
              </h3>
              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F3F6FA] rounded-lg">
                {(
                  [
                    { id: 'all', label: 'Tümü' },
                    { id: 'income', label: 'Kesilen Fatura / Gelir' },
                    { id: 'gelen_fatura', label: 'Gelen Faturalar' },
                    { id: 'gider', label: 'Yapılan Giderler' },
                  ] as { id: TxFilter; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTxFilter(tab.id)}
                    className={`min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                      txFilter === tab.id
                        ? 'bg-white text-[#0B2239] shadow-xs'
                        : 'text-[#4E5D6C] hover:text-[#0B2239]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredTxs.length === 0 ? (
              <div className="p-8 border border-dashed border-[#DCE3EC] rounded-xl text-center text-xs text-[#4E5D6C]">
                Bu filtre için proje hareketi bulunmuyor.
              </div>
            ) : (
              <div className="border border-[#DCE3EC] rounded-xl divide-y divide-[#DCE3EC] overflow-hidden">
                {filteredTxs.map((tx) => {
                  const isIncome = isProjectIncomeTx(tx.txType);
                  const canDeleteTx = isManager && isOwnRecord(tx, currentUid);
                  const isBusy = busyTxId === tx.id;
                  return (
                    <div
                      key={tx.id}
                      className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-[#F3F6FA]/40"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`px-2 py-0.5 rounded-md font-semibold ${
                              isIncome
                                ? 'bg-[#007A53]/15 text-[#007A53]'
                                : tx.txType === 'gelen_fatura'
                                ? 'bg-[#0066B3]/10 text-[#0066B3]'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {PROJECT_TX_TYPE_LABELS[tx.txType]}
                          </span>
                          <span className="font-mono text-[#4E5D6C] tabular-nums">
                            {formatTurkishDate(tx.txDate)}
                          </span>
                          {tx.invoiceNo && (
                            <span className="font-mono font-semibold text-[#0B2239]">
                              Belge: {tx.invoiceNo}
                            </span>
                          )}
                          <span className="text-[#4E5D6C]">· {tx.category}</span>
                        </div>

                        <div className="text-sm font-bold text-[#0B2239]">{tx.title}</div>
                        <div className="text-xs text-[#4E5D6C] flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span>
                            Firma: <strong className="text-[#0B2239]">{tx.companyName}</strong>
                          </span>
                          <span>· {ACCOUNTING_PAYMENT_METHOD_LABELS[tx.paymentMethod]}</span>
                          <span
                            className={
                              tx.paymentStatus === 'odendi'
                                ? 'text-[#007A53] font-semibold'
                                : tx.paymentStatus === 'iptal'
                                ? 'text-red-700 font-semibold'
                                : 'text-amber-700 font-semibold'
                            }
                          >
                            · {ACCOUNTING_PAYMENT_STATUS_LABELS[tx.paymentStatus]}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 shrink-0">
                        <div className="text-right">
                          <div
                            className={`text-sm font-mono font-bold tabular-nums ${
                              tx.paymentStatus === 'iptal'
                                ? 'text-[#868686] line-through'
                                : isIncome
                                ? 'text-[#007A53]'
                                : 'text-red-700'
                            }`}
                          >
                            {isIncome ? '+' : '-'}
                            {formatCurrency(tx.totalAmount, tx.currency)}
                          </div>
                          {tx.vatRate > 0 && (
                            <div className="text-[11px] font-mono text-[#4E5D6C] tabular-nums">
                              KDV %{tx.vatRate} dahil
                            </div>
                          )}
                        </div>

                        {isManager && (
                          <div className="flex items-center gap-1.5">
                            {tx.paymentStatus !== 'odendi' && tx.paymentStatus !== 'iptal' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={async () => {
                                  setBusyTxId(tx.id);
                                  try {
                                    await onMarkTransactionPaid(tx);
                                  } finally {
                                    setBusyTxId(null);
                                  }
                                }}
                                title="Ödendi / Tahsil Edildi İşaretle"
                                className="min-h-[36px] px-2.5 inline-flex items-center gap-1 border border-[#007A53]/50 hover:bg-[#007A53]/15 text-[#007A53] text-xs font-semibold rounded-md cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Ödendi</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onEditTransaction(tx)}
                              aria-label="İşlemi Düzenle"
                              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] rounded-md cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {canDeleteTx ? (
                              confirmDeleteTxId === tx.id ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={async () => {
                                    setBusyTxId(tx.id);
                                    try {
                                      await onDeleteTransaction(project, tx);
                                      setConfirmDeleteTxId(null);
                                    } finally {
                                      setBusyTxId(null);
                                    }
                                  }}
                                  className="min-h-[36px] px-2.5 bg-red-700 text-white text-xs font-semibold rounded-md cursor-pointer"
                                >
                                  Silmeyi Onayla
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteTxId(tx.id)}
                                  aria-label="İşlemi Sil"
                                  className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-red-50 hover:text-red-700 text-[#4E5D6C] rounded-md cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )
                            ) : (
                              <span
                                title="Yalnızca kaydı oluşturan silebilir"
                                className="inline-flex items-center justify-center min-w-[28px] text-[#868686]"
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Delete Project (Manager + Creator Only) */}
          {canDeleteOwnProject && (
            <div className="pt-4 border-t border-[#DCE3EC] flex items-center justify-between">
              {!confirmDeleteProject ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteProject(true)}
                  className="min-h-[42px] px-3 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
                >
                  Bu Projeyi Geri Dönüşüm Kutusuna Taşı
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-red-700 font-medium">
                    Proje ve bağlı tüm fatura/gider kayıtları geri dönüşüm kutusuna taşınsın mı?
                  </span>
                  <button
                    type="button"
                    disabled={deletingProject}
                    onClick={async () => {
                      setDeletingProject(true);
                      setErrorMsg(null);
                      try {
                        await onDeleteProject(project);
                        onClose();
                      } catch (err) {
                        setErrorMsg(
                          err instanceof Error ? err.message : 'Proje silinemedi.'
                        );
                      } finally {
                        setDeletingProject(false);
                      }
                    }}
                    className="min-h-[38px] px-3 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60"
                  >
                    {deletingProject ? 'Taşınıyor…' : 'Evet, Sil'}
                  </button>
                  <button
                    type="button"
                    disabled={deletingProject}
                    onClick={() => setConfirmDeleteProject(false)}
                    className="min-h-[38px] px-3 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs rounded-lg cursor-pointer"
                  >
                    Vazgeç
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
