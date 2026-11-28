export type TenderStatus =
  | 'hazirlik'
  | 'onay_bekliyor'
  | 'teslim_edildi'
  | 'kazanildi'
  | 'sonuclandi'
  | 'iptal';

export type ProcurementType =
  | 'acik_ihale'
  | 'belli_istekliler'
  | 'pazarlik'
  | 'dogrudan_temin';

export type CurrencyCode = 'TRY' | 'USD' | 'EUR';

export type TenderDocCategory =
  | 'idari_sartname'
  | 'teknik_sartname'
  | 'teklif_mektubu'
  | 'gecici_teminat'
  | 'birim_fiyat'
  | 'yetki_belgesi'
  | 'zeyilname'
  | 'diger';

export type CompanyVaultCategory =
  | 'imza_sirkuleri'
  | 'vergi_levhasi'
  | 'ticaret_sicil'
  | 'oda_kayit'
  | 'borcu_yoktur'
  | 'is_bitirme'
  | 'teminat_mektubu'
  | 'diger';

export interface TenderChecklist {
  idariSartname: boolean;
  teknikSartname: boolean;
  teklifMektubu: boolean;
  geciciTeminat: boolean;
  imzaSirkuleri: boolean;
  birimFiyat: boolean;
}

export interface ActorIdentity {
  uid: string;
  email: string;
  displayName: string;
}

export function isOwnRecord(
  record: { createdBy?: string; ownerId: string },
  currentUid: string
): boolean {
  if (!currentUid) return false;
  if (record.createdBy && record.createdBy.trim() !== '') {
    return record.createdBy === currentUid;
  }
  return record.ownerId === currentUid;
}

export interface Tender {
  id: string;
  ownerId: string;
  trackingCode: string;
  ikn: string;
  title: string;
  authority: string;
  tenderDate: string; // YYYY-MM-DD
  tenderTime: string; // HH:mm
  location: string;
  procurementType: ProcurementType;
  estimatedAmount: number;
  bidBondAmount: number;
  currency: CurrencyCode;
  status: TenderStatus;
  notes: string;
  checklist: TenderChecklist;
  memberIds?: string[];
  createdBy?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
  updatedAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
}

export interface TenderDocument {
  id: string;
  ownerId: string;
  tenderId: string;
  name: string;
  category: TenderDocCategory;
  mimeType: string;
  sizeBytes: number;
  chunkCount: number;
  sha256: string;
  verified: boolean;
  notes: string;
  memberIds?: string[];
  createdBy?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type TenderAnalysisMode = 'summary' | 'products';

export interface SavedTenderAnalysis {
  id: string;
  ownerId: string;
  tenderId: string;
  mode: TenderAnalysisMode;
  result: Record<string, unknown>;
  preferenceNote?: string;
  memberIds?: string[];
  createdBy?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
  updatedAt?: {
    seconds?: number;
    nanoseconds?: number;
  };
}

export interface CompanyVaultDocument {
  id: string;
  ownerId: string;
  name: string;
  category: CompanyVaultCategory;
  mimeType: string;
  sizeBytes: number;
  chunkCount: number;
  sha256: string;
  expiryDate: string; // YYYY-MM-DD or ""
  memberIds?: string[];
  createdBy?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CompanyProfile {
  ownerId: string;
  companyName: string;
  taxOffice: string;
  taxNumber: string;
  authorizedPerson: string;
  phone: string;
  email: string;
  defaultReminderDays: number;
  memberIds?: string[];
  updatedAt?: unknown;
}

export interface BidProduct {
  id: string;
  ownerId: string;
  tenderId: string;
  tenderTrackingCode: string;
  stockNumber: string;
  partNumber: string;
  materialName: string;
  supplierCompany: string;
  priceDate: string; // YYYY-MM-DD or ""
  offeredSalePrice: number;
  currency: CurrencyCode;
  purchaseDate: string; // YYYY-MM-DD or ""
  quotedDate: string; // YYYY-MM-DD or ""
  memberIds?: string[];
  createdBy?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type VatFinancingBasis = 'maliyet' | 'kdv_tutari';

export interface TenderPricingItem {
  id: string;
  productId: string;
  stockNumber: string;
  partNumber: string;
  materialName: string;
  supplierCompany: string;
  quantity: number;
  unit: string;
  unitCost: number;
  profitRate: number;
  deliveryDays: number;
  financingRate: number;
  taxRate: number;
  shippingAmount: number;
  vatRate: number;
  vatFinancing180Enabled: boolean;
  vatFinancingRate: number;
  notes: string;
  costTotal: number;
  profitAmount: number;
  financingAmount: number;
  taxAmount: number;
  vatFinancingAmount: number;
  netOfferTotal: number;
  netOfferUnitPrice: number;
  vatAmount: number;
  grossOfferTotal: number;
}

export interface TenderPricingSheet {
  id: string;
  ownerId: string;
  tenderId: string;
  tenderTrackingCode: string;
  tenderTitle: string;
  currency: CurrencyCode;
  annualFinancingRate: number;
  defaultDeliveryDays: number;
  vatFinancingBasis: VatFinancingBasis;
  notes: string;
  items: TenderPricingItem[];
  totalCost: number;
  totalProfit: number;
  totalDeliveryFinancing: number;
  totalTaxes: number;
  totalShipping: number;
  totalVatFinancing: number;
  totalBidNet: number;
  totalVat: number;
  totalBidGross: number;
  memberIds?: string[];
  createdBy?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type RecycleBinEntityType =
  | 'tender'
  | 'tender_document'
  | 'company_vault'
  | 'bid_product'
  | 'accounting_company'
  | 'accounting_entry'
  | 'accounting_cheque'
  | 'project'
  | 'project_transaction'
  | 'sales_quote';

export type AccountingCompanyType = 'tedarikci' | 'musteri' | 'her_ikisi';

export interface AccountingCompany {
  id: string;
  ownerId: string;
  name: string;
  companyType: AccountingCompanyType;
  taxOffice: string;
  taxNumber: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  iban: string;
  notes: string;
  memberIds?: string[];
  createdBy?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AccountingEntryType =
  | 'alis_faturasi'
  | 'satis_faturasi'
  | 'tahsilat'
  | 'odeme'
  | 'gider';

export type AccountingPaymentMethod =
  | 'nakit'
  | 'banka_havale'
  | 'kredi_karti'
  | 'cek_senet'
  | 'vadeli';

export type AccountingPaymentStatus =
  | 'bekliyor'
  | 'odendi'
  | 'kismi'
  | 'iptal';

export interface AccountingEntry {
  id: string;
  ownerId: string;
  entryType: AccountingEntryType;
  companyId: string;
  companyName: string;
  invoiceNo: string;
  title: string;
  stockNumber: string;
  partNumber: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  subtotalAmount: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  currency: CurrencyCode;
  entryDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD or ""
  paymentMethod: AccountingPaymentMethod;
  paymentStatus: AccountingPaymentStatus;
  tenderId: string;
  tenderTrackingCode: string;
  notes: string;
  memberIds?: string[];
  createdBy?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const ACCOUNTING_COMPANY_TYPE_LABELS: Record<AccountingCompanyType, string> = {
  tedarikci: 'Tedarikçi Firma',
  musteri: 'Müşteri / Kurum',
  her_ikisi: 'Tedarikçi & Müşteri',
};

export const ACCOUNTING_ENTRY_TYPE_LABELS: Record<AccountingEntryType, string> = {
  alis_faturasi: 'Alış Faturası / Tedarik',
  satis_faturasi: 'Satış / Hakediş Faturası',
  tahsilat: 'Tahsilat (Gelen Ödeme)',
  odeme: 'Ödeme (Tedarikçiye Çıkan)',
  gider: 'Genel Gider / Masraf',
};

export const ACCOUNTING_PAYMENT_METHOD_LABELS: Record<AccountingPaymentMethod, string> = {
  banka_havale: 'Banka Havale / EFT',
  nakit: 'Nakit / Kasa',
  kredi_karti: 'Kredi Kartı',
  cek_senet: 'Çek / Senet',
  vadeli: 'Açık Hesap / Vadeli',
};

export const ACCOUNTING_PAYMENT_STATUS_LABELS: Record<AccountingPaymentStatus, string> = {
  bekliyor: 'Ödeme Bekliyor',
  kismi: 'Kısmi Ödendi',
  odendi: 'Ödendi / Kapandı',
  iptal: 'İptal Edildi',
};

export type AccountingChequeDirection = 'alinan' | 'verilen';

export type AccountingChequeStatus =
  | 'portfoyde'
  | 'tahsile_verildi'
  | 'ciro_edildi'
  | 'tahsil_edildi'
  | 'odendi'
  | 'karsiliksiz'
  | 'iade';

export interface AccountingCheque {
  id: string;
  ownerId: string;
  direction: AccountingChequeDirection;
  chequeNo: string;
  bankName: string;
  branchName: string;
  drawerName: string;
  companyId: string;
  companyName: string;
  endorsedTo: string;
  issueDate: string; // YYYY-MM-DD or ""
  dueDate: string; // YYYY-MM-DD
  amount: number;
  currency: CurrencyCode;
  status: AccountingChequeStatus;
  tenderId: string;
  tenderTrackingCode: string;
  notes: string;
  memberIds?: string[];
  createdBy?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const ACCOUNTING_CHEQUE_DIRECTION_LABELS: Record<AccountingChequeDirection, string> = {
  alinan: 'Alınan Çek (Müşteri / Kurum)',
  verilen: 'Verilen Çek (Firma Çekimiz)',
};

export const ACCOUNTING_CHEQUE_STATUS_LABELS: Record<AccountingChequeStatus, string> = {
  portfoyde: 'Portföyde / Bekliyor',
  tahsile_verildi: 'Bankaya Tahsile Verildi',
  ciro_edildi: 'Ciro Edildi',
  tahsil_edildi: 'Tahsil Edildi',
  odendi: 'Ödendi / Karşılandı',
  karsiliksiz: 'Karşılıksız / Protestolu',
  iade: 'İade Edildi',
};

export type ProjectStatus =
  | 'planlama'
  | 'aktif'
  | 'askida'
  | 'tamamlandi'
  | 'iptal';

export type SalesQuoteDocType = 'teklif' | 'proforma';

export type SalesQuoteStatus =
  | 'taslak'
  | 'gonderildi'
  | 'revize'
  | 'siparis_onaylandi'
  | 'iptal';

export interface SalesQuoteItem {
  id: string;
  productId: string;
  stockNumber: string;
  partNumber: string;
  materialName: string;
  supplierCompany: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountRate: number;
  vatRate: number;
  subtotal: number;
  vatAmount: number;
  total: number;
  sourceCurrency: CurrencyCode;
  sourceUnitPrice: number;
}

export interface SalesQuote {
  id: string;
  ownerId: string;
  quoteNumber: string;
  docType: SalesQuoteDocType;
  status: SalesQuoteStatus;
  customerId: string;
  customerName: string;
  customerTaxOffice: string;
  customerTaxNumber: string;
  customerContactPerson: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  title: string;
  issueDate: string; // YYYY-MM-DD
  validUntilDate: string; // YYYY-MM-DD or ""
  currency: CurrencyCode;
  exchangeNote: string;
  deliveryTerms: string;
  paymentTerms: string;
  warrantyTerms: string;
  bankInfo: string;
  notes: string;
  items: SalesQuoteItem[];
  subtotalAmount: number;
  discountTotal: number;
  vatTotal: number;
  grandTotal: number;
  linkedProjectId: string;
  linkedProjectCode: string;
  orderConfirmedDate: string; // YYYY-MM-DD or ""
  memberIds?: string[];
  createdBy?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const SALES_QUOTE_DOC_TYPE_LABELS: Record<SalesQuoteDocType, string> = {
  teklif: 'Teklif Mektubu',
  proforma: 'Proforma Fatura',
};

export const SALES_QUOTE_STATUS_LABELS: Record<SalesQuoteStatus, string> = {
  taslak: 'Taslak',
  gonderildi: 'Müşteriye Gönderildi',
  revize: 'Revize Edildi',
  siparis_onaylandi: 'Siparişe Döndü (Onaylı)',
  iptal: 'İptal / Reddedildi',
};

export interface Project {
  id: string;
  ownerId: string;
  projectCode: string;
  tenderId: string;
  tenderTrackingCode: string;
  quoteId?: string;
  quoteNumber?: string;
  title: string;
  authority: string;
  contractAmount: number;
  currency: CurrencyCode;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD or ""
  status: ProjectStatus;
  managerUid: string;
  managerEmail: string;
  managerName: string;
  managerUids?: string[];
  managers?: ProjectManagerEntry[];
  notes: string;
  memberIds?: string[];
  createdBy?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProjectManagerEntry {
  uid: string;
  email: string;
  displayName: string;
}

export type ProjectTransactionType =
  | 'kesilen_fatura'
  | 'diger_gelir'
  | 'gelen_fatura'
  | 'gider';

export interface ProjectTransaction {
  id: string;
  ownerId: string;
  projectId: string;
  projectCode: string;
  projectTitle: string;
  tenderId: string;
  tenderTrackingCode: string;
  txType: ProjectTransactionType;
  category: string;
  companyId: string;
  companyName: string;
  invoiceNo: string;
  title: string;
  vatRate: number;
  subtotalAmount: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  currency: CurrencyCode;
  txDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD or ""
  paymentMethod: AccountingPaymentMethod;
  paymentStatus: AccountingPaymentStatus;
  notes: string;
  memberIds?: string[];
  createdBy?: string;
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planlama: 'Planlama / Hazırlık',
  aktif: 'Devam Ediyor (Aktif)',
  askida: 'Beklemede / Askıda',
  tamamlandi: 'Tamamlandı / Teslim',
  iptal: 'İptal Edildi',
};

export const PROJECT_TX_TYPE_LABELS: Record<ProjectTransactionType, string> = {
  kesilen_fatura: 'Kesilen Fatura / Hakediş (Gelir)',
  diger_gelir: 'Diğer Proje Geliri / Avans',
  gelen_fatura: 'Gelen Fatura / Tedarik (Maliyet)',
  gider: 'Yapılan Gider / Masraf (Maliyet)',
};

export const PROJECT_TX_CATEGORIES: string[] = [
  'Hakediş / Kurum Ödemesi',
  'Malzeme & Ürün Alımı',
  'Taşeron / Alt Yüklenici',
  'İşçilik & Personel',
  'Nakliye & Lojistik',
  'Şantiye & Saha Gideri',
  'Teminat / Vergi / Harç',
  'Danışmanlık & Hizmet',
  'Diğer Gelir / Gider',
];

export function isProjectIncomeTx(txType: ProjectTransactionType): boolean {
  return txType === 'kesilen_fatura' || txType === 'diger_gelir';
}

export function getProjectManagers(
  project:
    | {
        managerUid?: string;
        managerEmail?: string;
        managerName?: string;
        managerUids?: string[];
        managers?: ProjectManagerEntry[];
      }
    | null
    | undefined
): ProjectManagerEntry[] {
  if (!project) return [];
  if (Array.isArray(project.managers) && project.managers.length > 0) {
    const seen = new Set<string>();
    const list: ProjectManagerEntry[] = [];
    for (const m of project.managers) {
      if (m && m.uid && !seen.has(m.uid)) {
        seen.add(m.uid);
        list.push({
          uid: m.uid,
          email: m.email || '',
          displayName: m.displayName || m.email || 'Proje Yöneticisi',
        });
      }
    }
    if (list.length > 0) return list;
  }
  if (Array.isArray(project.managerUids) && project.managerUids.length > 0) {
    const seen = new Set<string>();
    const list: ProjectManagerEntry[] = [];
    project.managerUids.forEach((uid, idx) => {
      if (uid && !seen.has(uid)) {
        seen.add(uid);
        list.push({
          uid,
          email: idx === 0 ? project.managerEmail || '' : '',
          displayName:
            idx === 0
              ? project.managerName || 'Proje Yöneticisi'
              : 'Proje Yöneticisi',
        });
      }
    });
    if (list.length > 0) return list;
  }
  if (project.managerUid) {
    return [
      {
        uid: project.managerUid,
        email: project.managerEmail || '',
        displayName: project.managerName || 'Proje Yöneticisi',
      },
    ];
  }
  return [];
}

export function formatProjectManagerNames(
  project:
    | {
        managerUid?: string;
        managerEmail?: string;
        managerName?: string;
        managerUids?: string[];
        managers?: ProjectManagerEntry[];
      }
    | null
    | undefined
): string {
  const list = getProjectManagers(project);
  if (list.length === 0) return project?.managerName || 'Proje Yöneticisi';
  return list.map((m) => m.displayName).join(', ');
}

export function isProjectManager(
  project:
    | {
        managerUid?: string;
        managerUids?: string[];
        managers?: ProjectManagerEntry[];
      }
    | null
    | undefined,
  currentUid: string
): boolean {
  if (!project || !currentUid) return false;
  if (project.managerUid && project.managerUid === currentUid) return true;
  if (Array.isArray(project.managerUids) && project.managerUids.includes(currentUid)) {
    return true;
  }
  if (
    Array.isArray(project.managers) &&
    project.managers.some((m) => m && m.uid === currentUid)
  ) {
    return true;
  }
  return false;
}

export interface RecycleBinItem {
  id: string;
  ownerId: string;
  entityType: RecycleBinEntityType;
  originalId: string;
  parentTenderId: string;
  parentTenderCode: string;
  title: string;
  subtitle: string;
  createdBy: string;
  createdByEmail: string;
  createdByName: string;
  deletedBy: string;
  deletedByEmail: string;
  deletedByName: string;
  deletedAt?: unknown;
  payload: Record<string, unknown>;
  chunkCount: number;
  memberIds?: string[];
}

export const RECYCLE_BIN_ENTITY_LABELS: Record<RecycleBinEntityType, string> = {
  tender: 'İhale Kaydı',
  tender_document: 'İhale Dokümanı',
  company_vault: 'Sabit Firma Evrakı',
  bid_product: 'Teklif Ürün Kartı',
  accounting_company: 'Cari Firma Kaydı',
  accounting_entry: 'Ön Muhasebe Kaydı',
  accounting_cheque: 'Çek Kaydı',
  project: 'Proje Kaydı',
  project_transaction: 'Proje Fatura / Gideri',
  sales_quote: 'Teklif / Proforma Kaydı',
};

export type UserRole =
  | 'admin'
  | 'ihale_sorumlusu'
  | 'onay_yetkilisi'
  | 'goruntuleyici';

export type UserAuthStatus = 'pending' | 'active' | 'suspended';

export interface UserPermissions {
  canCreateTender: boolean;
  canEditTender: boolean;
  canDeleteTender: boolean;
  canManageVault: boolean;
  canManageProducts: boolean;
  canAnalyzeDocuments: boolean;
  canManageSettings: boolean;
  canManageAccounting?: boolean;
  canViewProjects?: boolean;
  canManageQuotes?: boolean;
  canManagePricing?: boolean;
}

export function hasAccountingAccess(
  permissions?: UserPermissions,
  role?: UserRole
): boolean {
  if (role === 'admin') return true;
  if (!permissions) return false;
  if (typeof permissions.canManageAccounting === 'boolean') {
    return permissions.canManageAccounting;
  }
  return Boolean(permissions.canManageProducts || permissions.canManageSettings);
}

export function hasQuotesAccess(
  permissions?: UserPermissions,
  role?: UserRole
): boolean {
  if (role === 'admin') return true;
  if (!permissions) return false;
  if (typeof permissions.canManageQuotes === 'boolean') {
    return permissions.canManageQuotes;
  }
  return Boolean(permissions.canManageProducts || permissions.canManageAccounting);
}

export function hasProjectsAccess(
  permissions?: UserPermissions,
  role?: UserRole
): boolean {
  if (role === 'admin') return true;
  if (!permissions) return false;
  return Boolean(permissions.canViewProjects);
}

export function hasPricingAccess(
  permissions?: UserPermissions,
  role?: UserRole
): boolean {
  if (role === 'admin') return true;
  if (!permissions) return false;
  return Boolean(permissions.canManagePricing);
}

export interface UserAuthorization {
  uid: string;
  email: string;
  displayName: string;
  department: string;
  role: UserRole;
  status: UserAuthStatus;
  workspaceOwnerId: string;
  inviteId: string;
  permissions: UserPermissions;
  approvedBy: string;
  managerUids?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserInvite {
  id: string;
  email: string;
  displayName: string;
  department: string;
  role: UserRole;
  workspaceOwnerId: string;
  permissions: UserPermissions;
  invitedBy: string;
  status: 'pending_claim' | 'claimed';
  claimedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ActiveView =
  | 'home'
  | 'overview'
  | 'calendar'
  | 'tender-day'
  | 'tenders'
  | 'pricing'
  | 'quotes'
  | 'projects'
  | 'products'
  | 'accounting'
  | 'vault'
  | 'trash'
  | 'settings'
  | 'users';

export const DEFAULT_CHECKLIST: TenderChecklist = {
  idariSartname: false,
  teknikSartname: false,
  teklifMektubu: false,
  geciciTeminat: false,
  imzaSirkuleri: false,
  birimFiyat: false,
};

export const CHECKLIST_ITEMS: { key: keyof TenderChecklist; label: string; hint: string }[] = [
  { key: 'idariSartname', label: 'İdari Şartname İncelendi', hint: 'Katılım koşulları ve yeterlik kriterleri onaylandı' },
  { key: 'teknikSartname', label: 'Teknik Şartname Uyumluluğu', hint: 'Teknik gereksinimler ve zeyilnameler kontrol edildi' },
  { key: 'birimFiyat', label: 'Birim Fiyat / Maliyet Cetveli', hint: 'Teklif hesaplaması ve aşırı düşük sınırı doğrulandı' },
  { key: 'geciciTeminat', label: 'Geçici Teminat Mektubu / Nakit', hint: 'En az %3 teminat bedeli ve vade tarihi hazırlandı' },
  { key: 'imzaSirkuleri', label: 'Yetki & İmza Sirküleri', hint: 'Güncel noter onaylı imza sirküleri / vekaletname eklendi' },
  { key: 'teklifMektubu', label: 'Teklif Mektubu & E-İmza', hint: 'EKAP veya zarf teslimi için son onay verildi' },
];

export const STATUS_LABELS: Record<TenderStatus, string> = {
  hazirlik: 'Hazırlık',
  onay_bekliyor: 'Onay Bekliyor',
  teslim_edildi: 'Teslim Edildi',
  kazanildi: 'Kazanıldı',
  sonuclandi: 'Sonuçlandı',
  iptal: 'İptal',
};

export const PROCUREMENT_LABELS: Record<ProcurementType, string> = {
  acik_ihale: 'Açık İhale',
  belli_istekliler: 'Belli İstekliler Arasında',
  pazarlik: 'Pazarlık Usulü',
  dogrudan_temin: 'Doğrudan Temin',
};

export const TENDER_DOC_CATEGORY_LABELS: Record<TenderDocCategory, string> = {
  idari_sartname: 'İdari Şartname',
  teknik_sartname: 'Teknik Şartname',
  teklif_mektubu: 'Teklif Mektubu',
  gecici_teminat: 'Geçici Teminat',
  birim_fiyat: 'Birim Fiyat Cetveli',
  yetki_belgesi: 'Yetki / İmza Belgesi',
  zeyilname: 'Zeyilname',
  diger: 'Diğer Doküman',
};

export const COMPANY_VAULT_CATEGORY_LABELS: Record<CompanyVaultCategory, string> = {
  imza_sirkuleri: 'İmza Sirküleri',
  vergi_levhasi: 'Vergi Levhası',
  ticaret_sicil: 'Ticaret Sicil Gazetesi',
  oda_kayit: 'Oda Kayıt / Faaliyet Belgesi',
  borcu_yoktur: 'Vergi / SGK Borcu Yoktur',
  is_bitirme: 'İş Bitirme Belgesi',
  teminat_mektubu: 'Banka Referans / Limit Yazısı',
  diger: 'Diğer Kurumsal Evrak',
};

export const SCHEMA_LIMITS = {
  COMPANY_NAME_MAX: 120,
  TAX_OFFICE_MAX: 80,
  TAX_NUMBER_MAX: 20,
  PERSON_MAX: 100,
  PHONE_MAX: 30,
  EMAIL_MAX: 120,
  TRACKING_CODE_MAX: 32,
  IKN_MAX: 40,
  TITLE_MAX: 200,
  AUTHORITY_MAX: 160,
  LOCATION_MAX: 160,
  NOTES_MAX: 2000,
  DOC_NAME_MAX: 200,
  DOC_NOTES_MAX: 500,
  STOCK_NUMBER_MAX: 60,
  PART_NUMBER_MAX: 60,
  MATERIAL_NAME_MAX: 200,
  SUPPLIER_COMPANY_MAX: 160,
  DEPARTMENT_MAX: 80,
  INVOICE_NO_MAX: 60,
  UNIT_MAX: 30,
  IBAN_MAX: 40,
  ADDRESS_MAX: 240,
  ACCOUNTING_TITLE_MAX: 200,
  CHEQUE_NO_MAX: 60,
  BANK_NAME_MAX: 100,
  BRANCH_NAME_MAX: 100,
  PROJECT_CODE_MAX: 32,
  PROJECT_CATEGORY_MAX: 60,
  QUOTE_NUMBER_MAX: 40,
  MAX_FILE_BYTES: 10 * 1024 * 1024, // 10 MB
  CHUNK_CHAR_SIZE: 450000,
} as const;

export const BOOTSTRAP_ADMIN_EMAIL = 'nitro888@gmail.com';

export const ZERO_PERMISSIONS: UserPermissions = {
  canCreateTender: false,
  canEditTender: false,
  canDeleteTender: false,
  canManageVault: false,
  canManageProducts: false,
  canAnalyzeDocuments: false,
  canManageSettings: false,
  canManageAccounting: false,
  canViewProjects: false,
  canManageQuotes: false,
  canManagePricing: false,
};

export const FULL_PERMISSIONS: UserPermissions = {
  canCreateTender: true,
  canEditTender: true,
  canDeleteTender: true,
  canManageVault: true,
  canManageProducts: true,
  canAnalyzeDocuments: true,
  canManageSettings: true,
  canManageAccounting: true,
  canViewProjects: true,
  canManageQuotes: true,
  canManagePricing: true,
};

export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, UserPermissions> = {
  admin: { ...FULL_PERMISSIONS },
  ihale_sorumlusu: {
    canCreateTender: true,
    canEditTender: true,
    canDeleteTender: false,
    canManageVault: true,
    canManageProducts: true,
    canAnalyzeDocuments: true,
    canManageSettings: false,
    canManageAccounting: true,
    canViewProjects: false,
    canManageQuotes: true,
    canManagePricing: false,
  },
  onay_yetkilisi: {
    canCreateTender: false,
    canEditTender: true,
    canDeleteTender: false,
    canManageVault: false,
    canManageProducts: false,
    canAnalyzeDocuments: true,
    canManageSettings: false,
    canManageAccounting: false,
    canViewProjects: false,
    canManageQuotes: false,
    canManagePricing: false,
  },
  goruntuleyici: { ...ZERO_PERMISSIONS },
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Sistem Yöneticisi',
  ihale_sorumlusu: 'İhale Sorumlusu',
  onay_yetkilisi: 'Onay Yetkilisi',
  goruntuleyici: 'Görüntüleyici',
};

export const USER_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Tüm modüllere, kullanıcı yetkilendirmeye ve silme işlemlerine tam yetkili.',
  ihale_sorumlusu: 'İhale açma/düzenleme, doküman kasası, ürün kartları, teklif/proforma, ön muhasebe ve AI analiz yetkisi.',
  onay_yetkilisi: 'Kontrol listesi ve durum onaylama ile şartname analizi yetkisi.',
  goruntuleyici: 'İhale, takvim, doküman, ürün kartları ve ön muhasebeyi yalnızca salt-okunur görüntüler.',
};

export const USER_STATUS_LABELS: Record<UserAuthStatus, string> = {
  active: 'Aktif Yetkili',
  pending: 'Onay Bekliyor',
  suspended: 'Askıya Alındı',
};

export const PERMISSION_LABELS: { key: keyof UserPermissions; label: string; hint: string }[] = [
  { key: 'canCreateTender', label: 'Yeni İhale Açma', hint: 'Yeni ihale kaydı ve örnek veri oluşturabilir' },
  { key: 'canEditTender', label: 'İhale Düzenleme & Onay', hint: 'İhale bilgileri, durum ve kontrol listesini güncelleyebilir' },
  { key: 'canDeleteTender', label: 'İhale Silme', hint: 'İhale kaydını ve bağlı dokümanları silebilir' },
  { key: 'canManagePricing', label: 'İhale Fiyat Çalışması Düzenleme', hint: 'İhale Operasyonu fiyat çalışma ekranında maliyet, kâr, finansman ve teklif kalemlerini düzenleyebilir' },
  { key: 'canManageVault', label: 'Doküman Kasası Yönetimi', hint: 'Evrak yükleme, onaylama ve silme işlemi yapabilir' },
  { key: 'canManageProducts', label: 'Teklif Ürün Kartları', hint: 'Ürün kartı ekleme, güncelleme ve silme yapabilir' },
  { key: 'canManageQuotes', label: 'Özel Sektör Teklif & Proforma', hint: 'Özel sektör teklif mektubu ve proforma fatura oluşturup yönetebilir' },
  { key: 'canManageAccounting', label: 'Ön Muhasebe & Cari Yönetimi', hint: 'Fatura, tahsilat, ödeme ve cari firma kartlarını yönetebilir' },
  { key: 'canViewProjects', label: 'Proje Yönetimi & Maliyet Muhasebesi', hint: 'Admin tarafından yetkilendirildiğinde proje ekranını ve maliyet listesini görebilir' },
  { key: 'canAnalyzeDocuments', label: 'Şartname AI Analizi', hint: 'Dokümanı Analiz Et ve özet çıkarma aracını kullanabilir' },
  { key: 'canManageSettings', label: 'Firma Ayarları', hint: 'Firma kimliği ve varsayılan ihale ayarlarını güncelleyebilir' },
];

