/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { BellRing, Loader2, X, ArrowRight } from 'lucide-react';
import { auth } from './lib/firebase';
import {
  AccountingChequeInput,
  AccountingCompanyInput,
  AccountingEntryInput,
  BidProductInput,
  buildMemberIds,
  createAccountingCheque,
  createAccountingCompany,
  createAccountingEntry,
  createBidProduct,
  createProject,
  createProjectTransaction,
  createSalesQuote,
  createTender,
  deleteAccountingCheque,
  deleteAccountingCompany,
  deleteAccountingEntry,
  deleteBidProduct,
  deleteProject,
  deleteProjectTransaction,
  deleteSalesQuote,
  deleteTender,
  ensureUserAuthorization,
  linkProjectToSalesQuote,
  loadSampleTenderScenario,
  ProjectInput,
  ProjectTransactionInput,
  reassignProjectManagers,
  SalesQuoteInput,
  saveTenderPricingSheet,
  subscribeAccountingCheques,
  subscribeAccountingCompanies,
  subscribeAccountingEntries,
  subscribeAllUsers,
  subscribeBidProducts,
  subscribeCompanyProfile,
  subscribeCompanyVault,
  subscribeCurrentUserAuth,
  subscribeProjects,
  subscribeProjectTransactions,
  subscribeRecycleBin,
  subscribeSalesQuotes,
  subscribeTenderPricingSheets,
  subscribeTenders,
  subscribeUserInvites,
  syncWorkspaceMemberIds,
  TenderInput,
  TenderPricingSheetInput,
  updateAccountingCheque,
  updateAccountingChequeStatus,
  updateAccountingCompany,
  updateAccountingEntry,
  updateAccountingEntryPayment,
  updateBidProduct,
  updateProject,
  updateProjectTransaction,
  updateProjectTransactionPayment,
  updateSalesQuote,
  updateSalesQuoteStatus,
  updateTender,
  updateUserAuthorization,
} from './services/firestoreService';
import { getTodayDateStr } from './lib/trackingAndCalendar';
import {
  dispatchBrowserNotification,
  getDueMorningAlerts,
  getNextMorningTriggerDelayMs,
  getNotificationPermission,
  loadNotificationPrefs,
  markNotifiedTenderMorning,
  NotificationPrefs,
  requestBrowserNotificationPermission,
  saveNotificationPrefs,
} from './lib/morningNotifications';
import {
  AccountingCheque,
  AccountingChequeStatus,
  AccountingCompany,
  AccountingEntry,
  ActiveView,
  ActorIdentity,
  BidProduct,
  BOOTSTRAP_ADMIN_EMAIL,
  CompanyProfile,
  CompanyVaultDocument,
  FULL_PERMISSIONS,
  hasAccountingAccess,
  hasPricingAccess,
  hasProjectsAccess,
  hasQuotesAccess,
  isProjectManager,
  Project,
  ProjectTransaction,
  ProjectTransactionType,
  RecycleBinItem,
  SalesQuote,
  SalesQuoteDocType,
  SalesQuoteStatus,
  Tender,
  TenderPricingSheet,
  UserAuthorization,
  UserInvite,
  UserPermissions,
  ZERO_PERMISSIONS,
} from './types/tender';
import { AuthGate } from './components/AuthGate';
import { PendingAccessGate } from './components/PendingAccessGate';
import { AppShell } from './components/AppShell';
import { HomeView } from './components/HomeView';
import { OverviewView } from './components/OverviewView';
import { CalendarView } from './components/CalendarView';
import { TenderDayView } from './components/TenderDayView';
import { TendersListView } from './components/TendersListView';
import { TenderPricingView } from './components/TenderPricingView';
import { SalesQuotesView } from './components/SalesQuotesView';
import { ProjectsView } from './components/ProjectsView';
import { BidProductsView } from './components/BidProductsView';
import { AccountingView } from './components/AccountingView';
import { VaultView } from './components/VaultView';
import { RecycleBinView } from './components/RecycleBinView';
import { SettingsView } from './components/SettingsView';
import { UserManagementView } from './components/UserManagementView';
import { TenderFormModal } from './components/TenderFormModal';
import { SalesQuoteFormModal } from './components/SalesQuoteFormModal';
import { SalesQuoteDetailModal } from './components/SalesQuoteDetailModal';
import { BidProductFormModal, BidProductPrefill } from './components/BidProductFormModal';
import { AccountingCompanyModal } from './components/AccountingCompanyModal';
import { AccountingEntryModal, AccountingEntryPrefill } from './components/AccountingEntryModal';
import { AccountingEntryDetailModal } from './components/AccountingEntryDetailModal';
import { AccountingChequeModal, AccountingChequePrefill } from './components/AccountingChequeModal';
import { AccountingChequeDetailModal } from './components/AccountingChequeDetailModal';
import { ProjectFormModal } from './components/ProjectFormModal';
import {
  ProjectTransactionModal,
  ProjectTransactionPrefill,
} from './components/ProjectTransactionModal';
import { ProjectDetailModal } from './components/ProjectDetailModal';
import { TenderDetailDrawer } from './components/TenderDetailDrawer';
import { BidProductDetailModal } from './components/BidProductDetailModal';
import { DocumentPreviewModal, PreviewTarget } from './components/DocumentPreviewModal';
import {
  InvoicePdfImportPayload,
  InvoicePdfImportResult,
} from './components/InvoicePdfImportModal';
import { TiniatechLogo } from './components/TiniatechLogo';

function formatAuthCheckError(err: unknown): { message: string; isQuotaError: boolean } {
  let rawMsg = '';
  if (err instanceof Error) {
    try {
      const parsed = JSON.parse(err.message) as { error?: string };
      rawMsg = parsed?.error || err.message;
    } catch {
      rawMsg = err.message;
    }
  } else {
    rawMsg = String(err || '');
  }

  if (
    rawMsg.includes('Quota exceeded') ||
    rawMsg.includes('Quota limit exceeded') ||
    rawMsg.includes('Free daily read units') ||
    rawMsg.includes('RESOURCE_EXHAUSTED')
  ) {
    return {
      isQuotaError: true,
      message:
        'Firestore ücretsiz katman (Spark) günlük okuma kotası dolduğu için yetki kaydı şu anda doğrulanamıyor. Kota ertesi gün otomatik sıfırlanır veya Firebase konsolundan veritabanı planı yükseltilerek erişim hemen açılabilir.',
    };
  }

  if (
    rawMsg.includes('permission') ||
    rawMsg.includes('PERMISSION_DENIED') ||
    rawMsg.includes('403')
  ) {
    return {
      isQuotaError: false,
      message:
        'Firestore yetki doğrulaması başarısız oldu (403 / Permission Denied). Lütfen yöneticinizden davet kaydınızı yenilemesini veya erişimlerinizi senkronize etmesini isteyin.',
    };
  }

  return {
    isQuotaError: false,
    message: rawMsg
      ? `Yetki durumu kontrol edilirken hata oluştu: ${rawMsg}`
      : 'Yetki durumu yeniden kontrol edilirken hata oluştu.',
  };
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userAuth, setUserAuth] = useState<UserAuthorization | null>(null);
  const [userAuthLoading, setUserAuthLoading] = useState(false);
  const [authSetupError, setAuthSetupError] = useState<string | null>(null);
  const [authQuotaExceeded, setAuthQuotaExceeded] = useState(false);

  const [activeView, setActiveView] = useState<ActiveView>('home');

  const [tenders, setTenders] = useState<Tender[]>([]);
  const [bidProducts, setBidProducts] = useState<BidProduct[]>([]);
  const [pricingSheets, setPricingSheets] = useState<TenderPricingSheet[]>([]);
  const [salesQuotes, setSalesQuotes] = useState<SalesQuote[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectTransactions, setProjectTransactions] = useState<ProjectTransaction[]>([]);
  const [accountingCompanies, setAccountingCompanies] = useState<AccountingCompany[]>([]);
  const [accountingEntries, setAccountingEntries] = useState<AccountingEntry[]>([]);
  const [accountingCheques, setAccountingCheques] = useState<AccountingCheque[]>([]);
  const [companyVault, setCompanyVault] = useState<CompanyVaultDocument[]>([]);
  const [recycleBinItems, setRecycleBinItems] = useState<RecycleBinItem[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [workspaceUsers, setWorkspaceUsers] = useState<UserAuthorization[]>([]);
  const [userInvites, setUserInvites] = useState<UserInvite[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const lastSyncedMembersKeyRef = useRef<string>('');

  // Morning Browser Notifications & In-App Alert Banner
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    enabled: true,
    morningTime: '08:00',
  });
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => getNotificationPermission());
  const [morningAlerts, setMorningAlerts] = useState<Tender[]>([]);

  // Modals & Drawers
  const [formOpen, setFormOpen] = useState(false);
  const [editingTender, setEditingTender] = useState<Tender | null>(null);
  const [formInitialDate, setFormInitialDate] = useState<string | undefined>(undefined);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<BidProduct | null>(null);
  const [productDefaultTenderId, setProductDefaultTenderId] = useState<string>('');
  const [productPrefill, setProductPrefill] = useState<BidProductPrefill | null>(null);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectDefaultTenderId, setProjectDefaultTenderId] = useState<string>('');
  const [projectDefaultQuoteId, setProjectDefaultQuoteId] = useState<string>('');
  const [quoteFormOpen, setQuoteFormOpen] = useState(false);
  const [quoteDefaultDocType, setQuoteDefaultDocType] = useState<SalesQuoteDocType>('teklif');
  const [editingQuote, setEditingQuote] = useState<SalesQuote | null>(null);
  const [detailQuoteId, setDetailQuoteId] = useState<string | null>(null);
  const [projectTxModalOpen, setProjectTxModalOpen] = useState(false);
  const [editingProjectTx, setEditingProjectTx] = useState<ProjectTransaction | null>(null);
  const [projectTxPrefill, setProjectTxPrefill] =
    useState<ProjectTransactionPrefill | null>(null);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [accountingCompanyModalOpen, setAccountingCompanyModalOpen] = useState(false);
  const [editingAccountingCompany, setEditingAccountingCompany] =
    useState<AccountingCompany | null>(null);
  const [accountingCompanyInitialName, setAccountingCompanyInitialName] = useState('');
  const [accountingEntryModalOpen, setAccountingEntryModalOpen] = useState(false);
  const [editingAccountingEntry, setEditingAccountingEntry] =
    useState<AccountingEntry | null>(null);
  const [accountingEntryPrefill, setAccountingEntryPrefill] =
    useState<AccountingEntryPrefill | null>(null);
  const [detailAccountingEntryId, setDetailAccountingEntryId] = useState<string | null>(null);
  const [accountingChequeModalOpen, setAccountingChequeModalOpen] = useState(false);
  const [editingAccountingCheque, setEditingAccountingCheque] =
    useState<AccountingCheque | null>(null);
  const [accountingChequePrefill, setAccountingChequePrefill] =
    useState<AccountingChequePrefill | null>(null);
  const [detailAccountingChequeId, setDetailAccountingChequeId] = useState<string | null>(null);
  const [detailTenderId, setDetailTenderId] = useState<string | null>(null);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [tenderDayTargetId, setTenderDayTargetId] = useState<string | null>(null);
  const [pricingTargetTenderId, setPricingTargetTenderId] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const deepLinkAppliedRef = useRef(false);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (!firebaseUser) {
        setUserAuth(null);
        setUserAuthLoading(false);
        setTenders([]);
        setBidProducts([]);
        setPricingSheets([]);
        setSalesQuotes([]);
        setProjects([]);
        setProjectTransactions([]);
        setAccountingCompanies([]);
        setAccountingEntries([]);
        setAccountingCheques([]);
        setCompanyVault([]);
        setRecycleBinItems([]);
        setCompanyProfile(null);
        setWorkspaceUsers([]);
        setUserInvites([]);
        setMorningAlerts([]);
        setDataLoading(false);
        lastSyncedMembersKeyRef.current = '';
      } else {
        setUserAuthLoading(true);
        setNotificationPrefs(loadNotificationPrefs(firebaseUser.uid));
        setNotificationPermission(getNotificationPermission());
      }
    });
    return () => unsub();
  }, []);

  // Ensure /users/{uid} authorization record & subscribe to live updates
  useEffect(() => {
    if (!authReady || !user) {
      setAuthSetupError(null);
      setAuthQuotaExceeded(false);
      return;
    }
    let active = true;
    let unsubAuthDoc: (() => void) | null = null;
    setUserAuthLoading(true);
    setAuthSetupError(null);
    setAuthQuotaExceeded(false);

    ensureUserAuthorization(user)
      .then((resolved) => {
        if (!active) return;
        setUserAuth(resolved);
        setAuthSetupError(null);
        setAuthQuotaExceeded(false);
        setUserAuthLoading(false);

        unsubAuthDoc = subscribeCurrentUserAuth(user.uid, (docData) => {
          if (!active) return;
          if (docData) {
            setUserAuth(docData);
            setAuthSetupError(null);
            setAuthQuotaExceeded(false);
            setUserAuthLoading(false);
          }
        });
      })
      .catch((err) => {
        if (!active) return;
        const formatted = formatAuthCheckError(err);
        setAuthSetupError(formatted.message);
        setAuthQuotaExceeded(formatted.isQuotaError);
        setUserAuthLoading(false);
      });

    return () => {
      active = false;
      if (unsubAuthDoc) unsubAuthDoc();
    };
  }, [authReady, user?.uid]);

  const workspaceOwnerId = useMemo(() => {
    if (!userAuth || !user) return '';
    return userAuth.workspaceOwnerId || user.uid;
  }, [userAuth, user]);

  const isBootstrapAdmin = useMemo(() => {
    return (user?.email || '').toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
  }, [user?.email]);

  const isActiveAuthorized = Boolean(userAuth && userAuth.status === 'active');

  const permissions: UserPermissions = useMemo(() => {
    if (!userAuth || userAuth.status !== 'active') return ZERO_PERMISSIONS;
    if (userAuth.role === 'admin') return FULL_PERMISSIONS;
    return userAuth.permissions || ZERO_PERMISSIONS;
  }, [userAuth]);

  const canViewProjects = useMemo(
    () => Boolean(isActiveAuthorized && hasProjectsAccess(permissions, userAuth?.role)),
    [isActiveAuthorized, permissions, userAuth?.role]
  );

  // Redirect away from admin-only or permission-gated views if role/permissions change
  useEffect(() => {
    if (activeView === 'users' && userAuth && userAuth.role !== 'admin') {
      setActiveView('home');
    }
    if (activeView === 'projects' && userAuth && !canViewProjects) {
      setActiveView('home');
      setDetailProjectId(null);
    }
  }, [activeView, userAuth, canViewProjects]);

  // Workspace data subscriptions (only when status === 'active')
  useEffect(() => {
    if (!authReady || !user || !isActiveAuthorized || !workspaceOwnerId) {
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    let tendersLoaded = false;

    const unsubTenders = subscribeTenders(user.uid, workspaceOwnerId, (items) => {
      setTenders(items);
      tendersLoaded = true;
      setDataLoading(false);
    });
    const unsubBidProducts = subscribeBidProducts(
      user.uid,
      workspaceOwnerId,
      setBidProducts
    );
    const unsubPricingSheets = subscribeTenderPricingSheets(
      user.uid,
      workspaceOwnerId,
      setPricingSheets
    );
    const unsubSalesQuotes = subscribeSalesQuotes(
      user.uid,
      workspaceOwnerId,
      setSalesQuotes
    );
    const unsubAccountingCompanies = subscribeAccountingCompanies(
      user.uid,
      workspaceOwnerId,
      setAccountingCompanies
    );
    const unsubAccountingEntries = subscribeAccountingEntries(
      user.uid,
      workspaceOwnerId,
      setAccountingEntries
    );
    const unsubAccountingCheques = subscribeAccountingCheques(
      user.uid,
      workspaceOwnerId,
      setAccountingCheques
    );
    const unsubVault = subscribeCompanyVault(
      user.uid,
      workspaceOwnerId,
      setCompanyVault
    );
    const unsubRecycleBin = subscribeRecycleBin(
      user.uid,
      workspaceOwnerId,
      setRecycleBinItems
    );
    const unsubProfile = subscribeCompanyProfile(workspaceOwnerId, (prof) => {
      setCompanyProfile(prof);
      setProfileLoaded(true);
    });

    let unsubUsers = () => {};
    let unsubInvites = () => {};
    if (userAuth?.role === 'admin') {
      unsubUsers = subscribeAllUsers(user.uid, isBootstrapAdmin, setWorkspaceUsers);
      unsubInvites = subscribeUserInvites(user.uid, isBootstrapAdmin, setUserInvites);
    } else {
      setWorkspaceUsers([]);
      setUserInvites([]);
    }

    const safetyTimer = setTimeout(() => {
      if (!tendersLoaded) setDataLoading(false);
    }, 3000);

    return () => {
      clearTimeout(safetyTimer);
      unsubTenders();
      unsubBidProducts();
      unsubPricingSheets();
      unsubSalesQuotes();
      unsubAccountingCompanies();
      unsubAccountingEntries();
      unsubAccountingCheques();
      unsubVault();
      unsubRecycleBin();
      unsubProfile();
      unsubUsers();
      unsubInvites();
    };
  }, [
    authReady,
    user?.uid,
    isActiveAuthorized,
    workspaceOwnerId,
    userAuth?.role,
    isBootstrapAdmin,
  ]);

  // Admin-gated Project Management subscriptions
  useEffect(() => {
    if (!authReady || !user || !isActiveAuthorized || !workspaceOwnerId || !canViewProjects) {
      setProjects([]);
      setProjectTransactions([]);
      return;
    }

    const unsubProjects = subscribeProjects(user.uid, workspaceOwnerId, setProjects);
    const unsubProjectTxs = subscribeProjectTransactions(
      user.uid,
      workspaceOwnerId,
      setProjectTransactions
    );

    return () => {
      unsubProjects();
      unsubProjectTxs();
    };
  }, [authReady, user?.uid, isActiveAuthorized, workspaceOwnerId, canViewProjects]);

  // Active member UIDs for new workspace records & sync
  const activeMemberIds = useMemo(() => {
    const adminList = workspaceUsers
      .filter(
        (u) =>
          u.status === 'active' &&
          (u.workspaceOwnerId === workspaceOwnerId || u.uid === workspaceOwnerId)
      )
      .map((u) => u.uid);
    return buildMemberIds(workspaceOwnerId, [
      ...(companyProfile?.memberIds || []),
      ...adminList,
    ]);
  }, [workspaceOwnerId, workspaceUsers, companyProfile?.memberIds]);

  const handleSyncWorkspace = useCallback(async (): Promise<number> => {
    if (!workspaceOwnerId || userAuth?.role !== 'admin') return 0;
    const activeUids = workspaceUsers
      .filter(
        (u) =>
          u.status === 'active' &&
          (u.workspaceOwnerId === workspaceOwnerId || u.uid === workspaceOwnerId)
      )
      .map((u) => u.uid);
    return syncWorkspaceMemberIds(workspaceOwnerId, activeUids);
  }, [workspaceOwnerId, userAuth?.role, workspaceUsers]);

  // Automatically sync memberIds ONLY when membership actually drifts (never on every page reload)
  useEffect(() => {
    if (
      !isActiveAuthorized ||
      userAuth?.role !== 'admin' ||
      !workspaceOwnerId ||
      dataLoading ||
      !profileLoaded
    ) {
      return;
    }
    const activeUids = Array.from(
      new Set(
        workspaceUsers
          .filter(
            (u) =>
              u.status === 'active' &&
              (u.workspaceOwnerId === workspaceOwnerId || u.uid === workspaceOwnerId)
          )
          .map((u) => u.uid)
          .concat(workspaceOwnerId)
      )
    ).sort();

    if (activeUids.length === 0) return;

    // Skip sync if companyProfile already records the exact same active member list
    const profileMembers = Array.from(new Set(companyProfile?.memberIds || [])).sort();
    const alreadySynced =
      companyProfile !== null &&
      profileMembers.length === activeUids.length &&
      profileMembers.every((uid, idx) => uid === activeUids[idx]);
    if (alreadySynced) return;

    // If no company profile exists yet and no shared team members beyond admin exist, no sync needed
    if (companyProfile === null && activeUids.length <= 1) return;

    const key = `${workspaceOwnerId}:${activeUids.join(',')}`;
    if (lastSyncedMembersKeyRef.current === key) return;
    lastSyncedMembersKeyRef.current = key;

    syncWorkspaceMemberIds(workspaceOwnerId, activeUids).catch(() => {
      // Allow retry if sync failed
      lastSyncedMembersKeyRef.current = '';
    });
  }, [
    isActiveAuthorized,
    userAuth?.role,
    workspaceOwnerId,
    workspaceUsers,
    dataLoading,
    profileLoaded,
    companyProfile,
  ]);

  // Support opening Tender, Product or Accounting detail directly in a new tab/window via ?detail=tender|product|accounting&id=...
  useEffect(() => {
    if (!isActiveAuthorized || dataLoading || deepLinkAppliedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const detailType = params.get('detail');
    const targetId = params.get('id');
    if (!detailType || !targetId) {
      deepLinkAppliedRef.current = true;
      return;
    }
    if (detailType === 'tender' && tenders.some((t) => t.id === targetId)) {
      deepLinkAppliedRef.current = true;
      setActiveView('tenders');
      setDetailTenderId(targetId);
    } else if (detailType === 'product' && bidProducts.some((p) => p.id === targetId)) {
      deepLinkAppliedRef.current = true;
      setActiveView('products');
      setDetailProductId(targetId);
    } else if (
      detailType === 'accounting' &&
      accountingEntries.some((e) => e.id === targetId)
    ) {
      deepLinkAppliedRef.current = true;
      setActiveView('accounting');
      setDetailAccountingEntryId(targetId);
    } else if (
      detailType === 'cheque' &&
      accountingCheques.some((ch) => ch.id === targetId)
    ) {
      deepLinkAppliedRef.current = true;
      setActiveView('accounting');
      setDetailAccountingChequeId(targetId);
    } else if (
      detailType === 'project' &&
      canViewProjects &&
      projects.some((p) => p.id === targetId)
    ) {
      deepLinkAppliedRef.current = true;
      setActiveView('projects');
      setDetailProjectId(targetId);
    } else if (
      detailType === 'quote' &&
      salesQuotes.some((q) => q.id === targetId)
    ) {
      deepLinkAppliedRef.current = true;
      setActiveView('quotes');
      setDetailQuoteId(targetId);
    }
  }, [
    isActiveAuthorized,
    dataLoading,
    canViewProjects,
    tenders,
    bidProducts,
    salesQuotes,
    projects,
    accountingEntries,
    accountingCheques,
  ]);

  const checkAndTriggerMorningAlerts = useCallback(() => {
    if (!user || !isActiveAuthorized || tenders.length === 0) return;
    const due = getDueMorningAlerts(user.uid, tenders, notificationPrefs);
    if (due.length === 0) return;

    for (const tender of due) {
      markNotifiedTenderMorning(user.uid, tender.id, tender.tenderDate);
      dispatchBrowserNotification(tender, (tenderId) => {
        setTenderDayTargetId(tenderId);
        setActiveView('tender-day');
      });
    }

    setMorningAlerts((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const merged = [...prev];
      for (const d of due) {
        if (!existingIds.has(d.id)) merged.push(d);
      }
      return merged;
    });
  }, [user, isActiveAuthorized, tenders, notificationPrefs]);

  useEffect(() => {
    if (!user || !isActiveAuthorized || dataLoading || !notificationPrefs.enabled) return;

    checkAndTriggerMorningAlerts();

    const delayMs = getNextMorningTriggerDelayMs(user.uid, tenders, notificationPrefs);
    const timer =
      delayMs !== null
        ? setTimeout(() => {
            checkAndTriggerMorningAlerts();
          }, delayMs)
        : null;

    const interval = setInterval(() => {
      checkAndTriggerMorningAlerts();
    }, 60000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkAndTriggerMorningAlerts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [
    user,
    isActiveAuthorized,
    dataLoading,
    tenders,
    notificationPrefs,
    checkAndTriggerMorningAlerts,
  ]);

  if (!authReady || (user && userAuthLoading && !userAuth)) {
    return (
      <div className="min-h-screen bg-[#F3F6FA] flex flex-col items-center justify-center gap-5 p-6">
        <TiniatechLogo variant="plaque" subtitle="Kurumsal Erişim" />
        <div className="flex items-center gap-3 text-[#4E5D6C] text-sm font-medium">
          <Loader2 className="w-5 h-5 animate-spin text-[#0066B3]" />
          <span>Oturum ve yetkiler doğrulanıyor…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthGate />;
  }

  if (!userAuth || userAuth.status !== 'active') {
    const fallbackAuth: UserAuthorization = userAuth || {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      department: '',
      role: 'goruntuleyici',
      status: 'pending',
      workspaceOwnerId: '',
      inviteId: '',
      permissions: { ...ZERO_PERMISSIONS },
      approvedBy: '',
    };

    return (
      <PendingAccessGate
        userAuth={fallbackAuth}
        setupError={authSetupError}
        isQuotaError={authQuotaExceeded}
        onRetryCheck={async () => {
          setAuthSetupError(null);
          setAuthQuotaExceeded(false);
          try {
            const refreshed = await ensureUserAuthorization(user);
            setUserAuth(refreshed);
          } catch (err) {
            const formatted = formatAuthCheckError(err);
            setAuthSetupError(formatted.message);
            setAuthQuotaExceeded(formatted.isQuotaError);
          }
        }}
        onSignOut={() => signOut(auth)}
      />
    );
  }

  const actor: ActorIdentity = {
    uid: user.uid,
    email: (user.email || userAuth.email || '').toLowerCase(),
    displayName: userAuth.displayName || user.displayName || user.email || 'Kullanıcı',
  };

  const todayStr = getTodayDateStr();
  const todayTendersCount = tenders.filter(
    (t) => t.tenderDate === todayStr && t.status !== 'iptal'
  ).length;
  const pendingUsersCount = workspaceUsers.filter((u) => u.status === 'pending').length;

  const canManageAccounting = hasAccountingAccess(permissions, userAuth.role);
  const canManageQuotes = hasQuotesAccess(permissions, userAuth.role);
  const canManagePricing = hasPricingAccess(permissions, userAuth.role);

  const selectedDetailTender =
    tenders.find((t) => t.id === detailTenderId) || null;
  const selectedDetailProduct =
    bidProducts.find((p) => p.id === detailProductId) || null;
  const selectedDetailQuote =
    salesQuotes.find((q) => q.id === detailQuoteId) || null;
  const selectedDetailProject =
    canViewProjects ? projects.find((p) => p.id === detailProjectId) || null : null;
  const selectedDetailAccountingEntry =
    accountingEntries.find((e) => e.id === detailAccountingEntryId) || null;
  const selectedDetailAccountingCheque =
    accountingCheques.find((ch) => ch.id === detailAccountingChequeId) || null;

  const clearDetailUrlParamIfMatching = (
    type: 'tender' | 'product' | 'accounting' | 'cheque' | 'project' | 'quote'
  ) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('detail') === type) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleOpenNewTender = (initialDate?: string) => {
    if (!permissions.canCreateTender) return;
    setEditingTender(null);
    setFormInitialDate(initialDate);
    setFormOpen(true);
  };

  const handleOpenEditTender = (tender: Tender) => {
    if (!permissions.canEditTender) return;
    setEditingTender(tender);
    setFormInitialDate(undefined);
    setFormOpen(true);
  };

  const handleSaveTender = async (data: TenderInput) => {
    if (editingTender) {
      if (!permissions.canEditTender) return;
      await updateTender(editingTender.id, data, {
        currentUid: user.uid,
        workspaceOwnerId,
        canSyncProducts: permissions.canManageProducts,
      });
    } else {
      if (!permissions.canCreateTender) return;
      const createdId = await createTender(
        workspaceOwnerId,
        data,
        activeMemberIds,
        actor
      );
      setDetailTenderId(createdId);
    }
  };

  const handleOpenTenderDay = (tenderId?: string) => {
    if (tenderId) setTenderDayTargetId(tenderId);
    setActiveView('tender-day');
  };

  const handleOpenPricing = (tenderId?: string) => {
    if (tenderId) setPricingTargetTenderId(tenderId);
    setActiveView('pricing');
  };

  const handleSavePricingSheet = async (input: TenderPricingSheetInput) => {
    if (!canManagePricing) {
      throw new Error('İhale fiyat çalışması düzenleme yetkiniz bulunmuyor.');
    }
    const hasExistingSheet = pricingSheets.some((s) => s.tenderId === input.tenderId);
    return saveTenderPricingSheet(
      workspaceOwnerId,
      input,
      activeMemberIds,
      actor,
      hasExistingSheet
    );
  };

  const handleOpenNewProduct = (
    defaultTenderId = '',
    prefill: BidProductPrefill | null = null
  ) => {
    if (!permissions.canManageProducts) return;
    setEditingProduct(null);
    setProductDefaultTenderId(defaultTenderId);
    setProductPrefill(prefill);
    setProductFormOpen(true);
  };

  const handleOpenEditProduct = (product: BidProduct) => {
    if (!permissions.canManageProducts) return;
    setEditingProduct(product);
    setProductDefaultTenderId(product.tenderId || '');
    setProductPrefill(null);
    setProductFormOpen(true);
  };

  const handleSaveProduct = async (data: BidProductInput) => {
    if (!permissions.canManageProducts) return;
    if (editingProduct) {
      await updateBidProduct(editingProduct.id, data);
    } else {
      await createBidProduct(workspaceOwnerId, data, activeMemberIds, actor);
    }
  };

  const handleDeleteProduct = async (product: BidProduct) => {
    if (!permissions.canManageProducts) return;
    await deleteBidProduct(user.uid, workspaceOwnerId, product, {
      actor,
      memberIds: activeMemberIds,
    });
  };

  const handleDuplicateProductForNewCompany = (product: BidProduct) => {
    if (!permissions.canManageProducts) return;
    handleOpenNewProduct(product.tenderId || '', {
      tenderId: product.tenderId || '',
      materialName: product.materialName,
      stockNumber: product.stockNumber,
      partNumber: product.partNumber,
      supplierCompany: '',
    });
  };

  const handleOpenNewAccountingCompany = (initialName = '') => {
    if (!canManageAccounting) return;
    setEditingAccountingCompany(null);
    setAccountingCompanyInitialName(initialName);
    setAccountingCompanyModalOpen(true);
  };

  const handleOpenEditAccountingCompany = (company: AccountingCompany) => {
    if (!canManageAccounting) return;
    setEditingAccountingCompany(company);
    setAccountingCompanyInitialName('');
    setAccountingCompanyModalOpen(true);
  };

  const handleSaveAccountingCompany = async (data: AccountingCompanyInput) => {
    if (!canManageAccounting) return;
    if (editingAccountingCompany) {
      await updateAccountingCompany(editingAccountingCompany.id, data);
    } else {
      await createAccountingCompany(workspaceOwnerId, data, activeMemberIds, actor);
    }
  };

  const handleDeleteAccountingCompany = async (company: AccountingCompany) => {
    if (!canManageAccounting) return;
    await deleteAccountingCompany(user.uid, workspaceOwnerId, company, {
      actor,
      memberIds: activeMemberIds,
    });
  };

  const handleOpenNewAccountingEntry = (prefill: AccountingEntryPrefill | null = null) => {
    if (!canManageAccounting) return;
    setEditingAccountingEntry(null);
    setAccountingEntryPrefill(prefill);
    setAccountingEntryModalOpen(true);
  };

  const handleCreateAccountingFromProduct = (product: BidProduct) => {
    handleOpenNewAccountingEntry({
      entryType: 'alis_faturasi',
      companyName: product.supplierCompany,
      title: product.materialName,
      stockNumber: product.stockNumber,
      partNumber: product.partNumber,
      unitPrice: product.offeredSalePrice,
      quantity: 1,
      unit: 'Adet',
      currency: product.currency,
      tenderId: product.tenderId || '',
    });
  };

  const handleOpenEditAccountingEntry = (entry: AccountingEntry) => {
    if (!canManageAccounting) return;
    setEditingAccountingEntry(entry);
    setAccountingEntryPrefill(null);
    setAccountingEntryModalOpen(true);
  };

  const handleSaveAccountingEntry = async (
    data: AccountingEntryInput,
    options?: { alsoCreateProduct?: boolean; alsoEnsureCompany?: boolean }
  ) => {
    if (!canManageAccounting) return;
    let resolvedCompanyId = data.companyId;
    if (
      !resolvedCompanyId &&
      options?.alsoEnsureCompany &&
      data.companyName.trim()
    ) {
      const existing = accountingCompanies.find(
        (c) => c.name.trim().toLowerCase() === data.companyName.trim().toLowerCase()
      );
      if (existing) {
        resolvedCompanyId = existing.id;
      } else {
        resolvedCompanyId = await createAccountingCompany(
          workspaceOwnerId,
          {
            name: data.companyName.trim(),
            companyType: data.entryType === 'satis_faturasi' ? 'musteri' : 'tedarikci',
            taxOffice: '',
            taxNumber: '',
            contactPerson: '',
            phone: '',
            email: '',
            address: '',
            iban: '',
            notes: '',
          },
          activeMemberIds,
          actor
        );
      }
    }

    const payload: AccountingEntryInput = {
      ...data,
      companyId: resolvedCompanyId,
    };

    if (editingAccountingEntry) {
      await updateAccountingEntry(editingAccountingEntry.id, payload);
    } else {
      await createAccountingEntry(workspaceOwnerId, payload, activeMemberIds, actor);
      if (options?.alsoCreateProduct && permissions.canManageProducts) {
        await createBidProduct(
          workspaceOwnerId,
          {
            tenderId: payload.tenderId,
            tenderTrackingCode: payload.tenderTrackingCode,
            stockNumber: payload.stockNumber,
            partNumber: payload.partNumber,
            materialName: payload.title,
            supplierCompany: payload.companyName,
            priceDate: payload.entryDate,
            offeredSalePrice: payload.unitPrice > 0 ? payload.unitPrice : payload.totalAmount,
            currency: payload.currency,
            purchaseDate: payload.entryDate,
            quotedDate: payload.entryDate,
          },
          activeMemberIds,
          actor
        );
      }
    }
  };

  const handleMarkAccountingEntryPaid = async (entry: AccountingEntry) => {
    if (!canManageAccounting) return;
    await updateAccountingEntryPayment(
      entry.id,
      'odendi',
      entry.totalAmount,
      entry.paymentMethod
    );
  };

  const handleDeleteAccountingEntry = async (entry: AccountingEntry) => {
    if (!canManageAccounting) return;
    await deleteAccountingEntry(user.uid, workspaceOwnerId, entry, {
      actor,
      memberIds: activeMemberIds,
    });
  };

  const handleOpenNewAccountingCheque = (prefill: AccountingChequePrefill | null = null) => {
    if (!canManageAccounting) return;
    setEditingAccountingCheque(null);
    setAccountingChequePrefill(prefill);
    setAccountingChequeModalOpen(true);
  };

  const handleOpenEditAccountingCheque = (cheque: AccountingCheque) => {
    if (!canManageAccounting) return;
    setEditingAccountingCheque(cheque);
    setAccountingChequePrefill(null);
    setAccountingChequeModalOpen(true);
  };

  const handleSaveAccountingCheque = async (
    data: AccountingChequeInput,
    options?: { alsoEnsureCompany?: boolean; alsoLogAccountingEntry?: boolean }
  ) => {
    if (!canManageAccounting) return;
    let resolvedCompanyId = data.companyId;
    if (!resolvedCompanyId && options?.alsoEnsureCompany && data.companyName.trim()) {
      const existing = accountingCompanies.find(
        (c) => c.name.trim().toLowerCase() === data.companyName.trim().toLowerCase()
      );
      if (existing) {
        resolvedCompanyId = existing.id;
      } else {
        resolvedCompanyId = await createAccountingCompany(
          workspaceOwnerId,
          {
            name: data.companyName.trim(),
            companyType: data.direction === 'alinan' ? 'musteri' : 'tedarikci',
            taxOffice: '',
            taxNumber: '',
            contactPerson: '',
            phone: '',
            email: '',
            address: '',
            iban: '',
            notes: '',
          },
          activeMemberIds,
          actor
        );
      }
    }

    const payload: AccountingChequeInput = {
      ...data,
      companyId: resolvedCompanyId,
    };

    if (editingAccountingCheque) {
      await updateAccountingCheque(editingAccountingCheque.id, payload);
    } else {
      await createAccountingCheque(workspaceOwnerId, payload, activeMemberIds, actor);
      if (options?.alsoLogAccountingEntry) {
        await createAccountingEntry(
          workspaceOwnerId,
          {
            entryType: payload.direction === 'alinan' ? 'tahsilat' : 'odeme',
            companyId: payload.companyId,
            companyName: payload.companyName,
            invoiceNo: payload.chequeNo,
            title: `${payload.bankName} Çeki (${payload.chequeNo})`,
            stockNumber: '',
            partNumber: '',
            quantity: 1,
            unit: 'Adet',
            unitPrice: payload.amount,
            vatRate: 0,
            subtotalAmount: payload.amount,
            vatAmount: 0,
            totalAmount: payload.amount,
            paidAmount:
              payload.status === 'tahsil_edildi' || payload.status === 'odendi'
                ? payload.amount
                : 0,
            currency: payload.currency,
            entryDate: payload.issueDate || getTodayDateStr(),
            dueDate: payload.dueDate,
            paymentMethod: 'cek_senet',
            paymentStatus:
              payload.status === 'tahsil_edildi' || payload.status === 'odendi'
                ? 'odendi'
                : 'bekliyor',
            tenderId: payload.tenderId,
            tenderTrackingCode: payload.tenderTrackingCode,
            notes: payload.notes,
          },
          activeMemberIds,
          actor
        );
      }
    }
  };

  const handleUpdateAccountingChequeStatus = async (
    cheque: AccountingCheque,
    nextStatus: AccountingChequeStatus,
    endorsedTo = ''
  ) => {
    if (!canManageAccounting) return;
    await updateAccountingChequeStatus(cheque.id, nextStatus, endorsedTo);
  };

  const handleDeleteAccountingCheque = async (cheque: AccountingCheque) => {
    if (!canManageAccounting) return;
    await deleteAccountingCheque(user.uid, workspaceOwnerId, cheque, {
      actor,
      memberIds: activeMemberIds,
    });
  };

  const handleImportCompaniesFromProducts = async (names: string[]): Promise<number> => {
    if (!canManageAccounting) return 0;
    let count = 0;
    for (const name of names) {
      await createAccountingCompany(
        workspaceOwnerId,
        {
          name,
          companyType: 'tedarikci',
          taxOffice: '',
          taxNumber: '',
          contactPerson: '',
          phone: '',
          email: '',
          address: '',
          iban: '',
          notes: 'Ürün/işlem kayıtlarından otomatik aktarıldı',
        },
        activeMemberIds,
        actor
      );
      count += 1;
    }
    return count;
  };

  const handleImportInvoicePdf = async (
    payload: InvoicePdfImportPayload
  ): Promise<InvoicePdfImportResult> => {
    if (!canManageAccounting) {
      throw new Error('Ön muhasebe kaydı oluşturma yetkiniz bulunmuyor.');
    }

    const safeDate = (val: string, fallback = '') =>
      /^\d{4}-\d{2}-\d{2}$/.test((val || '').trim()) ? val.trim() : fallback;

    const entryDate = safeDate(payload.invoice.entryDate, getTodayDateStr());
    const dueDate = safeDate(payload.invoice.dueDate, '');
    const companyName = payload.company.name.trim() || 'Cari Firma';

    let companyCreated = false;
    let companyUpdated = false;
    let resolvedCompanyId = payload.company.matchedCompanyId || '';

    const normTax = (s: string) => (s || '').replace(/\D/g, '');
    const normName = (s: string) => (s || '').trim().toLowerCase();

    const matchedExisting =
      (resolvedCompanyId
        ? accountingCompanies.find((c) => c.id === resolvedCompanyId)
        : undefined) ||
      (normTax(payload.company.taxNumber).length >= 8
        ? accountingCompanies.find(
            (c) => normTax(c.taxNumber) === normTax(payload.company.taxNumber)
          )
        : undefined) ||
      accountingCompanies.find((c) => normName(c.name) === normName(companyName));

    if (matchedExisting) {
      resolvedCompanyId = matchedExisting.id;
      if (payload.options.updateMatchedCompanyDetails) {
        const mergedType =
          matchedExisting.companyType !== payload.company.companyType &&
          (matchedExisting.companyType === 'her_ikisi' ||
            (matchedExisting.companyType === 'tedarikci' &&
              payload.company.companyType === 'musteri') ||
            (matchedExisting.companyType === 'musteri' &&
              payload.company.companyType === 'tedarikci'))
            ? 'her_ikisi'
            : matchedExisting.companyType;

        const nextInput: AccountingCompanyInput = {
          name: matchedExisting.name || companyName,
          companyType: mergedType,
          taxOffice: matchedExisting.taxOffice || payload.company.taxOffice,
          taxNumber: matchedExisting.taxNumber || payload.company.taxNumber,
          contactPerson: matchedExisting.contactPerson || payload.company.contactPerson,
          phone: matchedExisting.phone || payload.company.phone,
          email: matchedExisting.email || payload.company.email,
          address: matchedExisting.address || payload.company.address,
          iban: matchedExisting.iban || payload.company.iban,
          notes: matchedExisting.notes || '',
        };

        const hasNewField =
          nextInput.taxOffice !== matchedExisting.taxOffice ||
          nextInput.taxNumber !== matchedExisting.taxNumber ||
          nextInput.contactPerson !== matchedExisting.contactPerson ||
          nextInput.phone !== matchedExisting.phone ||
          nextInput.email !== matchedExisting.email ||
          nextInput.address !== matchedExisting.address ||
          nextInput.iban !== matchedExisting.iban ||
          nextInput.companyType !== matchedExisting.companyType;

        if (hasNewField) {
          await updateAccountingCompany(matchedExisting.id, nextInput);
          companyUpdated = true;
        }
      }
    } else if (payload.options.saveCompany) {
      resolvedCompanyId = await createAccountingCompany(
        workspaceOwnerId,
        {
          name: companyName,
          companyType: payload.company.companyType,
          taxOffice: payload.company.taxOffice,
          taxNumber: payload.company.taxNumber,
          contactPerson: payload.company.contactPerson,
          phone: payload.company.phone,
          email: payload.company.email,
          address: payload.company.address,
          iban: payload.company.iban,
          notes: `PDF Fatura (${payload.invoice.invoiceNo || entryDate}) ile otomatik oluşturuldu`,
        },
        activeMemberIds,
        actor
      );
      companyCreated = true;
    }

    let entriesCreated = 0;
    if (payload.options.saveAccountingEntry) {
      const selectedItems = payload.items;
      if (
        payload.options.entryGranularity === 'per_item' &&
        selectedItems.length > 0
      ) {
        const totalInvAmount =
          payload.invoice.totalAmount > 0
            ? payload.invoice.totalAmount
            : selectedItems.reduce((acc, i) => acc + i.totalAmount, 0);

        for (const item of selectedItems) {
          const itemPaid =
            payload.invoice.paymentStatus === 'odendi'
              ? item.totalAmount
              : payload.invoice.paymentStatus === 'kismi' && totalInvAmount > 0
              ? Number(
                  ((payload.invoice.paidAmount * item.totalAmount) / totalInvAmount).toFixed(
                    2
                  )
                )
              : 0;

          await createAccountingEntry(
            workspaceOwnerId,
            {
              entryType: payload.direction,
              companyId: resolvedCompanyId,
              companyName,
              invoiceNo: payload.invoice.invoiceNo,
              title: item.materialName,
              stockNumber: item.stockNumber,
              partNumber: item.partNumber,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              vatRate: item.vatRate,
              subtotalAmount: item.subtotalAmount,
              vatAmount: item.vatAmount,
              totalAmount: item.totalAmount,
              paidAmount: itemPaid,
              currency: payload.invoice.currency,
              entryDate,
              dueDate,
              paymentMethod: payload.invoice.paymentMethod,
              paymentStatus: payload.invoice.paymentStatus,
              tenderId: payload.invoice.tenderId,
              tenderTrackingCode: payload.invoice.tenderTrackingCode,
              notes: payload.invoice.notes,
            },
            activeMemberIds,
            actor
          );
          entriesCreated += 1;
        }
      } else {
        const firstItem = selectedItems[0];
        const summaryTitle =
          selectedItems.length === 1 && firstItem
            ? firstItem.materialName
            : selectedItems.length > 1 && firstItem
            ? `${firstItem.materialName} (+${selectedItems.length - 1} kalem)`
            : payload.invoice.invoiceNo
            ? `Fatura ${payload.invoice.invoiceNo}`
            : payload.direction === 'satis_faturasi'
            ? 'Satış Faturası'
            : 'Alış Faturası';

        const effectiveVatRate =
          selectedItems.length === 1 && firstItem
            ? firstItem.vatRate
            : payload.invoice.subtotalAmount > 0
            ? Math.max(
                0,
                Math.min(
                  100,
                  Math.round(
                    (payload.invoice.vatAmount / payload.invoice.subtotalAmount) * 100
                  )
                )
              )
            : 20;

        const itemsBreakdownNote =
          selectedItems.length > 1
            ? `Kalemler: ${selectedItems
                .map(
                  (it) =>
                    `${it.materialName} (${it.quantity} ${it.unit} x ${it.unitPrice} ${payload.invoice.currency}, KDV %${it.vatRate})`
                )
                .join(' | ')}`
            : '';

        const combinedNotes = [payload.invoice.notes, itemsBreakdownNote]
          .filter(Boolean)
          .join('\n');

        await createAccountingEntry(
          workspaceOwnerId,
          {
            entryType: payload.direction,
            companyId: resolvedCompanyId,
            companyName,
            invoiceNo: payload.invoice.invoiceNo,
            title: summaryTitle,
            stockNumber:
              selectedItems.length === 1 && firstItem ? firstItem.stockNumber : '',
            partNumber:
              selectedItems.length === 1 && firstItem ? firstItem.partNumber : '',
            quantity: selectedItems.length === 1 && firstItem ? firstItem.quantity : 1,
            unit:
              selectedItems.length === 1 && firstItem ? firstItem.unit : 'Fatura',
            unitPrice:
              selectedItems.length === 1 && firstItem
                ? firstItem.unitPrice
                : payload.invoice.subtotalAmount,
            vatRate: effectiveVatRate,
            subtotalAmount: payload.invoice.subtotalAmount,
            vatAmount: payload.invoice.vatAmount,
            totalAmount: payload.invoice.totalAmount,
            paidAmount: payload.invoice.paidAmount,
            currency: payload.invoice.currency,
            entryDate,
            dueDate,
            paymentMethod: payload.invoice.paymentMethod,
            paymentStatus: payload.invoice.paymentStatus,
            tenderId: payload.invoice.tenderId,
            tenderTrackingCode: payload.invoice.tenderTrackingCode,
            notes: combinedNotes,
          },
          activeMemberIds,
          actor
        );
        entriesCreated += 1;
      }
    }

    let productsCreated = 0;
    let productsSkippedDuplicate = 0;
    if (payload.options.saveProducts && permissions.canManageProducts) {
      for (const item of payload.items) {
        const cleanMat = item.materialName.trim();
        if (!cleanMat) continue;
        const unitPrice = item.unitPrice > 0 ? item.unitPrice : item.subtotalAmount;

        const duplicateExists = bidProducts.some(
          (p) =>
            p.materialName.trim().toLowerCase() === cleanMat.toLowerCase() &&
            p.supplierCompany.trim().toLowerCase() === companyName.toLowerCase() &&
            p.currency === payload.invoice.currency &&
            Math.abs(p.offeredSalePrice - unitPrice) < 0.01 &&
            (p.priceDate || '') === entryDate
        );

        if (duplicateExists) {
          productsSkippedDuplicate += 1;
          continue;
        }

        await createBidProduct(
          workspaceOwnerId,
          {
            tenderId: payload.invoice.tenderId,
            tenderTrackingCode: payload.invoice.tenderTrackingCode,
            stockNumber: item.stockNumber,
            partNumber: item.partNumber,
            materialName: cleanMat,
            supplierCompany: companyName,
            priceDate: entryDate,
            offeredSalePrice: unitPrice,
            currency: payload.invoice.currency,
            purchaseDate: payload.direction === 'alis_faturasi' ? entryDate : '',
            quotedDate: payload.direction === 'satis_faturasi' ? entryDate : '',
          },
          activeMemberIds,
          actor
        );
        productsCreated += 1;
      }
    }

    return {
      companyCreated,
      companyUpdated,
      companyName,
      entriesCreated,
      productsCreated,
      productsSkippedDuplicate,
    };
  };

  // Özel Sektör Teklif ve Proforma Handlers
  const handleOpenNewQuote = (defaultType: SalesQuoteDocType = 'teklif') => {
    if (!canManageQuotes) return;
    setEditingQuote(null);
    setQuoteDefaultDocType(defaultType);
    setQuoteFormOpen(true);
  };

  const handleOpenEditQuote = (quote: SalesQuote) => {
    if (!canManageQuotes) return;
    setEditingQuote(quote);
    setQuoteDefaultDocType(quote.docType);
    setQuoteFormOpen(true);
  };

  const handleSaveQuote = async (
    data: SalesQuoteInput,
    options?: { alsoEnsureCustomerCompany?: boolean }
  ) => {
    if (!canManageQuotes) return;
    let resolvedCustomerId = data.customerId;
    if (
      !resolvedCustomerId &&
      options?.alsoEnsureCustomerCompany &&
      canManageAccounting &&
      data.customerName.trim()
    ) {
      const existing = accountingCompanies.find(
        (c) => c.name.trim().toLowerCase() === data.customerName.trim().toLowerCase()
      );
      if (existing) {
        resolvedCustomerId = existing.id;
      } else {
        resolvedCustomerId = await createAccountingCompany(
          workspaceOwnerId,
          {
            name: data.customerName.trim(),
            companyType: 'musteri',
            taxOffice: data.customerTaxOffice,
            taxNumber: data.customerTaxNumber,
            contactPerson: data.customerContactPerson,
            phone: data.customerPhone,
            email: data.customerEmail,
            address: data.customerAddress,
            iban: '',
            notes: `Teklif / Proforma (${data.quoteNumber}) ile otomatik oluşturuldu`,
          },
          activeMemberIds,
          actor
        );
      }
    }

    const payload: SalesQuoteInput = {
      ...data,
      customerId: resolvedCustomerId,
    };

    if (editingQuote) {
      await updateSalesQuote(editingQuote.id, payload);
    } else {
      const createdId = await createSalesQuote(
        workspaceOwnerId,
        payload,
        activeMemberIds,
        actor
      );
      setDetailQuoteId(createdId);
    }
  };

  const handleUpdateQuoteStatus = async (
    quote: SalesQuote,
    nextStatus: SalesQuoteStatus
  ) => {
    if (!canManageQuotes) return;
    await updateSalesQuoteStatus(
      quote.id,
      nextStatus,
      nextStatus === 'siparis_onaylandi'
        ? quote.orderConfirmedDate || getTodayDateStr()
        : quote.orderConfirmedDate || ''
    );
  };

  const handleDeleteQuote = async (quote: SalesQuote) => {
    if (!canManageQuotes) return;
    await deleteSalesQuote(user.uid, workspaceOwnerId, quote, {
      actor,
      memberIds: activeMemberIds,
    });
  };

  const handleConvertQuoteToProject = (quote: SalesQuote) => {
    if (!canViewProjects) return;
    setEditingProject(null);
    setProjectDefaultTenderId('');
    setProjectDefaultQuoteId(quote.id);
    setProjectFormOpen(true);
  };

  const handleOpenProjectFromQuote = (projectId: string) => {
    if (!canViewProjects) return;
    setDetailQuoteId(null);
    setActiveView('projects');
    setDetailProjectId(projectId);
  };

  // Proje Yönetimi & Maliyet Muhasebesi Handlers
  const getActiveAdminUids = () => {
    const admins = workspaceUsers
      .filter((u) => u.role === 'admin' && u.status === 'active')
      .map((u) => u.uid);
    return Array.from(new Set([workspaceOwnerId, user.uid, ...admins].filter(Boolean)));
  };

  const handleOpenNewProject = (defaultTenderId = '') => {
    if (!canViewProjects) return;
    setEditingProject(null);
    setProjectDefaultTenderId(defaultTenderId);
    setProjectDefaultQuoteId('');
    setProjectFormOpen(true);
  };

  const handleOpenNewProjectFromQuote = (quoteId: string) => {
    if (!canViewProjects) return;
    setEditingProject(null);
    setProjectDefaultTenderId('');
    setProjectDefaultQuoteId(quoteId);
    setProjectFormOpen(true);
  };

  const handleOpenEditProject = (project: Project) => {
    if (!canViewProjects || !isProjectManager(project, user.uid)) return;
    setEditingProject(project);
    setProjectDefaultTenderId(project.tenderId || '');
    setProjectDefaultQuoteId(project.quoteId || '');
    setProjectFormOpen(true);
  };

  const handleSaveProject = async (
    data: ProjectInput,
    options?: { grantProjectViewToManagers?: UserAuthorization[] }
  ) => {
    if (!canViewProjects) return;
    if (editingProject) {
      if (!isProjectManager(editingProject, user.uid)) {
        throw new Error('Bu projeyi yalnızca atanmış proje yöneticisi düzenleyebilir.');
      }
      await updateProject(editingProject.id, data);
      if (data.quoteId && editingProject.quoteId !== data.quoteId) {
        await linkProjectToSalesQuote(
          data.quoteId,
          editingProject.id,
          data.projectCode,
          getTodayDateStr()
        );
      }
    } else {
      const createdId = await createProject(
        workspaceOwnerId,
        data,
        activeMemberIds,
        actor
      );
      if (data.quoteId) {
        await linkProjectToSalesQuote(
          data.quoteId,
          createdId,
          data.projectCode,
          getTodayDateStr()
        );
      }
      if (
        options?.grantProjectViewToManagers &&
        options.grantProjectViewToManagers.length > 0 &&
        userAuth.role === 'admin'
      ) {
        const adminUids = getActiveAdminUids();
        for (const target of options.grantProjectViewToManagers) {
          if (hasProjectsAccess(target.permissions, target.role)) continue;
          await updateUserAuthorization(
            user.uid,
            workspaceOwnerId,
            target,
            {
              displayName: target.displayName,
              department: target.department,
              role: target.role,
              status: target.status,
              permissions: {
                ...target.permissions,
                canViewProjects: true,
              },
            },
            adminUids
          );
        }
      }
      setDetailQuoteId(null);
      setActiveView('projects');
      setDetailProjectId(createdId);
    }
  };

  const handleReassignProjectManagers = async (
    project: Project,
    nextManagers: UserAuthorization[]
  ) => {
    if (!user?.uid || !auth.currentUser) {
      throw new Error('Yönetici atama işlemi için oturum açmanız gerekir.');
    }
    if (!user.emailVerified) {
      throw new Error('Yönetici atama işlemi için e-posta adresinizin doğrulanmış olması gerekir.');
    }
    if (userAuth.status !== 'active' || userAuth.role !== 'admin') {
      throw new Error('Proje yöneticisi atama yetkisi yalnızca aktif sistem yöneticilerine aittir.');
    }
    if (nextManagers.length === 0) {
      throw new Error('En az bir proje yöneticisi seçilmelidir.');
    }
    const mergedMembers = Array.from(
      new Set([
        ...activeMemberIds,
        ...(project.memberIds || []),
        ...nextManagers.map((m) => m.uid),
      ].filter(Boolean))
    );
    await reassignProjectManagers(
      project.id,
      nextManagers.map((m) => ({
        uid: m.uid,
        email: m.email,
        displayName: m.displayName || m.email,
      })),
      mergedMembers
    );
    const adminUids = getActiveAdminUids();
    for (const nextManager of nextManagers) {
      const realUser = workspaceUsers.find((u) => u.uid === nextManager.uid);
      if (realUser && !hasProjectsAccess(realUser.permissions, realUser.role)) {
        try {
          await updateUserAuthorization(
            user.uid,
            workspaceOwnerId,
            realUser,
            {
              displayName: realUser.displayName,
              department: realUser.department,
              role: realUser.role,
              status: realUser.status,
              permissions: {
                ...realUser.permissions,
                canViewProjects: true,
              },
            },
            adminUids
          );
        } catch (err) {
          console.error('[App] Yönetici proje ekranı yetkisi güncellenemedi:', {
            projectId: project.id,
            targetUid: realUser.uid,
            actorUid: user.uid,
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      }
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (!canViewProjects || !isProjectManager(project, user.uid)) return;
    await deleteProject(user.uid, workspaceOwnerId, project, {
      actor,
      memberIds: activeMemberIds,
    });
  };

  const handleOpenNewProjectTx = (
    projectId: string,
    txType?: ProjectTransactionType
  ) => {
    if (!canViewProjects) return;
    const targetProject = projects.find((p) => p.id === projectId);
    if (!targetProject || !isProjectManager(targetProject, user.uid)) return;
    setEditingProjectTx(null);
    setProjectTxPrefill({ projectId, txType });
    setProjectTxModalOpen(true);
  };

  const handleOpenEditProjectTx = (tx: ProjectTransaction) => {
    if (!canViewProjects) return;
    const targetProject = projects.find((p) => p.id === tx.projectId);
    if (!targetProject || !isProjectManager(targetProject, user.uid)) return;
    setEditingProjectTx(tx);
    setProjectTxPrefill(null);
    setProjectTxModalOpen(true);
  };

  const handleSaveProjectTx = async (
    data: ProjectTransactionInput,
    options?: { alsoCreateAccountingEntry?: boolean }
  ) => {
    if (!canViewProjects) return;
    const targetProject = projects.find((p) => p.id === data.projectId);
    if (!targetProject || !isProjectManager(targetProject, user.uid)) {
      throw new Error(
        'Bu projenin fatura ve gider kayıtlarını yalnızca atanmış proje yöneticisi yönetebilir.'
      );
    }
    if (editingProjectTx) {
      await updateProjectTransaction(editingProjectTx.id, data);
    } else {
      await createProjectTransaction(
        workspaceOwnerId,
        data,
        activeMemberIds,
        actor
      );
      if (options?.alsoCreateAccountingEntry && canManageAccounting) {
        const mappedEntryType =
          data.txType === 'kesilen_fatura'
            ? 'satis_faturasi'
            : data.txType === 'diger_gelir'
            ? 'tahsilat'
            : data.txType === 'gelen_fatura'
            ? 'alis_faturasi'
            : 'gider';
        await createAccountingEntry(
          workspaceOwnerId,
          {
            entryType: mappedEntryType,
            companyId: data.companyId,
            companyName: data.companyName,
            invoiceNo: data.invoiceNo,
            title: `[${data.projectCode}] ${data.title}`,
            stockNumber: '',
            partNumber: '',
            quantity: 1,
            unit: 'Adet',
            unitPrice: data.subtotalAmount,
            vatRate: data.vatRate,
            subtotalAmount: data.subtotalAmount,
            vatAmount: data.vatAmount,
            totalAmount: data.totalAmount,
            paidAmount: data.paidAmount,
            currency: data.currency,
            entryDate: data.txDate,
            dueDate: data.dueDate,
            paymentMethod: data.paymentMethod,
            paymentStatus: data.paymentStatus,
            tenderId: data.tenderId,
            tenderTrackingCode: data.tenderTrackingCode,
            notes: data.notes,
          },
          activeMemberIds,
          actor
        );
      }
    }
  };

  const handleMarkProjectTxPaid = async (tx: ProjectTransaction) => {
    if (!canViewProjects) return;
    const targetProject = projects.find((p) => p.id === tx.projectId);
    if (!targetProject || !isProjectManager(targetProject, user.uid)) return;
    await updateProjectTransactionPayment(
      tx.id,
      'odendi',
      tx.totalAmount,
      tx.paymentMethod
    );
  };

  const handleDeleteProjectTx = async (
    project: Project,
    tx: ProjectTransaction
  ) => {
    if (!canViewProjects || !isProjectManager(project, user.uid)) return;
    await deleteProjectTransaction(user.uid, workspaceOwnerId, project, tx, {
      actor,
      memberIds: activeMemberIds,
    });
  };

  const handleOpenProjectFromTender = (
    tenderId: string,
    existingProject?: Project | null
  ) => {
    if (!canViewProjects) return;
    setActiveView('projects');
    if (existingProject) {
      setDetailProjectId(existingProject.id);
    } else {
      handleOpenNewProject(tenderId);
    }
  };

  const handleUpdateNotificationPrefs = (next: NotificationPrefs) => {
    setNotificationPrefs(next);
    saveNotificationPrefs(user.uid, next);
  };

  const handleEnableNotifications = async () => {
    const perm = await requestBrowserNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      checkAndTriggerMorningAlerts();
    }
  };

  return (
    <AppShell
      user={user}
      userAuth={userAuth}
      permissions={permissions}
      pendingUsersCount={pendingUsersCount}
      trashCount={recycleBinItems.length}
      companyProfile={companyProfile}
      activeView={activeView}
      onChangeView={setActiveView}
      onNewTender={() => handleOpenNewTender()}
      onSignOut={() => signOut(auth)}
      todayTendersCount={todayTendersCount}
    >
      {morningAlerts.length > 0 && activeView !== 'home' && (
        <div
          role="alert"
          className="mb-6 bg-[#0B2239] text-white border border-[#143252] border-b-2 border-b-[#F59E0B] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3 min-w-0">
            <BellRing className="w-5 h-5 text-[#FBBF24] shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              <div className="font-display text-sm font-bold text-white">
                İhale Günü Sabah Hatırlatması ({morningAlerts.length} İhale)
              </div>
              <div className="space-y-1">
                {morningAlerts.map((t) => (
                  <div key={t.id} className="text-xs text-slate-300">
                    <span className="font-mono font-semibold text-[#FBBF24] tabular-nums">
                      {t.trackingCode}
                    </span>{' '}
                    ·{' '}
                    <span className="font-mono font-semibold text-white tabular-nums">
                      {t.tenderTime}
                    </span>{' '}
                    · <span className="font-medium text-white">{t.title}</span> ({t.authority})
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                handleOpenTenderDay(morningAlerts[0].id);
                setMorningAlerts([]);
              }}
              className="min-h-[40px] px-3.5 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#006344] text-white text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
            >
              <span>İhale Günü Modu</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setMorningAlerts([])}
              aria-label="Uyarıyı Kapat"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center border border-[#1E4063] bg-[#143252] hover:bg-[#1B4168] text-slate-200 rounded-lg cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {dataLoading ? (
        <div className="space-y-4">
          <div className="h-28 bg-white border border-[#DCE3EC] rounded-xl animate-pulse" />
          <div className="h-64 bg-white border border-[#DCE3EC] rounded-xl animate-pulse" />
        </div>
      ) : (
        <>
          {activeView === 'home' && (
            <HomeView
              user={user}
              userAuth={userAuth}
              permissions={permissions}
              companyProfile={companyProfile}
              todayTendersCount={todayTendersCount}
              activeTendersCount={
                tenders.filter((t) => t.status !== 'sonuclandi' && t.status !== 'iptal').length
              }
              totalTendersCount={tenders.length}
              pricingCount={pricingSheets.length}
              quotesCount={salesQuotes.length}
              projectsCount={projects.length}
              productsCount={bidProducts.length}
              accountingCount={accountingEntries.length}
              vaultCount={companyVault.length}
              trashCount={recycleBinItems.length}
              pendingUsersCount={pendingUsersCount}
              onNavigate={setActiveView}
              onOpenTenderDay={() => handleOpenTenderDay()}
            />
          )}

          {activeView === 'overview' && (
            <OverviewView
              tenders={tenders}
              companyVault={companyVault}
              companyProfile={companyProfile}
              notificationPermission={notificationPermission}
              morningTime={notificationPrefs.morningTime}
              onEnableNotifications={handleEnableNotifications}
              onNewTender={() => handleOpenNewTender()}
              onSelectTender={(t) => setDetailTenderId(t.id)}
              onOpenCalendar={() => setActiveView('calendar')}
              onOpenTenderDay={handleOpenTenderDay}
              onOpenVault={() => setActiveView('vault')}
              canCreateTender={permissions.canCreateTender}
              onLoadSampleData={() =>
                loadSampleTenderScenario(
                  workspaceOwnerId,
                  tenders,
                  user.email || '',
                  activeMemberIds
                )
              }
            />
          )}

          {activeView === 'calendar' && (
            <CalendarView
              tenders={tenders}
              companyProfile={companyProfile}
              canCreateTender={permissions.canCreateTender}
              onSelectTender={(t) => setDetailTenderId(t.id)}
              onNewTenderOnDate={(dateStr) => handleOpenNewTender(dateStr)}
              onOpenTenderDay={handleOpenTenderDay}
            />
          )}

          {activeView === 'tender-day' && (
            <TenderDayView
              uid={user.uid}
              workspaceOwnerId={workspaceOwnerId}
              actor={actor}
              memberIds={activeMemberIds}
              tenders={tenders}
              companyVault={companyVault}
              initialTenderId={tenderDayTargetId}
              canEditTender={permissions.canEditTender}
              canManageVault={permissions.canManageVault}
              onPreview={setPreviewTarget}
              onSelectTenderDetail={(t) => setDetailTenderId(t.id)}
            />
          )}

          {activeView === 'tenders' && (
            <TendersListView
              tenders={tenders}
              companyProfile={companyProfile}
              canCreateTender={permissions.canCreateTender}
              onNewTender={() => handleOpenNewTender()}
              onSelectTender={(t) => setDetailTenderId(t.id)}
              onOpenTenderDay={handleOpenTenderDay}
            />
          )}

          {activeView === 'pricing' && (
            <TenderPricingView
              tenders={tenders}
              bidProducts={bidProducts}
              pricingSheets={pricingSheets}
              companyProfile={companyProfile}
              canManagePricing={canManagePricing}
              canManageProducts={permissions.canManageProducts}
              initialTenderId={pricingTargetTenderId}
              onSaveSheet={handleSavePricingSheet}
              onOpenTenderDetail={(id) => setDetailTenderId(id)}
              onNewBidProductForTender={(tenderId) => handleOpenNewProduct(tenderId)}
            />
          )}

          {activeView === 'quotes' && (
            <SalesQuotesView
              quotes={salesQuotes}
              companyProfile={companyProfile}
              canManageQuotes={canManageQuotes}
              canViewProjects={canViewProjects}
              onNewQuote={handleOpenNewQuote}
              onViewQuote={(q) => setDetailQuoteId(q.id)}
              onEditQuote={handleOpenEditQuote}
              onUpdateStatus={handleUpdateQuoteStatus}
              onConvertToProject={handleConvertQuoteToProject}
              onOpenLinkedProject={handleOpenProjectFromQuote}
            />
          )}

          {activeView === 'projects' && canViewProjects && (
            <ProjectsView
              currentUid={user.uid}
              projects={projects}
              transactions={projectTransactions}
              tenders={tenders}
              salesQuotes={salesQuotes}
              canCreateProject={canViewProjects}
              onNewProject={(defaultTenderId) => handleOpenNewProject(defaultTenderId || '')}
              onNewProjectFromQuote={handleOpenNewProjectFromQuote}
              onViewProject={(project) => setDetailProjectId(project.id)}
              onEditProject={handleOpenEditProject}
              onNewTransaction={handleOpenNewProjectTx}
              onEditTransaction={handleOpenEditProjectTx}
              onMarkTransactionPaid={handleMarkProjectTxPaid}
              onDeleteTransaction={handleDeleteProjectTx}
              onSelectTenderId={(id) => setDetailTenderId(id)}
              onSelectQuoteId={(id) => setDetailQuoteId(id)}
            />
          )}

          {activeView === 'products' && (
            <BidProductsView
              currentUid={user.uid}
              products={bidProducts}
              tenders={tenders}
              canManageProducts={permissions.canManageProducts}
              canManageAccounting={canManageAccounting}
              onNewProduct={() => handleOpenNewProduct()}
              onViewProduct={(product) => setDetailProductId(product.id)}
              onEditProduct={handleOpenEditProduct}
              onDeleteProduct={handleDeleteProduct}
              onSelectTenderId={(id) => setDetailTenderId(id)}
              onDuplicateForNewCompany={handleDuplicateProductForNewCompany}
              onCreateAccountingEntry={handleCreateAccountingFromProduct}
            />
          )}

          {activeView === 'accounting' && (
            <AccountingView
              currentUid={user.uid}
              companyName={companyProfile?.companyName}
              ownTaxNumber={companyProfile?.taxNumber}
              companies={accountingCompanies}
              entries={accountingEntries}
              cheques={accountingCheques}
              bidProducts={bidProducts}
              tenders={tenders}
              canManageAccounting={canManageAccounting}
              canManageProducts={permissions.canManageProducts}
              onNewEntry={(prefill) => handleOpenNewAccountingEntry(prefill || null)}
              onImportInvoicePdf={handleImportInvoicePdf}
              onViewEntry={(entry) => setDetailAccountingEntryId(entry.id)}
              onEditEntry={handleOpenEditAccountingEntry}
              onMarkEntryPaid={handleMarkAccountingEntryPaid}
              onDeleteEntry={handleDeleteAccountingEntry}
              onNewCheque={(prefill) => handleOpenNewAccountingCheque(prefill || null)}
              onViewCheque={(cheque) => setDetailAccountingChequeId(cheque.id)}
              onEditCheque={handleOpenEditAccountingCheque}
              onUpdateChequeStatus={handleUpdateAccountingChequeStatus}
              onDeleteCheque={handleDeleteAccountingCheque}
              onNewCompany={(initialName) => handleOpenNewAccountingCompany(initialName || '')}
              onEditCompany={handleOpenEditAccountingCompany}
              onDeleteCompany={handleDeleteAccountingCompany}
              onImportCompaniesFromProducts={handleImportCompaniesFromProducts}
              onAddProductForAnotherCompany={(tId, prefill) =>
                handleOpenNewProduct(tId, prefill)
              }
              onSelectTenderId={(id) => setDetailTenderId(id)}
              onViewProduct={(p) => setDetailProductId(p.id)}
            />
          )}

          {activeView === 'vault' && (
            <VaultView
              uid={user.uid}
              workspaceOwnerId={workspaceOwnerId}
              actor={actor}
              memberIds={activeMemberIds}
              tenders={tenders}
              companyVault={companyVault}
              canManageVault={permissions.canManageVault}
              onPreview={setPreviewTarget}
            />
          )}

          {activeView === 'trash' && (
            <RecycleBinView
              uid={user.uid}
              workspaceOwnerId={workspaceOwnerId}
              actor={actor}
              memberIds={activeMemberIds}
              items={recycleBinItems}
              tenders={tenders}
              onPreview={setPreviewTarget}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              uid={user.uid}
              workspaceOwnerId={workspaceOwnerId}
              memberIds={activeMemberIds}
              canManageSettings={permissions.canManageSettings}
              userEmail={user.email || ''}
              profile={companyProfile}
              tenders={tenders}
              notificationPrefs={notificationPrefs}
              notificationPermission={notificationPermission}
              onUpdateNotificationPrefs={handleUpdateNotificationPrefs}
              onUpdatePermission={setNotificationPermission}
              onTriggerImmediateCheck={checkAndTriggerMorningAlerts}
            />
          )}

          {activeView === 'users' && userAuth.role === 'admin' && (
            <UserManagementView
              currentUser={userAuth}
              workspaceOwnerId={workspaceOwnerId}
              users={workspaceUsers}
              invites={userInvites}
              onSyncWorkspace={handleSyncWorkspace}
            />
          )}
        </>
      )}

      <TenderFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        existingTenders={tenders}
        editingTender={editingTender}
        initialDate={formInitialDate}
        onSubmit={handleSaveTender}
      />

      <BidProductFormModal
        open={productFormOpen}
        onClose={() => {
          setProductFormOpen(false);
          setProductPrefill(null);
        }}
        tenders={tenders}
        accountingCompanies={accountingCompanies}
        existingProducts={bidProducts}
        editingProduct={editingProduct}
        defaultTenderId={productDefaultTenderId}
        prefillValues={productPrefill}
        onSubmit={handleSaveProduct}
      />

      <AccountingCompanyModal
        open={accountingCompanyModalOpen}
        onClose={() => {
          setAccountingCompanyModalOpen(false);
          setEditingAccountingCompany(null);
          setAccountingCompanyInitialName('');
        }}
        editingCompany={editingAccountingCompany}
        initialName={accountingCompanyInitialName}
        onSubmit={handleSaveAccountingCompany}
      />

      <AccountingEntryModal
        open={accountingEntryModalOpen}
        onClose={() => {
          setAccountingEntryModalOpen(false);
          setEditingAccountingEntry(null);
          setAccountingEntryPrefill(null);
        }}
        companies={accountingCompanies}
        bidProducts={bidProducts}
        tenders={tenders}
        editingEntry={editingAccountingEntry}
        prefillValues={accountingEntryPrefill}
        canAlsoCreateProduct={permissions.canManageProducts}
        onSubmit={handleSaveAccountingEntry}
      />

      <AccountingChequeModal
        open={accountingChequeModalOpen}
        onClose={() => {
          setAccountingChequeModalOpen(false);
          setEditingAccountingCheque(null);
          setAccountingChequePrefill(null);
        }}
        companies={accountingCompanies}
        bidProducts={bidProducts}
        tenders={tenders}
        editingCheque={editingAccountingCheque}
        prefillValues={accountingChequePrefill}
        onSubmit={handleSaveAccountingCheque}
      />

      <TenderDetailDrawer
        uid={user.uid}
        workspaceOwnerId={workspaceOwnerId}
        actor={actor}
        memberIds={activeMemberIds}
        permissions={permissions}
        tender={selectedDetailTender}
        companyName={companyProfile?.companyName}
        bidProducts={bidProducts}
        canManageAccounting={canManageAccounting}
        canViewProjects={canViewProjects}
        linkedProject={
          selectedDetailTender && canViewProjects
            ? projects.find((p) => p.tenderId === selectedDetailTender.id) || null
            : null
        }
        onOpenProject={handleOpenProjectFromTender}
        onOpenPricing={handleOpenPricing}
        disableEscClose={Boolean(
          detailProductId ||
            detailProjectId ||
            detailQuoteId ||
            detailAccountingEntryId ||
            detailAccountingChequeId ||
            previewTarget ||
            formOpen ||
            quoteFormOpen ||
            productFormOpen ||
            projectFormOpen ||
            projectTxModalOpen ||
            accountingCompanyModalOpen ||
            accountingEntryModalOpen ||
            accountingChequeModalOpen
        )}
        onClose={() => {
          setDetailTenderId(null);
          clearDetailUrlParamIfMatching('tender');
        }}
        onEdit={handleOpenEditTender}
        onDelete={(t) =>
          deleteTender(user.uid, workspaceOwnerId, t, {
            canManageProducts: permissions.canManageProducts,
            actor,
            memberIds: activeMemberIds,
          })
        }
        onOpenTenderDay={handleOpenTenderDay}
        onPreview={setPreviewTarget}
        onNewBidProduct={(tenderId, prefill) => handleOpenNewProduct(tenderId, prefill)}
        onViewBidProduct={(product) => setDetailProductId(product.id)}
        onEditBidProduct={handleOpenEditProduct}
        onDeleteBidProduct={handleDeleteProduct}
        onDuplicateBidProductForNewCompany={handleDuplicateProductForNewCompany}
        onCreateAccountingFromProduct={handleCreateAccountingFromProduct}
      />

      <BidProductDetailModal
        product={selectedDetailProduct}
        allProducts={bidProducts}
        tenders={tenders}
        currentUid={user.uid}
        canManage={permissions.canManageProducts}
        canManageAccounting={canManageAccounting}
        onClose={() => {
          setDetailProductId(null);
          clearDetailUrlParamIfMatching('product');
        }}
        onEdit={handleOpenEditProduct}
        onDelete={handleDeleteProduct}
        onSelectTenderId={(id) => setDetailTenderId(id)}
        onSelectProduct={(p) => setDetailProductId(p.id)}
        onDuplicateForNewCompany={handleDuplicateProductForNewCompany}
        onCreateAccountingEntry={handleCreateAccountingFromProduct}
      />

      <AccountingEntryDetailModal
        entry={selectedDetailAccountingEntry}
        companies={accountingCompanies}
        tenders={tenders}
        currentUid={user.uid}
        canManage={canManageAccounting}
        onClose={() => {
          setDetailAccountingEntryId(null);
          clearDetailUrlParamIfMatching('accounting');
        }}
        onEdit={handleOpenEditAccountingEntry}
        onMarkPaid={handleMarkAccountingEntryPaid}
        onDelete={handleDeleteAccountingEntry}
        onSelectTenderId={(id) => setDetailTenderId(id)}
      />

      <AccountingChequeDetailModal
        cheque={selectedDetailAccountingCheque}
        companies={accountingCompanies}
        tenders={tenders}
        currentUid={user.uid}
        canManage={canManageAccounting}
        onClose={() => {
          setDetailAccountingChequeId(null);
          clearDetailUrlParamIfMatching('cheque');
        }}
        onEdit={handleOpenEditAccountingCheque}
        onUpdateStatus={handleUpdateAccountingChequeStatus}
        onDelete={handleDeleteAccountingCheque}
        onSelectTenderId={(id) => setDetailTenderId(id)}
      />

      <SalesQuoteFormModal
        open={quoteFormOpen}
        onClose={() => {
          setQuoteFormOpen(false);
          setEditingQuote(null);
        }}
        existingQuotes={salesQuotes}
        editingQuote={editingQuote}
        defaultDocType={quoteDefaultDocType}
        companies={accountingCompanies}
        bidProducts={bidProducts}
        onSubmit={handleSaveQuote}
      />

      <SalesQuoteDetailModal
        quote={selectedDetailQuote}
        companyProfile={companyProfile}
        currentUid={user.uid}
        canManageQuotes={canManageQuotes}
        canViewProjects={canViewProjects}
        disableEscClose={Boolean(quoteFormOpen || projectFormOpen || detailProjectId)}
        onClose={() => {
          setDetailQuoteId(null);
          clearDetailUrlParamIfMatching('quote');
        }}
        onEdit={handleOpenEditQuote}
        onUpdateStatus={handleUpdateQuoteStatus}
        onDelete={handleDeleteQuote}
        onConvertToProject={handleConvertQuoteToProject}
        onOpenLinkedProject={handleOpenProjectFromQuote}
      />

      <ProjectFormModal
        open={canViewProjects && projectFormOpen}
        onClose={() => {
          setProjectFormOpen(false);
          setEditingProject(null);
          setProjectDefaultTenderId('');
          setProjectDefaultQuoteId('');
        }}
        tenders={tenders}
        salesQuotes={salesQuotes}
        existingProjects={projects}
        editingProject={editingProject}
        defaultTenderId={projectDefaultTenderId}
        defaultQuoteId={projectDefaultQuoteId}
        currentUid={user.uid}
        currentEmail={actor.email}
        currentDisplayName={actor.displayName}
        isAdmin={userAuth.role === 'admin'}
        workspaceUsers={workspaceUsers}
        onSubmit={handleSaveProject}
      />

      <ProjectTransactionModal
        open={canViewProjects && projectTxModalOpen}
        onClose={() => {
          setProjectTxModalOpen(false);
          setEditingProjectTx(null);
          setProjectTxPrefill(null);
        }}
        projects={projects.filter((p) => isProjectManager(p, user.uid))}
        companies={accountingCompanies}
        bidProducts={bidProducts}
        editingTx={editingProjectTx}
        prefillValues={projectTxPrefill}
        canAlsoCreateAccountingEntry={canManageAccounting}
        onSubmit={handleSaveProjectTx}
      />

      <ProjectDetailModal
        project={selectedDetailProject}
        transactions={projectTransactions}
        tenders={tenders}
        salesQuotes={salesQuotes}
        currentUid={user.uid}
        isAdmin={userAuth.role === 'admin'}
        workspaceUsers={workspaceUsers}
        disableEscClose={Boolean(
          projectFormOpen ||
            projectTxModalOpen ||
            detailTenderId ||
            detailQuoteId ||
            previewTarget
        )}
        onClose={() => {
          setDetailProjectId(null);
          clearDetailUrlParamIfMatching('project');
        }}
        onEditProject={handleOpenEditProject}
        onDeleteProject={handleDeleteProject}
        onReassignManagers={handleReassignProjectManagers}
        onNewTransaction={handleOpenNewProjectTx}
        onEditTransaction={handleOpenEditProjectTx}
        onMarkTransactionPaid={handleMarkProjectTxPaid}
        onDeleteTransaction={handleDeleteProjectTx}
        onSelectTenderId={(id) => setDetailTenderId(id)}
        onSelectQuoteId={(id) => setDetailQuoteId(id)}
      />

      <DocumentPreviewModal
        target={previewTarget}
        onClose={() => setPreviewTarget(null)}
      />
    </AppShell>
  );
}
