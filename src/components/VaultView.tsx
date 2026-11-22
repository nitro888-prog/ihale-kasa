import React, { useEffect, useRef, useState } from 'react';
import { Eye, Lock, ShieldCheck, Trash2, Upload, FolderOpen } from 'lucide-react';
import {
  ActorIdentity,
  COMPANY_VAULT_CATEGORY_LABELS,
  CompanyVaultCategory,
  CompanyVaultDocument,
  isOwnRecord,
  TENDER_DOC_CATEGORY_LABELS,
  Tender,
  TenderDocCategory,
  TenderDocument,
} from '../types/tender';
import { formatBytes, formatTurkishDate, getDaysDifference } from '../lib/trackingAndCalendar';
import {
  deleteCompanyVaultDocument,
  deleteTenderDocument,
  downloadCompanyVaultBlob,
  downloadTenderDocumentBlob,
  subscribeTenderDocuments,
  uploadCompanyVaultDocument,
  uploadTenderDocument,
} from '../services/firestoreService';
import { PreviewTarget } from './DocumentPreviewModal';

interface VaultViewProps {
  uid: string;
  workspaceOwnerId: string;
  actor: ActorIdentity;
  memberIds?: string[];
  tenders: Tender[];
  companyVault: CompanyVaultDocument[];
  canManageVault?: boolean;
  onPreview: (target: PreviewTarget) => void;
}

type VaultTab = 'company' | 'tenders';

export const VaultView: React.FC<VaultViewProps> = ({
  uid,
  workspaceOwnerId,
  actor,
  memberIds,
  tenders,
  companyVault,
  canManageVault = true,
  onPreview,
}) => {
  const [activeTab, setActiveTab] = useState<VaultTab>('company');

  // Company Vault Upload State
  const [cvCategory, setCvCategory] = useState<CompanyVaultCategory>('imza_sirkuleri');
  const [cvExpiry, setCvExpiry] = useState('');
  const [cvUploading, setCvUploading] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);

  // Tender Docs Archive State
  const [selectedTenderId, setSelectedTenderId] = useState<string>(tenders[0]?.id || '');
  const [tenderDocs, setTenderDocs] = useState<TenderDocument[]>([]);
  const [tdCategory, setTdCategory] = useState<TenderDocCategory>('idari_sartname');
  const [tdUploading, setTdUploading] = useState(false);
  const [tdError, setTdError] = useState<string | null>(null);
  const tdInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedTenderId && tenders[0]) {
      setSelectedTenderId(tenders[0].id);
    }
  }, [selectedTenderId, tenders]);

  useEffect(() => {
    if (!selectedTenderId) {
      setTenderDocs([]);
      return;
    }
    const unsub = subscribeTenderDocuments(
      uid,
      workspaceOwnerId,
      selectedTenderId,
      setTenderDocs
    );
    return () => unsub();
  }, [uid, workspaceOwnerId, selectedTenderId]);

  const selectedTender = tenders.find((t) => t.id === selectedTenderId) || null;

  const handleUploadCompanyDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canManageVault) return;
    setCvUploading(true);
    setCvError(null);
    try {
      await uploadCompanyVaultDocument(
        workspaceOwnerId,
        file,
        cvCategory,
        cvExpiry,
        memberIds,
        actor
      );
      setCvExpiry('');
      if (cvInputRef.current) cvInputRef.current.value = '';
    } catch (err) {
      setCvError(err instanceof Error ? err.message : 'Dosya yüklenemedi.');
    } finally {
      setCvUploading(false);
    }
  };

  const handleUploadTenderDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTenderId || !canManageVault) return;
    setTdUploading(true);
    setTdError(null);
    try {
      await uploadTenderDocument(
        workspaceOwnerId,
        selectedTenderId,
        file,
        tdCategory,
        '',
        memberIds,
        actor
      );
      if (tdInputRef.current) tdInputRef.current.value = '';
    } catch (err) {
      setTdError(err instanceof Error ? err.message : 'Dosya yüklenemedi.');
    } finally {
      setTdUploading(false);
    }
  };

  const handleDeleteCompanyDoc = async (cv: CompanyVaultDocument) => {
    setCvError(null);
    try {
      await deleteCompanyVaultDocument(uid, workspaceOwnerId, cv, {
        actor,
        memberIds,
      });
    } catch (err) {
      setCvError(err instanceof Error ? err.message : 'Evrak silinemedi.');
    }
  };

  const handleDeleteTenderDoc = async (d: TenderDocument) => {
    setTdError(null);
    try {
      await deleteTenderDocument(uid, workspaceOwnerId, selectedTenderId, d, {
        actor,
        parentTenderCode: selectedTender?.trackingCode || '',
        memberIds,
      });
    } catch (err) {
      setTdError(err instanceof Error ? err.message : 'Doküman silinemedi.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Segmented Tabs */}
      <div className="bg-white border border-[#DCE3EC] rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-[#0066B3] shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-base font-bold text-[#0B2239]">
              Güvenli Doküman Kasası
            </h2>
            <p className="text-xs text-[#4E5D6C] mt-0.5">
              Tüm belgeler yalnızca firmanıza özel Firestore kurallarıyla korunur ve SHA-256 ile bütünlük kontrolü yapılır.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#F3F6FA] rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('company')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'company'
                ? 'bg-white text-[#0B2239] shadow-xs'
                : 'text-[#4E5D6C] hover:text-[#0B2239]'
            }`}
          >
            Firma Sabit Evrakları ({companyVault.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tenders')}
            className={`min-h-[38px] px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'tenders'
                ? 'bg-white text-[#0B2239] shadow-xs'
                : 'text-[#4E5D6C] hover:text-[#0B2239]'
            }`}
          >
            İhale Dosyası Dokümanları
          </button>
        </div>
      </div>

      {activeTab === 'company' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Upload Panel */}
          {canManageVault && (
            <section className="lg:col-span-4 bg-white border border-[#DCE3EC] rounded-xl p-5 space-y-4">
              <div>
                <h3 className="font-display text-sm font-bold text-[#0B2239]">
                  Yeni Kurumsal Evrak Ekle
                </h3>
                <p className="text-xs text-[#4E5D6C] mt-1 leading-relaxed">
                  İmza sirküleri, vergi levhası, oda kaydı ve borcu yoktur yazılarınızı buraya ekleyin; tüm ihalelerin İhale Günü ekranında otomatik hazır bulunsun.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#0B2239] mb-1">
                    Belge Türü
                  </label>
                  <select
                    value={cvCategory}
                    onChange={(e) => setCvCategory(e.target.value as CompanyVaultCategory)}
                    className="w-full min-h-[44px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                  >
                    {(Object.keys(COMPANY_VAULT_CATEGORY_LABELS) as CompanyVaultCategory[]).map(
                      (k) => (
                        <option key={k} value={k}>
                          {COMPANY_VAULT_CATEGORY_LABELS[k]}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B2239] mb-1">
                    Geçerlilik Bitiş Tarihi (İsteğe Bağlı)
                  </label>
                  <input
                    type="date"
                    value={cvExpiry}
                    onChange={(e) => setCvExpiry(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                  />
                </div>

                <input
                  ref={cvInputRef}
                  type="file"
                  id="cv-upload-input"
                  onChange={handleUploadCompanyDoc}
                  disabled={cvUploading}
                  className="hidden"
                />
                <label
                  htmlFor="cv-upload-input"
                  className={`w-full min-h-[44px] px-4 py-2.5 inline-flex items-center justify-center gap-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-sm font-semibold rounded-lg cursor-pointer transition-colors ${
                    cvUploading ? 'opacity-60 pointer-events-none' : ''
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  <span>{cvUploading ? 'Kasaya Şifreleniyor…' : 'Belge Seç ve Yükle'}</span>
                </label>

                {cvError && <p className="text-xs text-red-700 font-medium">{cvError}</p>}
                <p className="text-[11px] text-[#4E5D6C]">
                  Maksimum dosya boyutu: 10 MB (PDF, PNG, JPG, DOCX, XLSX, TXT)
                </p>
              </div>
            </section>
          )}

          {/* List Panel */}
          <section
            className={`${
              canManageVault ? 'lg:col-span-8' : 'lg:col-span-12'
            } bg-white border border-[#DCE3EC] rounded-xl overflow-hidden`}
          >
            <div className="px-5 py-4 border-b border-[#DCE3EC] flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-[#0B2239]">
                Kayıtlı Sabit Firma Evrakları ({companyVault.length})
              </h3>
            </div>

            {companyVault.length === 0 ? (
              <div className="p-10 text-center text-xs text-[#4E5D6C]">
                Henüz sabit firma evrakı yüklenmedi. Sol panelden imza sirküleri veya vergi levhanızı ekleyebilirsiniz.
              </div>
            ) : (
              <div className="divide-y divide-[#DCE3EC]">
                {companyVault.map((cv) => {
                  const diff = cv.expiryDate ? getDaysDifference(cv.expiryDate) : null;
                  const canDeleteOwn = canManageVault && isOwnRecord(cv, uid);
                  return (
                    <div
                      key={cv.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#0B2239] truncate">
                          {cv.name}
                        </div>
                        <div className="text-xs text-[#4E5D6C] mt-0.5 flex flex-wrap items-center gap-x-2">
                          <span>{COMPANY_VAULT_CATEGORY_LABELS[cv.category]}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{formatBytes(cv.sizeBytes)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-[#007A53] font-mono text-[11px]">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {cv.sha256.slice(0, 8)}
                          </span>
                          {cv.expiryDate && diff !== null && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span
                                className={`font-mono tabular-nums font-medium ${
                                  diff < 0
                                    ? 'text-red-700'
                                    : diff <= 30
                                    ? 'text-amber-700'
                                    : 'text-[#4E5D6C]'
                                }`}
                              >
                                Son: {formatTurkishDate(cv.expiryDate)}
                              </span>
                            </>
                          )}
                          {cv.createdByName && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Ekleyen: {cv.createdByName}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onPreview({
                              name: cv.name,
                              mimeType: cv.mimeType,
                              sizeBytes: cv.sizeBytes,
                              sha256: cv.sha256,
                              categoryLabel: COMPANY_VAULT_CATEGORY_LABELS[cv.category],
                              loadBlob: () => downloadCompanyVaultBlob(uid, workspaceOwnerId, cv),
                            })
                          }
                          className="min-h-[44px] px-3 inline-flex items-center gap-1.5 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          <span>Aç / İndir</span>
                        </button>
                        {canDeleteOwn ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteCompanyDoc(cv)}
                            aria-label="Evrakı Sil"
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-red-50 hover:text-red-700 text-[#4E5D6C] rounded-lg cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          canManageVault && (
                            <span
                              title="Yalnızca bu evrakı ekleyen kullanıcı silebilir"
                              className="inline-flex items-center gap-1 text-[11px] text-[#4E5D6C] px-2"
                            >
                              <Lock className="w-3 h-3" />
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-[#DCE3EC] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <FolderOpen className="w-5 h-5 text-[#0066B3] shrink-0" />
              <select
                value={selectedTenderId}
                onChange={(e) => setSelectedTenderId(e.target.value)}
                disabled={tenders.length === 0}
                className="w-full sm:w-96 min-h-[44px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-sm font-medium text-[#0B2239] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {tenders.length === 0 ? (
                  <option value="">Henüz ihale kaydı yok</option>
                ) : (
                  tenders.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.trackingCode} — {t.title}
                    </option>
                  ))
                )}
              </select>
            </div>

            {selectedTenderId && canManageVault && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={tdCategory}
                  onChange={(e) => setTdCategory(e.target.value as TenderDocCategory)}
                  className="min-h-[44px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-xs text-[#0B2239] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                >
                  {(Object.keys(TENDER_DOC_CATEGORY_LABELS) as TenderDocCategory[]).map(
                    (k) => (
                      <option key={k} value={k}>
                        {TENDER_DOC_CATEGORY_LABELS[k]}
                      </option>
                    )
                  )}
                </select>
                <input
                  ref={tdInputRef}
                  type="file"
                  id="td-vault-upload"
                  onChange={handleUploadTenderDoc}
                  disabled={tdUploading}
                  className="hidden"
                />
                <label
                  htmlFor="td-vault-upload"
                  className={`min-h-[44px] px-4 inline-flex items-center gap-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                    tdUploading ? 'opacity-60 pointer-events-none' : ''
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  <span>{tdUploading ? 'Yükleniyor…' : 'Bu İhaleye Ekle'}</span>
                </label>
              </div>
            )}
          </div>

          {tdError && (
            <div className="px-5 py-2 bg-red-50 text-xs text-red-700 font-medium">
              {tdError}
            </div>
          )}

          {tenderDocs.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#4E5D6C]">
              Seçili ihale dosyasına ait kayıtlı doküman bulunmuyor.
            </div>
          ) : (
            <div className="divide-y divide-[#DCE3EC]">
              {tenderDocs.map((d) => {
                const canDeleteOwnDoc = canManageVault && isOwnRecord(d, uid);
                return (
                  <div
                    key={d.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#0B2239] truncate">{d.name}</div>
                      <div className="text-xs text-[#4E5D6C] mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span>{TENDER_DOC_CATEGORY_LABELS[d.category]}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{formatBytes(d.sizeBytes)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[11px] text-[#007A53]">
                          SHA-256: {d.sha256.slice(0, 10)}
                        </span>
                        {d.createdByName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Ekleyen: {d.createdByName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onPreview({
                            name: d.name,
                            mimeType: d.mimeType,
                            sizeBytes: d.sizeBytes,
                            sha256: d.sha256,
                            categoryLabel: TENDER_DOC_CATEGORY_LABELS[d.category],
                            loadBlob: () =>
                              downloadTenderDocumentBlob(
                                uid,
                                workspaceOwnerId,
                                selectedTenderId,
                                d
                              ),
                          })
                        }
                        className="min-h-[44px] px-3 inline-flex items-center gap-1.5 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        <span>Aç / İndir</span>
                      </button>
                      {canDeleteOwnDoc ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteTenderDoc(d)}
                          aria-label="Dokümanı Sil"
                          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center border border-[#DCE3EC] hover:bg-red-50 hover:text-red-700 text-[#4E5D6C] rounded-lg cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        canManageVault && (
                          <span
                            title="Yalnızca bu dokümanı yükleyen kullanıcı silebilir"
                            className="inline-flex items-center gap-1 text-[11px] text-[#4E5D6C] px-2"
                          >
                            <Lock className="w-3 h-3" />
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
      )}
    </div>
  );
};
