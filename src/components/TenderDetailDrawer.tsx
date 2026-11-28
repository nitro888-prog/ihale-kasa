import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  CalendarPlus,
  Copy,
  Check,
  Upload,
  Eye,
  Trash2,
  CheckSquare,
  Square,
  ShieldCheck,
  Edit3,
  ExternalLink,
  Zap,
  Lock,
  FileSearch,
  CalendarClock,
  Loader2,
  BookmarkPlus,
  Package,
  Plus,
  Cpu,
  AlertTriangle,
  Award,
  CheckCircle2,
  Database,
  FileDown,
  Maximize2,
  Minimize2,
  LayoutGrid,
  List,
  Briefcase,
  Percent,
  Printer,
} from 'lucide-react';
import {
  ActorIdentity,
  BidProduct,
  CHECKLIST_ITEMS,
  isOwnRecord,
  PROCUREMENT_LABELS,
  Project,
  SCHEMA_LIMITS,
  STATUS_LABELS,
  TENDER_DOC_CATEGORY_LABELS,
  Tender,
  TenderChecklist,
  TenderDocCategory,
  TenderDocument,
  SavedTenderAnalysis,
  UserPermissions,
} from '../types/tender';
import {
  downloadTenderICS,
  formatBytes,
  formatCurrency,
  formatTurkishDate,
  getGoogleCalendarUrl,
  getRelativeDayLabel,
} from '../lib/trackingAndCalendar';
import {
  deleteTenderDocument,
  downloadTenderDocumentBlob,
  fetchWorkspaceBidProducts,
  saveTenderAnalysis,
  subscribeTenderAnalyses,
  subscribeTenderDocuments,
  toggleTenderDocVerified,
  updateTender,
  updateTenderChecklist,
  uploadTenderDocument,
} from '../services/firestoreService';
import {
  lookupItemDatabasePrices,
  lookupRecommendationPrices,
  ProductAnalysisResult,
} from '../lib/productPriceMatcher';
import {
  downloadProductAnalysisPdf,
  printProductAnalysis,
} from '../lib/productAnalysisPdf';
import {
  downloadTenderNotesAndSummaryPdf,
  printTenderNotesAndSummary,
} from '../lib/tenderSummaryPdf';
import { getAuthBearerHeaders } from '../lib/firebase';
import { PreviewTarget } from './DocumentPreviewModal';
import { BidProductCard } from './BidProductCard';
import { BidProductsTable } from './BidProductsTable';
import { BidProductPrefill } from './BidProductFormModal';

interface CriticalDateItem {
  label: string;
  dateText: string;
  isoDate: string;
  importance: 'kritik' | 'yuksek' | 'bilgi' | string;
  excerpt: string;
}

interface KeyRequirementItem {
  title: string;
  detail: string;
}

interface DocumentAnalysisResult {
  summary: string;
  criticalDates: CriticalDateItem[];
  keyRequirements: KeyRequirementItem[];
}

function normalizeDocumentAnalysisResult(raw: unknown): DocumentAnalysisResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawDates = Array.isArray(obj.criticalDates) ? obj.criticalDates : [];
  const rawReqs = Array.isArray(obj.keyRequirements) ? obj.keyRequirements : [];
  return {
    summary: String(obj.summary ?? '').trim(),
    criticalDates: rawDates.map((d) => {
      const item = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
      return {
        label: String(item.label ?? '').trim(),
        dateText: String(item.dateText ?? '').trim(),
        isoDate: String(item.isoDate ?? '').trim(),
        importance: String(item.importance ?? 'bilgi').trim() || 'bilgi',
        excerpt: String(item.excerpt ?? '').trim(),
      };
    }),
    keyRequirements: rawReqs.map((r) => {
      const item = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      return {
        title: String(item.title ?? '').trim(),
        detail: String(item.detail ?? '').trim(),
      };
    }),
  };
}

function normalizeProductAnalysisResult(raw: unknown): ProductAnalysisResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const rawGeneral = Array.isArray(obj.generalRecommendations)
    ? obj.generalRecommendations
    : [];
  return {
    overview: String(obj.overview ?? '').trim(),
    items: rawItems.map((it, idx) => {
      const item = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
      const specs = Array.isArray(item.requiredSpecs) ? item.requiredSpecs : [];
      const recs = Array.isArray(item.recommendations) ? item.recommendations : [];
      return {
        itemNo: String(item.itemNo ?? `Kalem ${idx + 1}`).trim() || `Kalem ${idx + 1}`,
        productName: String(item.productName ?? '').trim() || `Ürün Kalemi ${idx + 1}`,
        quantityAndUnit:
          String(item.quantityAndUnit ?? 'Belirtilmemiş').trim() || 'Belirtilmemiş',
        requiredSpecs: specs.map((s) => String(s ?? '').trim()).filter(Boolean),
        complianceRisks: String(item.complianceRisks ?? '').trim(),
        recommendations: recs.map((r) => {
          const rec = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
          return {
            brand: String(rec.brand ?? '').trim(),
            model: String(rec.model ?? '').trim(),
            partNumberHint: String(rec.partNumberHint ?? '').trim(),
            segment: String(rec.segment ?? '').trim(),
            compatibilityLevel: String(rec.compatibilityLevel ?? '').trim(),
            rationale: String(rec.rationale ?? '').trim(),
            verificationChecklist: String(rec.verificationChecklist ?? '').trim(),
          };
        }),
      };
    }),
    generalRecommendations: rawGeneral
      .map((g) => String(g ?? '').trim())
      .filter(Boolean),
  };
}

type AnalysisMode = 'summary' | 'products';

interface TenderDetailDrawerProps {
  uid: string;
  workspaceOwnerId: string;
  actor: ActorIdentity;
  memberIds?: string[];
  permissions: UserPermissions;
  tender: Tender | null;
  companyName?: string;
  bidProducts: BidProduct[];
  onClose: () => void;
  onEdit: (tender: Tender) => void;
  onDelete: (tender: Tender) => Promise<void>;
  onOpenTenderDay: (tenderId: string) => void;
  onPreview: (target: PreviewTarget) => void;
  onNewBidProduct: (tenderId: string, prefill?: BidProductPrefill) => void;
  onViewBidProduct?: (product: BidProduct) => void;
  onEditBidProduct: (product: BidProduct) => void;
  onDeleteBidProduct: (product: BidProduct) => Promise<void> | void;
  onDuplicateBidProductForNewCompany?: (product: BidProduct) => void;
  onCreateAccountingFromProduct?: (product: BidProduct) => void;
  canManageAccounting?: boolean;
  canViewProjects?: boolean;
  linkedProject?: Project | null;
  onOpenProject?: (tenderId: string, existingProject?: Project | null) => void;
  onOpenPricing?: (tenderId: string) => void;
  disableEscClose?: boolean;
}

export const TenderDetailDrawer: React.FC<TenderDetailDrawerProps> = ({
  uid,
  workspaceOwnerId,
  actor,
  memberIds,
  permissions,
  tender,
  companyName,
  bidProducts,
  onClose,
  onEdit,
  onDelete,
  onOpenTenderDay,
  onPreview,
  onNewBidProduct,
  onViewBidProduct,
  onEditBidProduct,
  onDeleteBidProduct,
  onDuplicateBidProductForNewCompany,
  onCreateAccountingFromProduct,
  canManageAccounting = false,
  canViewProjects = false,
  linkedProject = null,
  onOpenProject,
  onOpenPricing,
  disableEscClose = false,
}) => {
  const [docs, setDocs] = useState<TenderDocument[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState<TenderDocCategory>('idari_sartname');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingTender, setDeletingTender] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('summary');
  const [analysisText, setAnalysisText] = useState('');
  const [preferenceNote, setPreferenceNote] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<DocumentAnalysisResult | null>(null);
  const [productAnalysisResult, setProductAnalysisResult] =
    useState<ProductAnalysisResult | null>(null);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedTenderAnalysis[]>([]);
  const [loadingSavedAnalyses, setLoadingSavedAnalyses] = useState(false);
  const [savedAnalysisError, setSavedAnalysisError] = useState<string | null>(null);
  const [savingToNotes, setSavingToNotes] = useState(false);
  const [savedNotesFeedback, setSavedNotesFeedback] = useState(false);
  const [fetchedDbProducts, setFetchedDbProducts] = useState<BidProduct[] | null>(null);
  const [inspectingDb, setInspectingDb] = useState(false);
  const [dbInspectError, setDbInspectError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [printingDoc, setPrintingDoc] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [notesPdfError, setNotesPdfError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [productViewMode, setProductViewMode] = useState<'cards' | 'list'>('cards');
  const [activeProductSavedNote, setActiveProductSavedNote] = useState<string | null>(null);
  const [activeSummarySavedNote, setActiveSummarySavedNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisFileInputRef = useRef<HTMLInputElement>(null);
  const userSelectedTabRef = useRef(false);
  const hasHydratedProductRef = useRef(false);
  const hasHydratedSummaryRef = useRef(false);

  useEffect(() => {
    setFetchedDbProducts(null);
  }, [bidProducts]);

  useEffect(() => {
    if (!tender || disableEscClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tender, disableEscClose, onClose]);

  useEffect(() => {
    setConfirmDelete(false);
    setDeleteError(null);
    setDeletingTender(false);
    setUploadError(null);
    setAnalysisMode('summary');
    setAnalysisText('');
    setPreferenceNote('');
    setAnalysisError(null);
    setAnalysisResult(null);
    setProductAnalysisResult(null);
    setActiveProductSavedNote(null);
    setActiveSummarySavedNote(null);
    setSavedAnalyses([]);
    setLoadingSavedAnalyses(false);
    setSavedAnalysisError(null);
    setSavedNotesFeedback(false);
    setFetchedDbProducts(null);
    setDbInspectError(null);
    setPdfError(null);
    setNotesPdfError(null);
    userSelectedTabRef.current = false;
    hasHydratedProductRef.current = false;
    hasHydratedSummaryRef.current = false;
    if (!tender) {
      setDocs([]);
      return;
    }
    const unsubDocs = subscribeTenderDocuments(
      uid,
      workspaceOwnerId,
      tender.id,
      setDocs
    );

    setLoadingSavedAnalyses(true);
    const unsubAnalyses = subscribeTenderAnalyses(
      workspaceOwnerId,
      tender.id,
      (items) => {
        setSavedAnalyses(items);
        setLoadingSavedAnalyses(false);
        setSavedAnalysisError(null);

        const latestProducts = items.find((a) => a.mode === 'products');
        const latestSummary = items.find((a) => a.mode === 'summary');

        if (latestProducts && !hasHydratedProductRef.current) {
          hasHydratedProductRef.current = true;
          setProductAnalysisResult(normalizeProductAnalysisResult(latestProducts.result));
          if (latestProducts.preferenceNote) {
            setPreferenceNote((prev) => prev || latestProducts.preferenceNote || '');
          }
          setActiveProductSavedNote('İhale kaydında saklı son ürün analizi');
        }

        if (latestSummary && !hasHydratedSummaryRef.current) {
          hasHydratedSummaryRef.current = true;
          setAnalysisResult(normalizeDocumentAnalysisResult(latestSummary.result));
          setActiveSummarySavedNote('İhale kaydında saklı son özet analizi');
        }

        if (!userSelectedTabRef.current && latestProducts) {
          const prodTs = latestProducts.createdAt?.seconds || 0;
          const sumTs = latestSummary?.createdAt?.seconds || 0;
          if (!latestSummary || prodTs >= sumTs) {
            setAnalysisMode('products');
          }
        }
      },
      (error) => {
        setLoadingSavedAnalyses(false);
        setSavedAnalysisError(error.message);
      }
    );

    return () => {
      unsubDocs();
      unsubAnalyses();
    };
  }, [uid, workspaceOwnerId, tender?.id]);

  if (!tender) return null;

  const isLocked = tender.status === 'sonuclandi' || tender.status === 'iptal';
  const checklistDoneCount = CHECKLIST_ITEMS.filter((i) => tender.checklist?.[i.key]).length;
  const tenderBidProducts = bidProducts.filter((p) => p.tenderId === tender.id);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleToggleChecklist = async (key: keyof TenderChecklist) => {
    if (isLocked || !permissions.canEditTender) return;
    const next: TenderChecklist = {
      ...tender.checklist,
      [key]: !tender.checklist[key],
    };
    await updateTenderChecklist(tender.id, next);
  };

  const canDeleteOwnTender = permissions.canDeleteTender && isOwnRecord(tender, uid);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !permissions.canManageVault) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadTenderDocument(
        workspaceOwnerId,
        tender.id,
        file,
        uploadCategory,
        uploadNotes,
        memberIds,
        actor
      );
      setUploadNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Dosya yüklenemedi.');
    } finally {
      setUploading(false);
    }
  };

  const handleOpenDoc = (d: TenderDocument) => {
    onPreview({
      name: d.name,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      sha256: d.sha256,
      categoryLabel: TENDER_DOC_CATEGORY_LABELS[d.category],
      loadBlob: () => downloadTenderDocumentBlob(uid, workspaceOwnerId, tender.id, d),
    });
  };

  const effectiveDbProducts = fetchedDbProducts ?? bidProducts;

  const handleInspectDatabasePrices = async () => {
    setInspectingDb(true);
    setDbInspectError(null);
    try {
      const freshProducts = await fetchWorkspaceBidProducts(uid, workspaceOwnerId);
      setFetchedDbProducts(freshProducts);
    } catch (err) {
      setDbInspectError(
        err instanceof Error
          ? err.message
          : 'Veritabanındaki ürün fiyatları incelenirken hata oluştu.'
      );
    } finally {
      setInspectingDb(false);
    }
  };

  const handleDownloadProductAnalysisPdf = async (
    analysisOverride?: ProductAnalysisResult,
    preferenceOverride?: string
  ) => {
    const targetAnalysis = analysisOverride || productAnalysisResult;
    if (!targetAnalysis) return;
    setExportingPdf(true);
    setPdfError(null);
    try {
      await downloadProductAnalysisPdf({
        tender,
        companyName,
        preferenceNote: preferenceOverride ?? preferenceNote,
        analysis: targetAnalysis,
        dbProducts: effectiveDbProducts,
      });
    } catch (err) {
      setPdfError(
        err instanceof Error ? err.message : 'PDF dosyası oluşturulamadı.'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handlePrintProductAnalysis = async (
    analysisOverride?: ProductAnalysisResult,
    preferenceOverride?: string
  ) => {
    const targetAnalysis = analysisOverride || productAnalysisResult;
    if (!targetAnalysis) return;
    setPrintingDoc(true);
    setPdfError(null);
    try {
      await printProductAnalysis({
        tender,
        companyName,
        preferenceNote: preferenceOverride ?? preferenceNote,
        analysis: targetAnalysis,
        dbProducts: effectiveDbProducts,
      });
    } catch (err) {
      setPdfError(
        err instanceof Error ? err.message : 'Yazdırma görünümü hazırlanamadı.'
      );
    } finally {
      setPrintingDoc(false);
    }
  };

  const handleDownloadSummaryOrNotesPdf = async (options?: {
    analysisOverride?: DocumentAnalysisResult | null;
    includeNotes?: boolean;
    titleOverride?: string;
    fromNotesSection?: boolean;
  }) => {
    const targetAnalysis =
      options?.analysisOverride !== undefined
        ? options.analysisOverride
        : analysisResult;
    const includeNotes = options?.includeNotes ?? false;
    if (!targetAnalysis && !(includeNotes && tender.notes)) return;

    setExportingPdf(true);
    if (options?.fromNotesSection) {
      setNotesPdfError(null);
    } else {
      setPdfError(null);
    }
    try {
      await downloadTenderNotesAndSummaryPdf({
        tender,
        companyName,
        analysis: targetAnalysis,
        includeNotes,
        titleOverride: options?.titleOverride,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF dosyası oluşturulamadı.';
      if (options?.fromNotesSection) {
        setNotesPdfError(msg);
      } else {
        setPdfError(msg);
      }
    } finally {
      setExportingPdf(false);
    }
  };

  const handlePrintSummaryOrNotes = async (options?: {
    analysisOverride?: DocumentAnalysisResult | null;
    includeNotes?: boolean;
    titleOverride?: string;
    fromNotesSection?: boolean;
  }) => {
    const targetAnalysis =
      options?.analysisOverride !== undefined
        ? options.analysisOverride
        : analysisResult;
    const includeNotes = options?.includeNotes ?? false;
    if (!targetAnalysis && !(includeNotes && tender.notes)) return;

    setPrintingDoc(true);
    if (options?.fromNotesSection) {
      setNotesPdfError(null);
    } else {
      setPdfError(null);
    }
    try {
      await printTenderNotesAndSummary({
        tender,
        companyName,
        analysis: targetAnalysis,
        includeNotes,
        titleOverride: options?.titleOverride,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Yazdırma görünümü hazırlanamadı.';
      if (options?.fromNotesSection) {
        setNotesPdfError(msg);
      } else {
        setPdfError(msg);
      }
    } finally {
      setPrintingDoc(false);
    }
  };

  const runAnalysisRequest = async (
    payload: {
      text?: string;
      fileBlob?: Blob;
      mimeType?: string;
      fileName?: string;
    },
    modeOverride?: AnalysisMode
  ) => {
    const mode = modeOverride || analysisMode;
    setAnalyzing(true);
    setAnalysisError(null);
    setSavedNotesFeedback(false);
    setDbInspectError(null);
    setPdfError(null);
    try {
      const apiBase = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
      const endpoint =
        mode === 'products'
          ? `${apiBase}api/tenders/analyze-products`
          : `${apiBase}api/tenders/analyze-document`;

      const buildRequestInit = (
        authHeaders: Record<string, string>
      ): RequestInit => {
        if (payload.fileBlob) {
          const fd = new FormData();
          fd.append(
            'file',
            payload.fileBlob,
            payload.fileName || 'dokuman.pdf'
          );
          if (payload.mimeType) fd.append('mimeType', payload.mimeType);
          if (payload.text) fd.append('text', payload.text);
          fd.append('tenderTitle', tender.title);
          fd.append('trackingCode', tender.trackingCode);
          if (mode === 'products' && preferenceNote.trim()) {
            fd.append('preferenceNote', preferenceNote.trim());
          }
          return {
            method: 'POST',
            headers: { Authorization: authHeaders.Authorization },
            body: fd,
          };
        }

        return {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            text: payload.text,
            fileName: payload.fileName,
            tenderTitle: tender.title,
            trackingCode: tender.trackingCode,
            ...(mode === 'products' && preferenceNote.trim()
              ? { preferenceNote: preferenceNote.trim() }
              : {}),
          }),
        };
      };

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 90000);
      let response: Response;
      try {
        let headers = await getAuthBearerHeaders();
        response = await fetch(endpoint, {
          ...buildRequestInit(headers),
          signal: controller.signal,
        });
        if (response.status === 401) {
          headers = await getAuthBearerHeaders(true);
          response = await fetch(endpoint, {
            ...buildRequestInit(headers),
            signal: controller.signal,
          });
        }
      } finally {
        window.clearTimeout(timeoutId);
      }

      const rawText = await response.text();
      let data: Record<string, unknown> | null = null;
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText) as unknown;
          if (parsed && typeof parsed === 'object') {
            data = parsed as Record<string, unknown>;
          }
        } catch {
          data = null;
        }
      }

      if (!response.ok || !data) {
        if (data && typeof data.error === 'string' && data.error.trim()) {
          throw new Error(data.error);
        }
        if (response.status === 413) {
          throw new Error(
            'Gönderilen doküman boyutu sunucu sınırını (10 MB) aşıyor. Lütfen daha küçük bir dosya seçin veya ilgili metni yapıştırın.'
          );
        }
        if (response.status === 429) {
          throw new Error(
            'Çok fazla analiz isteği gönderildi. Lütfen kısa bir süre bekleyip tekrar deneyin.'
          );
        }
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          throw new Error(
            'Yapay zeka analiz sunucusu şu anda yoğun veya yanıt süresi aşıldı. Lütfen birkaç saniye sonra tekrar deneyin veya daha kısa bir metin bölümü girin.'
          );
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            'Oturum doğrulaması geçersiz veya süresi dolmuş. Lütfen sayfayı yenileyip tekrar giriş yapın.'
          );
        }
        throw new Error(
          `Sunucudan geçerli analiz yanıtı alınamadı (HTTP ${response.status}). Lütfen sayfayı yenileyip tekrar deneyin.`
        );
      }

      const normalizedForStore =
        mode === 'products'
          ? normalizeProductAnalysisResult(data)
          : normalizeDocumentAnalysisResult(data);

      if (mode === 'products') {
        hasHydratedProductRef.current = true;
        setProductAnalysisResult(normalizedForStore as ProductAnalysisResult);
        setActiveProductSavedNote('Ekrana kaydedildi');
        fetchWorkspaceBidProducts(uid, workspaceOwnerId)
          .then((freshProducts) => setFetchedDbProducts(freshProducts))
          .catch(() => {
            // Gerçek zamanlı bidProducts aboneliği yedek olarak devrede
          });
      } else {
        hasHydratedSummaryRef.current = true;
        setAnalysisResult(normalizedForStore as DocumentAnalysisResult);
        setActiveSummarySavedNote('Ekrana kaydedildi');
      }

      // Başarılı analiz sonucunu Firestore arşivine kaydet.
      try {
        await saveTenderAnalysis({
          workspaceOwnerId,
          tenderId: tender.id,
          actor,
          mode,
          result: normalizedForStore as unknown as Record<string, unknown>,
          preferenceNote: mode === 'products' ? preferenceNote : '',
          memberIds,
        });
        setSavedAnalysisError(null);
      } catch (archiveError) {
        setSavedAnalysisError(
          archiveError instanceof Error
            ? `Analiz tamamlandı ancak veritabanı arşivine kaydedilemedi: ${archiveError.message}`
            : 'Analiz tamamlandı ancak veritabanı arşivine kaydedilemedi.'
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setAnalysisError(
          'Analiz isteği zaman aşımına uğradı. Çok uzun bir dosya gönderdiyseniz yalnızca ilgili şartname bölümünü yapıştırarak veya birkaç saniye sonra tekrar deneyin.'
        );
      } else if (
        err instanceof Error &&
        /failed to fetch|networkerror|load failed/i.test(err.message)
      ) {
        setAnalysisError(
          'Analiz sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edip birkaç saniye sonra tekrar deneyin.'
        );
      } else {
        setAnalysisError(
          err instanceof Error ? err.message : 'Analiz sırasında bir hata oluştu.'
        );
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzeText = async (modeOverride?: AnalysisMode) => {
    const targetMode = modeOverride || analysisMode;
    if (modeOverride) setAnalysisMode(modeOverride);
    if (!analysisText.trim()) {
      setAnalysisError(
        targetMode === 'products'
          ? 'Lütfen teknik şartnamedeki ürün özelliklerini yapıştırın veya kasadan bir doküman seçin.'
          : 'Lütfen analiz edilecek ihale şartnamesi veya doküman metnini girin.'
      );
      return;
    }
    await runAnalysisRequest({ text: analysisText }, targetMode);
  };

  const resolveAnalyzableMime = (fileName: string, mimeType: string): string | null => {
    const lowerName = (fileName || '').toLowerCase();
    const lowerMime = (mimeType || '').toLowerCase().split(';')[0].trim();

    if (
      lowerMime.startsWith('text/') ||
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.csv')
    ) {
      return lowerName.endsWith('.csv') ? 'text/csv' : 'text/plain';
    }
    if (
      lowerMime === 'application/pdf' ||
      lowerMime === 'application/x-pdf' ||
      lowerName.endsWith('.pdf')
    ) {
      return 'application/pdf';
    }
    if (
      lowerMime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx')
    ) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (
      lowerMime ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      lowerName.endsWith('.xlsx')
    ) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (lowerName.endsWith('.png') || lowerMime === 'image/png') return 'image/png';
    if (
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg') ||
      lowerMime === 'image/jpeg'
    ) {
      return 'image/jpeg';
    }
    if (lowerName.endsWith('.webp') || lowerMime === 'image/webp') return 'image/webp';
    if (lowerName.endsWith('.gif') || lowerMime === 'image/gif') return 'image/gif';
    if (lowerMime.startsWith('image/')) return lowerMime;
    return null;
  };

  const analyzeBlobFile = async (blob: Blob, fileName: string, mimeType: string) => {
    const resolvedMime = resolveAnalyzableMime(fileName, mimeType);
    if (!resolvedMime) {
      setAnalyzing(false);
      setAnalysisError(
        'Doğrudan dosya analizi PDF, DOCX, XLSX, metin (TXT/CSV) ve görsel dosyalarını destekler. Diğer dosyaların metnini yukarıdaki alana yapıştırabilirsiniz.'
      );
      return;
    }

    if (resolvedMime === 'text/plain' || resolvedMime === 'text/csv') {
      const text = await blob.text();
      setAnalysisText(text);
      await runAnalysisRequest({ text, fileName }, analysisMode);
      return;
    }

    if (blob.size > 10 * 1024 * 1024) {
      setAnalyzing(false);
      setAnalysisError(
        `Seçilen doküman 10 MB analiz sınırını aşıyor (${(blob.size / (1024 * 1024)).toFixed(1)} MB). İlgili şartname metnini yukarıdaki alana yapıştırarak analiz edebilirsiniz.`
      );
      return;
    }

    await runAnalysisRequest(
      {
        text: analysisText.trim() || undefined,
        fileBlob: blob,
        mimeType: resolvedMime,
        fileName,
      },
      analysisMode
    );
  };

  const handleDirectAnalysisFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      await analyzeBlobFile(file, file.name, file.type);
    } catch (err) {
      setAnalyzing(false);
      setAnalysisError(
        err instanceof Error ? err.message : 'Seçilen dosya analiz edilemedi.'
      );
    }
  };

  const handleAnalyzeVaultDoc = async (d: TenderDocument) => {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const blob = await downloadTenderDocumentBlob(
        uid,
        workspaceOwnerId,
        tender.id,
        d
      );
      await analyzeBlobFile(blob, d.name, d.mimeType || '');
    } catch (err) {
      setAnalyzing(false);
      setAnalysisError(
        err instanceof Error ? err.message : 'Kasadan doküman okunamadı.'
      );
    }
  };

  const handleSaveAnalysisToNotes = async () => {
    if (isLocked || !permissions.canEditTender) return;

    let addition = '';
    if (analysisMode === 'products' && productAnalysisResult) {
      const lines = productAnalysisResult.items.map((item) => {
        const brands = item.recommendations
          .map((r) => `${r.brand} ${r.model}`)
          .join(' / ');
        return `• ${item.itemNo} - ${item.productName}${item.quantityAndUnit ? ` (${item.quantityAndUnit})` : ''}: ${brands}`;
      });
      addition = [
        `[Ürün & Marka/Model Önerileri]`,
        productAnalysisResult.overview,
        lines.join('\n'),
      ]
        .filter(Boolean)
        .join('\n');
    } else if (analysisResult) {
      const datesLines = analysisResult.criticalDates
        .map((cd) => `• ${cd.label}: ${cd.dateText}`)
        .join('\n');
      addition = [
        `[Doküman Özeti]`,
        analysisResult.summary,
        datesLines ? `\n[Önemli Tarihler]\n${datesLines}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (!addition) return;
    setSavingToNotes(true);
    try {
      const combined = tender.notes ? `${tender.notes}\n\n${addition}` : addition;
      await updateTender(
        tender.id,
        { notes: combined },
        { currentUid: uid, workspaceOwnerId, canSyncProducts: permissions.canManageProducts }
      );
      setSavedNotesFeedback(true);
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : 'Analiz ihale notlarına eklenemedi.'
      );
    } finally {
      setSavingToNotes(false);
    }
  };

  const handleShowSavedAnalysis = (analysis: SavedTenderAnalysis) => {
    userSelectedTabRef.current = true;
    setAnalysisMode(analysis.mode);
    setAnalysisError(null);
    setSavedAnalysisError(null);
    setSavedNotesFeedback(false);

    if (analysis.mode === 'products') {
      hasHydratedProductRef.current = true;
      setProductAnalysisResult(normalizeProductAnalysisResult(analysis.result));
      setPreferenceNote(analysis.preferenceNote || '');
      setActiveProductSavedNote('Kayıtlı analiz arşivinden yüklendi');
    } else {
      hasHydratedSummaryRef.current = true;
      setAnalysisResult(normalizeDocumentAnalysisResult(analysis.result));
      setActiveSummarySavedNote('Kayıtlı analiz arşivinden yüklendi');
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-[#0B2239]/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="İhale Detay Penceresi"
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
              <button
                type="button"
                onClick={() => handleCopy(tender.trackingCode, 'code')}
                className="inline-flex items-center gap-1.5 font-mono font-semibold text-[#FBBF24] hover:underline cursor-pointer tabular-nums"
              >
                <span>{tender.trackingCode}</span>
                {copiedKey === 'code' ? (
                  <Check className="w-3.5 h-3.5 text-[#34D399]" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span>{STATUS_LABELS[tender.status]}</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className="font-medium text-white">
                {getRelativeDayLabel(tender.tenderDate)}
              </span>
            </div>
            <h2 className="font-display text-lg font-bold text-white mt-1 leading-snug">
              {tender.title}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">{tender.authority}</p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <a
              href={`?detail=tender&id=${encodeURIComponent(tender.id)}`}
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
              title={isMaximized ? 'Pencereyi Küçült' : 'Tam Ekran'}
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
        <div className="px-5 py-3 bg-[#F3F6FA] border-b border-[#DCE3EC] flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenTenderDay(tender.id);
            }}
            className="min-h-[40px] px-3.5 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>İhale Günü Modu</span>
          </button>

          {onOpenPricing && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPricing(tender.id);
              }}
              className="min-h-[40px] px-3.5 inline-flex items-center gap-1.5 bg-white border border-[#0066B3] hover:bg-[#0066B3]/5 text-[#0066B3] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
            >
              <Percent className="w-3.5 h-3.5" />
              <span>Fiyat Çalışma</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => downloadTenderICS(tender, companyName)}
            className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap transition-colors"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            <span>Takvime Aktar (.ics)</span>
          </button>

          <a
            href={getGoogleCalendarUrl(tender)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-medium rounded-lg whitespace-nowrap transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Google Takvim</span>
          </a>

          {!isLocked && permissions.canEditTender && (
            <button
              type="button"
              onClick={() => onEdit(tender)}
              className="min-h-[40px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Düzenle</span>
            </button>
          )}

          {tender.status === 'kazanildi' && canViewProjects && onOpenProject && (
            <button
              type="button"
              onClick={() => onOpenProject(tender.id, linkedProject)}
              className="min-h-[40px] px-3.5 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#006344] text-white text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>
                {linkedProject
                  ? `Projeyi Aç (${linkedProject.projectCode})`
                  : 'Proje Başlat'}
              </span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-8">
          {isLocked && (
            <div className="p-3.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg flex items-center gap-3 text-xs text-[#0B2239]">
              <Lock className="w-4 h-4 text-[#4E5D6C] shrink-0" />
              <span>
                Bu ihale <strong>{STATUS_LABELS[tender.status]}</strong> olarak kapandığı için kayıt alanları değiştirilemez.
              </span>
            </div>
          )}

          {/* Key Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 pb-6 border-b border-[#DCE3EC]">
            <div>
              <div className="text-xs text-[#4E5D6C]">İhale Tarih &amp; Saati</div>
              <div className="text-sm font-semibold text-[#0B2239] mt-0.5 tabular-nums">
                {formatTurkishDate(tender.tenderDate)} · {tender.tenderTime}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#4E5D6C]">Resmi İKN</div>
              <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums flex items-center gap-1.5">
                <span>{tender.ikn || 'Belirtilmedi'}</span>
                {tender.ikn && (
                  <button
                    type="button"
                    onClick={() => handleCopy(tender.ikn, 'ikn')}
                    aria-label="İKN Kopyala"
                    className="text-[#868686] hover:text-[#0B2239] cursor-pointer"
                  >
                    {copiedKey === 'ikn' ? (
                      <Check className="w-3.5 h-3.5 text-[#007A53]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#4E5D6C]">İhale Usulü</div>
              <div className="text-sm font-medium text-[#0B2239] mt-0.5">
                {PROCUREMENT_LABELS[tender.procurementType]}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#4E5D6C]">Teklif / Yaklaşık Tutar</div>
              <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums">
                {formatCurrency(tender.estimatedAmount, tender.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#4E5D6C]">Geçici Teminat</div>
              <div className="text-sm font-mono font-semibold text-[#0B2239] mt-0.5 tabular-nums">
                {formatCurrency(tender.bidBondAmount, tender.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#4E5D6C]">Teslim Yeri</div>
              <div className="text-sm text-[#0B2239] mt-0.5 truncate" title={tender.location}>
                {tender.location || 'Belirtilmedi'}
              </div>
            </div>
            {tender.createdByName && (
              <div className="col-span-2 sm:col-span-3 pt-1">
                <div className="text-xs text-[#4E5D6C]">Kaydı Oluşturan</div>
                <div className="text-xs font-medium text-[#0B2239] mt-0.5">
                  {tender.createdByName}
                  {tender.createdByEmail ? ` (${tender.createdByEmail})` : ''}
                </div>
              </div>
            )}
          </div>

          {(tender.notes || analysisResult) && (
            <div className="pb-6 border-b border-[#DCE3EC] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-[#4E5D6C]">
                  İhale Notları
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={exportingPdf}
                    onClick={() =>
                      handleDownloadSummaryOrNotesPdf({
                        analysisOverride: analysisResult,
                        includeNotes: true,
                        fromNotesSection: true,
                      })
                    }
                    className="min-h-[34px] px-3 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 transition-colors"
                  >
                    {exportingPdf ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FBBF24]" />
                    ) : (
                      <FileDown className="w-3.5 h-3.5 text-[#FBBF24]" />
                    )}
                    <span>PDF Olarak İndir</span>
                  </button>
                  <button
                    type="button"
                    disabled={printingDoc}
                    onClick={() =>
                      handlePrintSummaryOrNotes({
                        analysisOverride: analysisResult,
                        includeNotes: true,
                        fromNotesSection: true,
                      })
                    }
                    className="min-h-[34px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#0066B3]" />
                    <span>Yazdır</span>
                  </button>
                </div>
              </div>
              {notesPdfError && (
                <div
                  role="alert"
                  className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium"
                >
                  {notesPdfError}
                </div>
              )}
              {tender.notes ? (
                <p className="text-sm text-[#0B2239] whitespace-pre-wrap leading-relaxed">
                  {tender.notes}
                </p>
              ) : (
                <p className="text-xs text-[#4E5D6C]">
                  Henüz metin notu girilmedi; kayıtlı yapay zeka şartname özeti ve kritik tarihler PDF olarak indirilebilir veya yazdırılabilir.
                </p>
              )}
            </div>
          )}

          {/* Checklist */}
          <div className="pb-6 border-b border-[#DCE3EC]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm font-bold text-[#0B2239]">
                Hazırlık Kontrol Listesi
              </h3>
              <span className="text-xs font-mono font-semibold text-[#4E5D6C] tabular-nums">
                {checklistDoneCount}/{CHECKLIST_ITEMS.length} Tamamlandı
              </span>
            </div>
            <div className="divide-y divide-[#DCE3EC] border border-[#DCE3EC] rounded-lg">
              {CHECKLIST_ITEMS.map((item) => {
                const checked = Boolean(tender.checklist?.[item.key]);
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={isLocked || !permissions.canEditTender}
                    onClick={() => handleToggleChecklist(item.key)}
                    className="w-full min-h-[48px] px-4 py-2.5 flex items-start gap-3 text-left hover:bg-[#F3F6FA]/70 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {checked ? (
                      <CheckSquare className="w-5 h-5 text-[#007A53] shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-5 h-5 text-[#868686] shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div
                        className={`text-sm font-medium ${
                          checked ? 'text-[#868686] line-through' : 'text-[#0B2239]'
                        }`}
                      >
                        {item.label}
                      </div>
                      <div className="text-xs text-[#4E5D6C]">{item.hint}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tender Documents Vault */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-[#0B2239]">
                  İhale Doküman Kasası ({docs.length})
                </h3>
                <p className="text-xs text-[#4E5D6C]">
                  Şartname, teklif mektubu ve teminat dosyalarınız SHA-256 ile korunur.
                </p>
              </div>
            </div>

            {/* Upload Box */}
            {permissions.canManageVault && (
              <div className="p-4 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#0B2239] mb-1">
                      Doküman Kategorisi
                    </label>
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value as TenderDocCategory)}
                      className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                    >
                      {(Object.keys(TENDER_DOC_CATEGORY_LABELS) as TenderDocCategory[]).map(
                        (k) => (
                          <option key={k} value={k}>
                            {TENDER_DOC_CATEGORY_LABELS[k]}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#0B2239] mb-1">
                      Açıklama (İsteğe Bağlı)
                    </label>
                    <input
                      type="text"
                      maxLength={SCHEMA_LIMITS.DOC_NOTES_MAX}
                      placeholder="Örn: İmzalı son versiyon"
                      value={uploadNotes}
                      onChange={(e) => setUploadNotes(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="hidden"
                    id="tender-doc-upload"
                  />
                  <label
                    htmlFor="tender-doc-upload"
                    className={`min-h-[44px] px-4 py-2 inline-flex items-center gap-2 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                      uploading ? 'opacity-60 pointer-events-none' : ''
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    <span>{uploading ? 'Kasaya Yükleniyor…' : 'Dosya Seç ve Kasaya Ekle'}</span>
                  </label>
                  <span className="text-[11px] text-[#4E5D6C]">
                    Maks. 10 MB · PDF, DOCX, XLSX, Görsel, TXT
                  </span>
                </div>

                {uploadError && (
                  <p className="text-xs text-red-700 font-medium">{uploadError}</p>
                )}
              </div>
            )}

            {/* Docs List */}
            {docs.length === 0 ? (
              <div className="p-6 border border-dashed border-[#DCE3EC] rounded-lg text-center text-xs text-[#4E5D6C]">
                Bu ihaleye henüz doküman yüklenmemiş. Yukarıdan şartname veya teminat dosyası ekleyebilirsiniz.
              </div>
            ) : (
              <div className="divide-y divide-[#DCE3EC] border border-[#DCE3EC] rounded-lg">
                {docs.map((d) => {
                  const canDeleteOwnDoc =
                    permissions.canManageVault && isOwnRecord(d, uid);
                  return (
                    <div
                      key={d.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#0B2239] truncate">
                            {d.name}
                          </span>
                        </div>
                        <div className="text-xs text-[#4E5D6C] mt-0.5 flex flex-wrap items-center gap-x-2">
                          <span>{TENDER_DOC_CATEGORY_LABELS[d.category]}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{formatBytes(d.sizeBytes)}</span>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            disabled={!permissions.canManageVault}
                            onClick={() => toggleTenderDocVerified(tender.id, d.id, !d.verified)}
                            className={`inline-flex items-center gap-1 font-medium cursor-pointer disabled:cursor-not-allowed ${
                              d.verified ? 'text-[#007A53]' : 'text-amber-700'
                            }`}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>{d.verified ? 'İhale Gününe Hazır' : 'Kontrol Bekliyor'}</span>
                          </button>
                          {d.createdByName && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Ekleyen: {d.createdByName}</span>
                            </>
                          )}
                        </div>
                        {d.notes && (
                          <p className="text-xs text-[#4E5D6C] mt-1">{d.notes}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenDoc(d)}
                          className="min-h-[44px] px-3 inline-flex items-center gap-1.5 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-medium rounded-lg cursor-pointer transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          <span>Aç / İndir</span>
                        </button>
                        {canDeleteOwnDoc ? (
                          <button
                            type="button"
                            onClick={async () => {
                              setUploadError(null);
                              try {
                                await deleteTenderDocument(
                                  uid,
                                  workspaceOwnerId,
                                  tender.id,
                                  d,
                                  {
                                    actor,
                                    parentTenderCode: tender.trackingCode,
                                    memberIds,
                                  }
                                );
                              } catch (err) {
                                setUploadError(
                                  err instanceof Error ? err.message : 'Doküman silinemedi.'
                                );
                              }
                            }}
                            aria-label="Dokümanı Sil"
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-red-50 hover:text-red-700 text-[#4E5D6C] rounded-lg cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          permissions.canManageVault && (
                            <span
                              title="Yalnızca bu dokümanı yükleyen kullanıcı silebilir"
                              className="inline-flex items-center justify-center min-w-[32px] text-[#868686]"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Gemini Doküman Metni Analizi ve Marka/Model Önerisi */}
          {(permissions.canAnalyzeDocuments ||
            savedAnalyses.length > 0 ||
            Boolean(analysisResult) ||
            Boolean(productAnalysisResult)) && (
            <div className="pt-6 border-t border-[#DCE3EC] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-sm font-bold text-[#0B2239] flex items-center gap-2">
                    <FileSearch className="w-4 h-4 text-[#0066B3] shrink-0" />
                    <span>Yapay Zeka Şartname &amp; Ürün Analizi</span>
                  </h3>
                  <p className="text-xs text-[#4E5D6C] mt-0.5">
                    Şartname özeti ve kritik tarihleri çıkarın ya da alıma çıkılan ürün özelliklerine göre marka/model önerisi alın.
                  </p>
                </div>

                {/* Mode Switch */}
                <div className="flex items-center gap-1 p-1 bg-[#F3F6FA] rounded-lg shrink-0 self-start">
                  <button
                    type="button"
                    onClick={() => {
                      userSelectedTabRef.current = true;
                      setAnalysisMode('summary');
                      setAnalysisError(null);
                      setSavedNotesFeedback(false);
                    }}
                    className={`min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                      analysisMode === 'summary'
                        ? 'bg-white text-[#0B2239] shadow-xs'
                        : 'text-[#4E5D6C] hover:text-[#0B2239]'
                    }`}
                  >
                    Özet &amp; Tarihler
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      userSelectedTabRef.current = true;
                      setAnalysisMode('products');
                      setAnalysisError(null);
                      setSavedNotesFeedback(false);
                    }}
                    className={`min-h-[34px] px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer transition-colors whitespace-nowrap ${
                      analysisMode === 'products'
                        ? 'bg-white text-[#0B2239] shadow-xs'
                        : 'text-[#4E5D6C] hover:text-[#0B2239]'
                    }`}
                  >
                    Ürün &amp; Marka/Model
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-[#DCE3EC] bg-[#F8FAFC] p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-[#0B2239]">
                    Kayıtlı Analizler
                  </h4>
                  <span className="text-[11px] text-[#4E5D6C]">
                    {savedAnalyses.length} kayıt
                  </span>
                </div>

                {loadingSavedAnalyses ? (
                  <p className="text-xs text-[#4E5D6C]">
                    Kayıtlı analizler yükleniyor...
                  </p>
                ) : savedAnalyses.length === 0 ? (
                  <p className="text-xs text-[#4E5D6C]">
                    Bu ihale için henüz kayıtlı analiz bulunmuyor.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {savedAnalyses.map((analysis) => {
                      const savedDateText = analysis.createdAt?.seconds
                        ? new Date(analysis.createdAt.seconds * 1000).toLocaleString('tr-TR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '';
                      return (
                        <div
                          key={analysis.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-[#DCE3EC] px-3 py-2"
                        >
                          <div>
                            <p className="text-xs font-semibold text-[#0B2239]">
                              {analysis.mode === 'products'
                                ? 'Ürün & Marka/Model Analizi'
                                : 'Özet & Kritik Tarihler Analizi'}
                              {savedDateText ? (
                                <span className="ml-2 font-mono font-normal text-[11px] text-[#4E5D6C]">
                                  · {savedDateText}
                                </span>
                              ) : null}
                            </p>
                            {analysis.preferenceNote && (
                              <p className="text-[11px] text-[#4E5D6C] mt-0.5">
                                {analysis.preferenceNote}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={exportingPdf}
                              onClick={() =>
                                analysis.mode === 'products'
                                  ? handleDownloadProductAnalysisPdf(
                                      normalizeProductAnalysisResult(analysis.result),
                                      analysis.preferenceNote || ''
                                    )
                                  : handleDownloadSummaryOrNotesPdf({
                                      analysisOverride: normalizeDocumentAnalysisResult(
                                        analysis.result
                                      ),
                                      includeNotes: Boolean(tender.notes),
                                    })
                              }
                              className="min-h-[34px] px-3 py-1 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-md cursor-pointer disabled:opacity-60 transition-colors"
                            >
                              <FileDown className="w-3.5 h-3.5 text-[#FBBF24]" />
                              <span>PDF Olarak İndir</span>
                            </button>
                            <button
                              type="button"
                              disabled={printingDoc}
                              onClick={() =>
                                analysis.mode === 'products'
                                  ? handlePrintProductAnalysis(
                                      normalizeProductAnalysisResult(analysis.result),
                                      analysis.preferenceNote || ''
                                    )
                                  : handlePrintSummaryOrNotes({
                                      analysisOverride: normalizeDocumentAnalysisResult(
                                        analysis.result
                                      ),
                                      includeNotes: Boolean(tender.notes),
                                    })
                              }
                              className="min-h-[34px] px-3 py-1 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-md cursor-pointer disabled:opacity-60 transition-colors"
                            >
                              <Printer className="w-3.5 h-3.5 text-[#0066B3]" />
                              <span>Yazdır</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleShowSavedAnalysis(analysis)}
                              className="min-h-[34px] px-3 py-1 inline-flex items-center gap-1.5 bg-[#E8F2FA] hover:bg-[#D5E8F7] text-[#0066B3] text-xs font-semibold rounded-md cursor-pointer transition-colors"
                            >
                              <FileSearch className="w-3.5 h-3.5" />
                              <span>Ekranda Göster</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {savedAnalysisError && (
                  <p className="text-xs text-amber-700">
                    {savedAnalysisError}
                  </p>
                )}
              </div>

              {permissions.canAnalyzeDocuments && (
                <>
                  {docs.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[#4E5D6C]">
                    {analysisMode === 'products'
                      ? 'Kasadan ürün & marka analizi yap:'
                      : 'Kasadan özet & tarih analizi yap:'}
                  </span>
                  {docs.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      disabled={analyzing}
                      onClick={() => handleAnalyzeVaultDoc(d)}
                      className="min-h-[34px] px-2.5 py-1 bg-[#F3F6FA] hover:bg-[#DCE3EC]/60 text-[#0B2239] text-xs font-medium rounded-md cursor-pointer disabled:opacity-50 truncate max-w-[220px] transition-colors"
                      title={`${d.name} dosyasını analiz et`}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              )}

              <textarea
                rows={5}
                value={analysisText}
                onChange={(e) => setAnalysisText(e.target.value)}
                placeholder={
                  analysisMode === 'products'
                    ? 'Teknik şartnamedeki ürün/malzeme özelliklerini (güç, kapasite, malzeme, standart, boyut, koruma sınıfı vb.) buraya yapıştırın...'
                    : 'İhale şartnamesi, geçici teminat maddesi, zeyilname veya teklif sunum koşullarını buraya yapıştırın...'
                }
                className="w-full px-3.5 py-2.5 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />

              {analysisMode === 'products' && (
                <input
                  type="text"
                  maxLength={200}
                  value={preferenceNote}
                  onChange={(e) => setPreferenceNote(e.target.value)}
                  placeholder="Tercih / Kısıt Notu (İsteğe bağlı — örn: Yerli malı öncelikli, Avrupa menşei, fiyat-performans odaklı)"
                  className="w-full min-h-[40px] px-3.5 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAnalyzeText()}
                    disabled={analyzing}
                    className="min-h-[44px] px-4 py-2 inline-flex items-center gap-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 transition-colors"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>
                          {analysisMode === 'products'
                            ? 'Ürünler & Marka/Modeller Analiz Ediliyor…'
                            : 'Doküman Analiz Ediliyor…'}
                        </span>
                      </>
                    ) : analysisMode === 'products' ? (
                      <>
                        <Cpu className="w-4 h-4" />
                        <span>Ürün Özelliklerini Analiz Et ve Marka/Model Öner</span>
                      </>
                    ) : (
                      <>
                        <FileSearch className="w-4 h-4" />
                        <span>Dokümanı Analiz Et</span>
                      </>
                    )}
                  </button>

                  <input
                    ref={analysisFileInputRef}
                    type="file"
                    accept=".pdf,.docx,.xlsx,.txt,.csv,image/png,image/jpeg,image/webp,application/pdf"
                    onChange={handleDirectAnalysisFileChange}
                    disabled={analyzing}
                    className="hidden"
                    id="direct-ai-analysis-file"
                  />
                  <label
                    htmlFor="direct-ai-analysis-file"
                    className={`min-h-[44px] px-3.5 py-2 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                      analyzing ? 'opacity-60 pointer-events-none' : ''
                    }`}
                  >
                    <Upload className="w-4 h-4 text-[#0066B3]" />
                    <span>Dosyadan Analiz Et (PDF / DOCX / XLSX / Görsel)</span>
                  </label>
                </div>

                {((analysisMode === 'summary' && analysisResult) ||
                  (analysisMode === 'products' && productAnalysisResult)) &&
                  !isLocked &&
                  permissions.canEditTender && (
                    <button
                      type="button"
                      onClick={handleSaveAnalysisToNotes}
                      disabled={savingToNotes || savedNotesFeedback}
                      className="min-h-[40px] px-3 inline-flex items-center gap-1.5 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 transition-colors"
                    >
                      <BookmarkPlus className="w-4 h-4 text-[#0066B3]" />
                      <span>
                        {savedNotesFeedback
                          ? 'İhale Notlarına Eklendi'
                          : savingToNotes
                          ? 'Kaydediliyor…'
                          : analysisMode === 'products'
                          ? 'Marka/Model Önerilerini Notlara Ekle'
                          : 'Özeti İhale Notlarına Ekle'}
                      </span>
                    </button>
                  )}
              </div>
                </>
              )}

              {analysisError && (
                <div
                  role="alert"
                  className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-xs text-red-700 font-medium"
                >
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{analysisError}</span>
                </div>
              )}

              {analysisMode === 'summary' && analysisResult && (
                <div className="border border-[#DCE3EC] rounded-xl divide-y divide-[#DCE3EC] bg-white">
                  {/* Üst Araç Çubuğu: PDF İndir ve Yazdır */}
                  <div className="p-4 bg-[#F3F6FA]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-xs font-bold text-[#0B2239] flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5">
                          <FileSearch className="w-4 h-4 text-[#0066B3] shrink-0" />
                          <span>Şartname Özeti &amp; Kritik Tarihler Araştırması</span>
                        </span>
                        {activeSummarySavedNote && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#007A53]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{activeSummarySavedNote}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#4E5D6C] tabular-nums">
                        {analysisResult.criticalDates.length} önemli tarih ·{' '}
                        {analysisResult.keyRequirements.length} öne çıkan şartname koşulu
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadSummaryOrNotesPdf({
                            includeNotes: Boolean(tender.notes),
                          })
                        }
                        disabled={exportingPdf}
                        className="min-h-[38px] px-3.5 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
                      >
                        {exportingPdf ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FBBF24]" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5 text-[#FBBF24]" />
                        )}
                        <span>{exportingPdf ? 'PDF Hazırlanıyor…' : 'PDF Olarak İndir'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handlePrintSummaryOrNotes({
                            includeNotes: Boolean(tender.notes),
                          })
                        }
                        disabled={printingDoc}
                        className="min-h-[38px] px-3.5 inline-flex items-center gap-1.5 bg-white hover:bg-[#F3F6FA] text-[#0B2239] border border-[#DCE3EC] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5 text-[#0066B3]" />
                        <span>Yazdır</span>
                      </button>
                    </div>
                  </div>

                  {pdfError && (
                    <div
                      role="alert"
                      className="px-4 py-2.5 bg-red-50 text-xs text-red-700 font-medium"
                    >
                      {pdfError}
                    </div>
                  )}

                  <div className="p-4 space-y-1.5">
                    <div className="text-xs font-semibold text-[#4E5D6C]">Doküman Özeti</div>
                    <p className="text-sm text-[#0B2239] leading-relaxed whitespace-pre-wrap">
                      {analysisResult.summary}
                    </p>
                  </div>

                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-[#4E5D6C] flex items-center gap-1.5">
                        <CalendarClock className="w-4 h-4 text-[#0066B3]" />
                        <span>Tespit Edilen Önemli Tarihler</span>
                      </div>
                      <span className="text-xs font-mono text-[#4E5D6C] tabular-nums">
                        {analysisResult.criticalDates.length} tarih
                      </span>
                    </div>

                    {analysisResult.criticalDates.length === 0 ? (
                      <p className="text-xs text-[#4E5D6C]">
                        Metin içinde belirgin bir son tarih veya takvim ifadesi tespit edilmedi.
                      </p>
                    ) : (
                      <div className="divide-y divide-[#DCE3EC] border border-[#DCE3EC] rounded-lg">
                        {analysisResult.criticalDates.map((cd, idx) => {
                          const isKritik = cd.importance === 'kritik';
                          const isYuksek = cd.importance === 'yuksek';
                          return (
                            <div
                              key={`${cd.label}-${idx}`}
                              className={`p-3 space-y-1 ${
                                isKritik
                                  ? 'bg-red-50/60'
                                  : isYuksek
                                  ? 'bg-amber-50/60'
                                  : 'bg-white'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-[#0B2239]">
                                  {cd.label}
                                </span>
                                <div className="flex items-center gap-2 text-xs">
                                  <span
                                    className={`font-semibold ${
                                      isKritik
                                        ? 'text-red-700'
                                        : isYuksek
                                        ? 'text-amber-800'
                                        : 'text-[#4E5D6C]'
                                    }`}
                                  >
                                    {isKritik
                                      ? 'Kritik Tarih'
                                      : isYuksek
                                      ? 'Yüksek Öncelik'
                                      : 'Bilgi'}
                                  </span>
                                  <span className="text-[#DCE3EC]" aria-hidden="true">
                                    ·
                                  </span>
                                  <span className="font-mono font-bold text-[#0B2239] tabular-nums">
                                    {cd.dateText}
                                  </span>
                                </div>
                              </div>
                              {cd.excerpt && (
                                <p className="text-xs text-[#4E5D6C] leading-relaxed">
                                  {cd.excerpt}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {analysisResult.keyRequirements.length > 0 && (
                    <div className="p-4 space-y-2.5">
                      <div className="text-xs font-semibold text-[#4E5D6C]">
                        Öne Çıkan Şartname Koşulları
                      </div>
                      <div className="divide-y divide-[#DCE3EC]">
                        {analysisResult.keyRequirements.map((req, idx) => (
                          <div key={`${req.title}-${idx}`} className="py-2 first:pt-0 last:pb-0">
                            <div className="text-xs font-semibold text-[#0B2239]">{req.title}</div>
                            <div className="text-xs text-[#4E5D6C] mt-0.5">{req.detail}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-3.5 bg-[#F3F6FA]/40 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-[#4E5D6C]">
                      Araştırma sonucu bu ihale kaydında saklanır; istediğiniz zaman PDF olarak indirebilir veya yazdırabilirsiniz.
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadSummaryOrNotesPdf({
                            includeNotes: Boolean(tender.notes),
                          })
                        }
                        disabled={exportingPdf}
                        className="min-h-[38px] px-3.5 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
                      >
                        {exportingPdf ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FBBF24]" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5 text-[#FBBF24]" />
                        )}
                        <span>{exportingPdf ? 'PDF Hazırlanıyor…' : 'PDF Olarak İndir'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handlePrintSummaryOrNotes({
                            includeNotes: Boolean(tender.notes),
                          })
                        }
                        disabled={printingDoc}
                        className="min-h-[38px] px-3.5 inline-flex items-center gap-1.5 bg-white hover:bg-[#F3F6FA] text-[#0B2239] border border-[#DCE3EC] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5 text-[#0066B3]" />
                        <span>Yazdır</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {analysisMode === 'products' && productAnalysisResult && (
                <div className="border border-[#DCE3EC] rounded-xl divide-y divide-[#DCE3EC] bg-white">
                  {/* Üst Araç Çubuğu: Veritabanı İnceleme & PDF İndirme */}
                  <div className="p-4 bg-[#F3F6FA]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-xs font-bold text-[#0B2239] flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5">
                          <Database className="w-4 h-4 text-[#0066B3] shrink-0" />
                          <span>Ürün Analizi &amp; Veritabanı Fiyat Taraması</span>
                        </span>
                        {activeProductSavedNote && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#007A53]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{activeProductSavedNote}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#4E5D6C] tabular-nums">
                        {effectiveDbProducts.length} kayıtlı ürün kartı taranıyor ·{' '}
                        {
                          productAnalysisResult.items.filter(
                            (it) =>
                              lookupItemDatabasePrices(it, effectiveDbProducts).lastFivePrices
                                .length > 0
                          ).length
                        }
                        /{productAnalysisResult.items.length} kalemde geçmiş fiyat eşleşmesi bulundu
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleInspectDatabasePrices}
                        disabled={inspectingDb}
                        className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-white hover:bg-[#F3F6FA] text-[#0B2239] border border-[#DCE3EC] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
                      >
                        {inspectingDb ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0066B3]" />
                        ) : (
                          <Database className="w-3.5 h-3.5 text-[#0066B3]" />
                        )}
                        <span>
                          {inspectingDb
                            ? 'Veritabanı Taranıyor…'
                            : 'Veritabanında İncele (Son 5 Fiyat)'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadProductAnalysisPdf()}
                        disabled={exportingPdf}
                        className="min-h-[38px] px-3.5 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
                      >
                        {exportingPdf ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FBBF24]" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5 text-[#FBBF24]" />
                        )}
                        <span>{exportingPdf ? 'PDF Hazırlanıyor…' : 'PDF Olarak İndir'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePrintProductAnalysis()}
                        disabled={printingDoc}
                        className="min-h-[38px] px-3.5 inline-flex items-center gap-1.5 bg-white hover:bg-[#F3F6FA] text-[#0B2239] border border-[#DCE3EC] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5 text-[#0066B3]" />
                        <span>Yazdır</span>
                      </button>
                    </div>
                  </div>

                  {(dbInspectError || pdfError) && (
                    <div
                      role="alert"
                      className="px-4 py-2.5 bg-red-50 text-xs text-red-700 font-medium"
                    >
                      {dbInspectError || pdfError}
                    </div>
                  )}

                  <div className="p-4 space-y-1.5">
                    <div className="text-xs font-semibold text-[#4E5D6C]">
                      Teknik Alım Kapsamı Değerlendirmesi
                    </div>
                    <p className="text-sm text-[#0B2239] leading-relaxed whitespace-pre-wrap">
                      {productAnalysisResult.overview}
                    </p>
                  </div>

                  <div className="divide-y divide-[#DCE3EC]">
                    {productAnalysisResult.items.length === 0 ? (
                      <div className="p-4 text-xs text-[#4E5D6C]">
                        Metin içinde alıma çıkılan belirgin bir ürün kalemi tespit edilemedi.
                      </div>
                    ) : (
                      productAnalysisResult.items.map((item, idx) => {
                        const itemDbLookup = lookupItemDatabasePrices(
                          item,
                          effectiveDbProducts
                        );
                        return (
                          <div key={`${item.itemNo}-${idx}`} className="p-4 space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <span className="inline-block text-[11px] font-mono font-bold text-[#0066B3] uppercase tracking-wide">
                                  {item.itemNo || `Kalem ${idx + 1}`}
                                </span>
                                <h4 className="font-display text-sm font-bold text-[#0B2239] mt-0.5">
                                  {item.productName}
                                </h4>
                              </div>
                              {item.quantityAndUnit && (
                                <span className="text-xs font-mono font-semibold text-[#0B2239] tabular-nums">
                                  {item.quantityAndUnit}
                                </span>
                              )}
                            </div>

                            {item.requiredSpecs.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[11px] font-semibold text-[#4E5D6C]">
                                  Şartnamedeki Kritik Teknik Özellikler
                                </div>
                                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                  {item.requiredSpecs.map((spec, sIdx) => (
                                    <li
                                      key={sIdx}
                                      className="text-xs text-[#0B2239] flex items-start gap-1.5"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5 text-[#007A53] shrink-0 mt-0.5" />
                                      <span>{spec}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {item.complianceRisks && (
                              <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-900">
                                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-semibold">Teknik Risk / Dikkat: </span>
                                  <span>{item.complianceRisks}</span>
                                </div>
                              </div>
                            )}

                            {/* Brand & Model Suggestions */}
                            <div className="space-y-2.5">
                              <div className="text-[11px] font-semibold text-[#4E5D6C] flex items-center gap-1.5">
                                <Award className="w-3.5 h-3.5 text-[#0066B3]" />
                                <span>
                                  Önerilen Marka ve Modeller ({item.recommendations.length})
                                </span>
                              </div>

                              <div className="divide-y divide-[#DCE3EC] border border-[#DCE3EC] rounded-lg bg-[#F3F6FA]/40">
                                {item.recommendations.map((rec, rIdx) => {
                                  const recDbLookup = lookupRecommendationPrices(
                                    rec,
                                    item,
                                    effectiveDbProducts
                                  );
                                  return (
                                    <div
                                      key={`${rec.brand}-${rec.model}-${rIdx}`}
                                      className="p-3.5 space-y-2"
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                          <div className="text-sm font-bold text-[#0B2239]">
                                            {rec.brand}{' '}
                                            <span className="text-[#0066B3]">{rec.model}</span>
                                          </div>
                                          <div className="text-[11px] text-[#4E5D6C] mt-0.5 flex flex-wrap items-center gap-x-2">
                                            {rec.partNumberHint && (
                                              <span className="font-mono">
                                                Katalog / Seri: {rec.partNumberHint}
                                              </span>
                                            )}
                                            {rec.partNumberHint && (rec.segment || rec.compatibilityLevel) && (
                                              <span aria-hidden="true">·</span>
                                            )}
                                            {rec.segment && <span>{rec.segment}</span>}
                                            {rec.segment && rec.compatibilityLevel && (
                                              <span aria-hidden="true">·</span>
                                            )}
                                            {rec.compatibilityLevel && (
                                              <span className="font-semibold text-[#007A53]">
                                                {rec.compatibilityLevel}
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {permissions.canManageProducts && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onNewBidProduct(tender.id, {
                                                materialName: `${rec.brand} ${rec.model} — ${item.productName}`,
                                                partNumber: rec.partNumberHint || rec.model,
                                                supplierCompany:
                                                  recDbLookup.lastFivePrices[0]?.product
                                                    .supplierCompany || '',
                                              })
                                            }
                                            className="min-h-[34px] px-3 inline-flex items-center gap-1.5 bg-white hover:bg-[#0066B3] hover:text-white text-[#0066B3] border border-[#0066B3]/40 text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                                          >
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>Teklif Ürün Kartına Aktar</span>
                                          </button>
                                        )}
                                      </div>

                                      <p className="text-xs text-[#0B2239] leading-relaxed">
                                        {rec.rationale}
                                      </p>

                                      {rec.verificationChecklist && (
                                        <div className="text-[11px] text-[#4E5D6C]">
                                          <span className="font-semibold text-[#0B2239]">
                                            Datasheet Teyidi:{' '}
                                          </span>
                                          {rec.verificationChecklist}
                                        </div>
                                      )}

                                      {/* Önerilen Marka/Model İçin Doğrudan Veritabanı Son 5 Fiyat */}
                                      {recDbLookup.lastFivePrices.length > 0 && (
                                        <div className="pt-2 border-t border-[#DCE3EC] space-y-1.5">
                                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                            <span className="font-semibold text-[#0066B3] flex items-center gap-1">
                                              <Database className="w-3 h-3" />
                                              <span>
                                                Bu Marka/Model İçin Alınan Son{' '}
                                                {recDbLookup.lastFivePrices.length} Fiyat
                                              </span>
                                            </span>
                                            <span className="text-[#4E5D6C] font-mono tabular-nums">
                                              {recDbLookup.totalMatches} eşleşen kayıt
                                            </span>
                                          </div>
                                          <div className="divide-y divide-[#DCE3EC] bg-white border border-[#DCE3EC] rounded-md">
                                            {recDbLookup.lastFivePrices.map((m) => (
                                              <div
                                                key={m.product.id}
                                                onClick={() => onViewBidProduct && onViewBidProduct(m.product)}
                                                className={`px-2.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs ${
                                                  onViewBidProduct
                                                    ? 'hover:bg-[#F3F6FA]/70 cursor-pointer transition-colors'
                                                    : ''
                                                }`}
                                              >
                                                <div className="min-w-0 flex-1">
                                                  <div className="font-medium text-[#0B2239] truncate">
                                                    {m.product.supplierCompany}
                                                  </div>
                                                  <div className="text-[11px] text-[#4E5D6C] flex flex-wrap items-center gap-x-1.5 truncate">
                                                    <span>{m.matchLabel}</span>
                                                    <span aria-hidden="true">·</span>
                                                    <span className="truncate">
                                                      {m.product.materialName}
                                                    </span>
                                                    {m.product.partNumber && (
                                                      <>
                                                        <span aria-hidden="true">·</span>
                                                        <span className="font-mono">
                                                          {m.product.partNumber}
                                                        </span>
                                                      </>
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                  <div className="font-mono font-bold text-[#0066B3] tabular-nums">
                                                    {formatCurrency(
                                                      m.product.offeredSalePrice,
                                                      m.product.currency
                                                    )}
                                                  </div>
                                                  <div className="text-[11px] font-mono text-[#4E5D6C] tabular-nums">
                                                    {m.effectiveDate
                                                      ? formatTurkishDate(m.effectiveDate)
                                                      : 'Tarihsiz'}
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Kalem Bazlı Veritabanı Fiyat Geçmişi (Son 5 Alınan Fiyat) */}
                            <div className="pt-2 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-xs font-bold text-[#0B2239] flex items-center gap-1.5">
                                  <Database className="w-3.5 h-3.5 text-[#0066B3]" />
                                  <span>
                                    Veritabanı Geçmişi — Alınan Son{' '}
                                    {itemDbLookup.lastFivePrices.length > 0
                                      ? itemDbLookup.lastFivePrices.length
                                      : 5}{' '}
                                    Fiyat
                                  </span>
                                </div>
                                {itemDbLookup.currencySummaries.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#4E5D6C] font-mono tabular-nums">
                                    {itemDbLookup.currencySummaries.map((cs) => (
                                      <span key={cs.currency}>
                                        Son: {formatCurrency(cs.latest, cs.currency)} · Min:{' '}
                                        {formatCurrency(cs.min, cs.currency)} ({cs.count} kayıt)
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {itemDbLookup.lastFivePrices.length === 0 ? (
                                <div className="p-3 border border-dashed border-[#DCE3EC] rounded-lg text-xs text-[#4E5D6C]">
                                  Veritabanında bu ürün kalemi veya önerilen marka/modeller için kayıtlı geçmiş fiyat bulunamadı.
                                </div>
                              ) : (
                                <div className="overflow-x-auto border border-[#DCE3EC] rounded-lg">
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="bg-[#F3F6FA] border-b border-[#DCE3EC] text-[11px] font-semibold text-[#4E5D6C]">
                                        <th className="py-2 px-3">Malzeme / Parça No</th>
                                        <th className="py-2 px-3">Fiyat Alınan Firma</th>
                                        <th className="py-2 px-3">Fiyat / Alım Tarihi</th>
                                        <th className="py-2 px-3 text-right">Fiyat</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#DCE3EC]">
                                      {itemDbLookup.lastFivePrices.map((m) => (
                                        <tr
                                          key={m.product.id}
                                          onClick={() => onViewBidProduct && onViewBidProduct(m.product)}
                                          className={`hover:bg-[#F3F6FA]/50 transition-colors ${
                                            onViewBidProduct ? 'cursor-pointer' : ''
                                          }`}
                                        >
                                          <td className="py-2 px-3 align-top">
                                            <div className="font-medium text-[#0B2239]">
                                              {m.product.materialName}
                                            </div>
                                            <div className="text-[11px] text-[#4E5D6C] flex flex-wrap items-center gap-x-1.5 mt-0.5">
                                              <span className="font-semibold text-[#007A53]">
                                                {m.matchLabel}
                                              </span>
                                              {m.product.partNumber && (
                                                <>
                                                  <span aria-hidden="true">·</span>
                                                  <span className="font-mono">
                                                    Parça: {m.product.partNumber}
                                                  </span>
                                                </>
                                              )}
                                              {m.product.tenderTrackingCode && (
                                                <>
                                                  <span aria-hidden="true">·</span>
                                                  <span className="font-mono text-[#0066B3]">
                                                    {m.product.tenderTrackingCode}
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                          </td>
                                          <td className="py-2 px-3 align-top text-[#0B2239]">
                                            {m.product.supplierCompany}
                                          </td>
                                          <td className="py-2 px-3 align-top font-mono tabular-nums text-[11px] text-[#4E5D6C] whitespace-nowrap">
                                            <div>
                                              Fiyat:{' '}
                                              {m.product.priceDate
                                                ? formatTurkishDate(m.product.priceDate)
                                                : '—'}
                                            </div>
                                            {m.product.purchaseDate && (
                                              <div>
                                                Alım: {formatTurkishDate(m.product.purchaseDate)}
                                              </div>
                                            )}
                                          </td>
                                          <td className="py-2 px-3 align-top text-right font-mono font-bold text-[#0066B3] tabular-nums whitespace-nowrap">
                                            {formatCurrency(
                                              m.product.offeredSalePrice,
                                              m.product.currency
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {productAnalysisResult.generalRecommendations.length > 0 && (
                    <div className="p-4 space-y-2 bg-[#F3F6FA]/50">
                      <div className="text-xs font-semibold text-[#4E5D6C]">
                        Teklif &amp; Muadil Sunum Tavsiyeleri
                      </div>
                      <ul className="space-y-1.5">
                        {productAnalysisResult.generalRecommendations.map((tip, tIdx) => (
                          <li key={tIdx} className="text-xs text-[#0B2239] flex items-start gap-2">
                            <span className="text-[#0066B3] font-bold">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="p-3.5 bg-[#F3F6FA]/40 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-[#4E5D6C]">
                      Analiz sonucu bu ihale kaydında saklanır; istediğiniz zaman PDF olarak indirebilir veya yazdırabilirsiniz.
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownloadProductAnalysisPdf()}
                        disabled={exportingPdf}
                        className="min-h-[38px] px-3.5 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
                      >
                        {exportingPdf ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FBBF24]" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5 text-[#FBBF24]" />
                        )}
                        <span>{exportingPdf ? 'PDF Hazırlanıyor…' : 'PDF Olarak İndir'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintProductAnalysis()}
                        disabled={printingDoc}
                        className="min-h-[38px] px-3.5 inline-flex items-center gap-1.5 bg-white hover:bg-[#F3F6FA] text-[#0B2239] border border-[#DCE3EC] text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5 text-[#0066B3]" />
                        <span>Yazdır</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Teklif Verilen Ürün Kartları */}
          <div className="pt-6 border-t border-[#DCE3EC] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-[#0B2239] flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#0066B3] shrink-0" />
                  <span>Teklif Verilen Ürünler ({tenderBidProducts.length})</span>
                </h3>
                <p className="text-xs text-[#4E5D6C] mt-0.5">
                  Bu ihalede teklif verilen malzemelere ait stok, parça, firma ve tarih kartları.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {tenderBidProducts.length > 0 && (
                  <div
                    className="flex items-center gap-1 p-1 bg-[#F3F6FA] rounded-lg"
                    role="group"
                    aria-label="Ürün Görünüm Seçeneği"
                  >
                    <button
                      type="button"
                      onClick={() => setProductViewMode('cards')}
                      aria-pressed={productViewMode === 'cards'}
                      className={`min-h-[34px] px-2.5 inline-flex items-center gap-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        productViewMode === 'cards'
                          ? 'bg-white text-[#0B2239] shadow-xs'
                          : 'text-[#4E5D6C] hover:text-[#0B2239]'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Kartlar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductViewMode('list')}
                      aria-pressed={productViewMode === 'list'}
                      className={`min-h-[34px] px-2.5 inline-flex items-center gap-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        productViewMode === 'list'
                          ? 'bg-white text-[#0B2239] shadow-xs'
                          : 'text-[#4E5D6C] hover:text-[#0B2239]'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>Liste</span>
                    </button>
                  </div>
                )}
                {onOpenPricing && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPricing(tender.id);
                    }}
                    className="min-h-[44px] px-3.5 inline-flex items-center gap-1.5 bg-white border border-[#0066B3] hover:bg-[#0066B3]/5 text-[#0066B3] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                  >
                    <Percent className="w-4 h-4" />
                    <span>Fiyat Çalışma</span>
                  </button>
                )}
                {permissions.canManageProducts && (
                  <button
                    type="button"
                    onClick={() => onNewBidProduct(tender.id)}
                    className="min-h-[44px] px-3.5 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Ürün Kartı Ekle</span>
                  </button>
                )}
              </div>
            </div>

            {tenderBidProducts.length === 0 ? (
              <div className="p-5 border border-dashed border-[#DCE3EC] rounded-lg text-center text-xs text-[#4E5D6C]">
                Bu ihaleye bağlı teklif verilen ürün kartı bulunmuyor.
              </div>
            ) : productViewMode === 'list' ? (
              <BidProductsTable
                products={tenderBidProducts}
                currentUid={uid}
                canManage={permissions.canManageProducts}
                canManageAccounting={canManageAccounting}
                showTenderColumn={false}
                onView={onViewBidProduct}
                onEdit={onEditBidProduct}
                onDelete={onDeleteBidProduct}
                onDuplicateForNewCompany={onDuplicateBidProductForNewCompany}
                onCreateAccountingEntry={onCreateAccountingFromProduct}
              />
            ) : (
              <div className="space-y-4">
                {tenderBidProducts.map((product) => (
                  <BidProductCard
                    key={product.id}
                    product={product}
                    currentUid={uid}
                    canManage={permissions.canManageProducts}
                    canManageAccounting={canManageAccounting}
                    onView={onViewBidProduct}
                    onEdit={onEditBidProduct}
                    onDelete={onDeleteBidProduct}
                    onDuplicateForNewCompany={onDuplicateBidProductForNewCompany}
                    onCreateAccountingEntry={onCreateAccountingFromProduct}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Delete Tender */}
          {permissions.canDeleteTender && (
            <div className="pt-4 border-t border-[#DCE3EC] space-y-2.5">
              {deleteError && (
                <div
                  role="alert"
                  className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium"
                >
                  {deleteError}
                </div>
              )}

              {!canDeleteOwnTender ? (
                <div className="p-3 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg flex items-center gap-2 text-xs text-[#4E5D6C]">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>
                    Bu ihale kaydı başka bir kullanıcı ({tender.createdByName || tender.createdByEmail || 'ekip üyesi'}) tarafından oluşturulduğu için yalnızca oluşturan kullanıcı silebilir.
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setConfirmDelete(true);
                      }}
                      className="min-h-[44px] px-3 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                    >
                      Bu İhale Kaydını Geri Dönüşüm Kutusuna Taşı
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs text-red-700 font-medium">
                        Tüm dokümanlarla birlikte geri dönüşüm kutusuna taşınsın mı?
                      </span>
                      <button
                        type="button"
                        disabled={deletingTender}
                        onClick={async () => {
                          setDeletingTender(true);
                          setDeleteError(null);
                          try {
                            await onDelete(tender);
                            onClose();
                          } catch (err) {
                            setDeleteError(
                              err instanceof Error ? err.message : 'İhale kaydı silinemedi.'
                            );
                          } finally {
                            setDeletingTender(false);
                          }
                        }}
                        className="min-h-[40px] px-3 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60"
                      >
                        {deletingTender ? 'Taşınıyor…' : 'Evet, Sil'}
                      </button>
                      <button
                        type="button"
                        disabled={deletingTender}
                        onClick={() => setConfirmDelete(false)}
                        className="min-h-[40px] px-3 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs rounded-lg cursor-pointer"
                      >
                        Vazgeç
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
