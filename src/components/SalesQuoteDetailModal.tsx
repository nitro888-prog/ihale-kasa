import React, { useEffect, useState } from 'react';
import {
  X,
  Maximize2,
  Minimize2,
  ExternalLink,
  FileText,
  FileDown,
  Edit3,
  Briefcase,
  CheckCircle2,
  Building2,
  Calendar,
  Landmark,
  Trash2,
  Lock,
  ArrowRight,
} from 'lucide-react';
import {
  CompanyProfile,
  isOwnRecord,
  SALES_QUOTE_DOC_TYPE_LABELS,
  SALES_QUOTE_STATUS_LABELS,
  SalesQuote,
  SalesQuoteDocType,
  SalesQuoteStatus,
} from '../types/tender';
import { formatCurrency, formatTurkishDate } from '../lib/trackingAndCalendar';
import { downloadSalesQuotePdf } from '../lib/salesQuotePdf';

interface SalesQuoteDetailModalProps {
  quote: SalesQuote | null;
  companyProfile: CompanyProfile | null;
  currentUid: string;
  canManageQuotes: boolean;
  canViewProjects: boolean;
  disableEscClose?: boolean;
  onClose: () => void;
  onEdit: (quote: SalesQuote) => void;
  onUpdateStatus: (quote: SalesQuote, nextStatus: SalesQuoteStatus) => Promise<void>;
  onDelete: (quote: SalesQuote) => Promise<void>;
  onConvertToProject: (quote: SalesQuote) => void;
  onOpenLinkedProject: (projectId: string) => void;
}

function getStatusTextClass(status: SalesQuoteStatus): string {
  switch (status) {
    case 'siparis_onaylandi':
      return 'bg-[#007A53]/15 text-[#007A53] border-[#007A53]/35';
    case 'gonderildi':
      return 'bg-[#0066B3]/10 text-[#0066B3] border-[#0066B3]/30';
    case 'revize':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'iptal':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-[#F3F6FA] text-[#4E5D6C] border-[#DCE3EC]';
  }
}

export const SalesQuoteDetailModal: React.FC<SalesQuoteDetailModalProps> = ({
  quote,
  companyProfile,
  currentUid,
  canManageQuotes,
  canViewProjects,
  disableEscClose = false,
  onClose,
  onEdit,
  onUpdateStatus,
  onDelete,
  onConvertToProject,
  onOpenLinkedProject,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [pdfBusyMode, setPdfBusyMode] = useState<SalesQuoteDocType | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!quote || disableEscClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quote, disableEscClose, onClose]);

  useEffect(() => {
    setConfirmDelete(false);
    setErrorMsg(null);
  }, [quote?.id]);

  if (!quote) return null;

  const canDeleteOwn = canManageQuotes && isOwnRecord(quote, currentUid);

  const handleDownloadPdf = async (mode: SalesQuoteDocType) => {
    setPdfBusyMode(mode);
    setErrorMsg(null);
    try {
      await downloadSalesQuotePdf({
        quote,
        companyProfile,
        mode,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF dosyası oluşturulamadı.');
    } finally {
      setPdfBusyMode(null);
    }
  };

  const handleStatusChange = async (nextStatus: SalesQuoteStatus) => {
    if (!canManageQuotes || nextStatus === quote.status) return;
    setStatusBusy(true);
    setErrorMsg(null);
    try {
      await onUpdateStatus(quote, nextStatus);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Durum güncellenemedi.');
    } finally {
      setStatusBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-[#0B2239]/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Teklif ve Proforma Detay Penceresi"
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
        {/* Corporate Navy Header */}
        <div className="px-5 py-4 bg-[#0B2239] text-white border-b-2 border-[#0066B3] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5 font-mono font-bold text-[#7DD3FC] tabular-nums">
                <FileText className="w-3.5 h-3.5" />
                <span>{quote.quoteNumber}</span>
              </span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span className="font-semibold text-white">
                {SALES_QUOTE_DOC_TYPE_LABELS[quote.docType]}
              </span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span className="font-mono font-semibold text-[#FBBF24]">
                {quote.currency}
              </span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span>{SALES_QUOTE_STATUS_LABELS[quote.status]}</span>
            </div>
            <h2 className="font-display text-lg font-bold text-white mt-1 leading-snug">
              {quote.title}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5 truncate">
              Müşteri: {quote.customerName}
              {quote.linkedProjectCode ? ` · Proje: ${quote.linkedProjectCode}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <a
              href={`?detail=quote&id=${encodeURIComponent(quote.id)}`}
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
        <div className="px-5 py-3 bg-[#F3F6FA] border-b border-[#DCE3EC] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pdfBusyMode !== null}
              onClick={() => handleDownloadPdf('teklif')}
              className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-[#0B2239] hover:bg-[#143252] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              <FileDown className="w-3.5 h-3.5 text-[#7DD3FC]" />
              <span>
                {pdfBusyMode === 'teklif' ? 'Hazırlanıyor…' : 'Teklif Mektubu PDF'}
              </span>
            </button>

            <button
              type="button"
              disabled={pdfBusyMode !== null}
              onClick={() => handleDownloadPdf('proforma')}
              className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>
                {pdfBusyMode === 'proforma' ? 'Hazırlanıyor…' : 'Proforma Fatura PDF'}
              </span>
            </button>

            {quote.linkedProjectId ? (
              canViewProjects ? (
                <button
                  type="button"
                  onClick={() => onOpenLinkedProject(quote.linkedProjectId)}
                  className="min-h-[38px] px-3.5 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#006344] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Bağlı Projeyi Aç ({quote.linkedProjectCode || 'Proje'})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <span className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#007A53]/40 text-[#007A53] text-xs font-semibold rounded-lg whitespace-nowrap">
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Proje Başlatıldı: {quote.linkedProjectCode}</span>
                </span>
              )
            ) : canViewProjects && quote.status !== 'iptal' ? (
              <button
                type="button"
                onClick={() => onConvertToProject(quote)}
                className="min-h-[38px] px-3.5 inline-flex items-center gap-1.5 bg-[#007A53] hover:bg-[#006344] text-white text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {quote.status === 'siparis_onaylandi'
                    ? 'Onaylı Siparişten Proje Başlat'
                    : 'Siparişe Çevir & Proje Başlat'}
                </span>
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManageQuotes && (
              <>
                <select
                  value={quote.status}
                  disabled={statusBusy}
                  onChange={(e) => handleStatusChange(e.target.value as SalesQuoteStatus)}
                  aria-label="Belge Durumunu Değiştir"
                  className="min-h-[38px] px-2.5 py-1 bg-white border border-[#DCE3EC] rounded-lg text-xs font-semibold text-[#0B2239]"
                >
                  {(Object.keys(SALES_QUOTE_STATUS_LABELS) as SalesQuoteStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {SALES_QUOTE_STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onEdit(quote)}
                  className="min-h-[38px] px-3 inline-flex items-center gap-1.5 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Düzenle</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium"
            >
              {errorMsg}
            </div>
          )}

          {/* Customer & Document Info Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 p-4 bg-[#F3F6FA]/60 border border-[#DCE3EC] rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0B2239]">
                <Building2 className="w-4 h-4 text-[#0066B3]" />
                <span>Müşteri Firma Bilgileri</span>
              </div>
              <div className="text-sm font-bold text-[#0B2239]">{quote.customerName}</div>
              <div className="text-xs text-[#4E5D6C] space-y-1">
                {(quote.customerTaxOffice || quote.customerTaxNumber) && (
                  <div>
                    Vergi Dairesi / VKN:{' '}
                    <span className="font-mono text-[#0B2239]">
                      {[quote.customerTaxOffice, quote.customerTaxNumber]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                )}
                {(quote.customerContactPerson || quote.customerPhone || quote.customerEmail) && (
                  <div>
                    {[
                      quote.customerContactPerson ? `Yetkili: ${quote.customerContactPerson}` : '',
                      quote.customerPhone,
                      quote.customerEmail,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
                {quote.customerAddress && <div>Adres: {quote.customerAddress}</div>}
              </div>
            </div>

            <div className="lg:col-span-5 p-4 bg-white border border-[#DCE3EC] rounded-xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B2239]">
                  <Calendar className="w-4 h-4 text-[#0066B3]" />
                  <span>Belge Özeti</span>
                </span>
                <span
                  className={`px-2 py-0.5 text-[11px] font-semibold border rounded-md ${getStatusTextClass(
                    quote.status
                  )}`}
                >
                  {SALES_QUOTE_STATUS_LABELS[quote.status]}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-y-1.5 text-xs pt-1">
                <dt className="text-[#4E5D6C]">Düzenleme Tarihi</dt>
                <dd className="text-right font-mono text-[#0B2239] tabular-nums">
                  {formatTurkishDate(quote.issueDate)}
                </dd>
                <dt className="text-[#4E5D6C]">Geçerlilik Tarihi</dt>
                <dd className="text-right font-mono text-[#0B2239] tabular-nums">
                  {quote.validUntilDate ? formatTurkishDate(quote.validUntilDate) : 'Belirtilmedi'}
                </dd>
                <dt className="text-[#4E5D6C]">Para Birimi</dt>
                <dd className="text-right font-mono font-bold text-[#0B2239]">
                  {quote.currency}
                </dd>
                {quote.orderConfirmedDate && (
                  <>
                    <dt className="text-[#4E5D6C]">Sipariş Onay Tarihi</dt>
                    <dd className="text-right font-mono font-semibold text-[#007A53] tabular-nums">
                      {formatTurkishDate(quote.orderConfirmedDate)}
                    </dd>
                  </>
                )}
                {quote.linkedProjectCode && (
                  <>
                    <dt className="text-[#4E5D6C]">Bağlı Proje</dt>
                    <dd className="text-right font-mono font-bold text-[#0066B3]">
                      {quote.linkedProjectCode}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-[#DCE3EC] rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-[#F3F6FA] border-b border-[#DCE3EC] flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#0B2239]">
                Teklif / Proforma Kalemleri ({quote.items.length} Kalem)
              </h3>
              <span className="text-[11px] font-mono text-[#4E5D6C]">
                Para Birimi: {quote.currency}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#0B2239] text-[11px] font-semibold text-slate-200">
                    <th className="py-2.5 px-3 w-10">#</th>
                    <th className="py-2.5 px-3">Malzeme / Hizmet &amp; Kodlar</th>
                    <th className="py-2.5 px-3 text-right">Miktar</th>
                    <th className="py-2.5 px-3 text-right">Birim Fiyat</th>
                    <th className="py-2.5 px-3 text-right">İsk. %</th>
                    <th className="py-2.5 px-3 text-right">KDV %</th>
                    <th className="py-2.5 px-3 text-right">KDV Hariç Tutar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE3EC] text-xs">
                  {quote.items.map((item, index) => (
                    <tr key={item.id || index} className="hover:bg-[#F3F6FA]/50">
                      <td className="py-3 px-3 align-top font-mono text-[#4E5D6C] tabular-nums">
                        {index + 1}
                      </td>
                      <td className="py-3 px-3 align-top">
                        <div className="font-semibold text-[#0B2239]">{item.materialName}</div>
                        {(item.stockNumber || item.partNumber || item.supplierCompany) && (
                          <div className="text-[11px] text-[#4E5D6C] font-mono mt-0.5">
                            {[
                              item.stockNumber ? `Stok: ${item.stockNumber}` : '',
                              item.partNumber ? `Parça: ${item.partNumber}` : '',
                              item.supplierCompany ? `Kaynak: ${item.supplierCompany}` : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}
                        {item.description && (
                          <div className="text-[11px] text-[#4E5D6C] mt-0.5">
                            {item.description}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top text-right font-mono text-[#0B2239] tabular-nums whitespace-nowrap">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="py-3 px-3 align-top text-right font-mono text-[#0B2239] tabular-nums whitespace-nowrap">
                        <div>{formatCurrency(item.unitPrice, quote.currency)}</div>
                        {item.productId && item.sourceCurrency !== quote.currency && (
                          <div className="text-[10px] text-[#0066B3]">
                            Kat: {formatCurrency(item.sourceUnitPrice, item.sourceCurrency)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top text-right font-mono text-[#4E5D6C] tabular-nums">
                        {item.discountRate > 0 ? `%${item.discountRate}` : '—'}
                      </td>
                      <td className="py-3 px-3 align-top text-right font-mono text-[#4E5D6C] tabular-nums">
                        %{item.vatRate}
                      </td>
                      <td className="py-3 px-3 align-top text-right font-mono font-bold text-[#0B2239] tabular-nums whitespace-nowrap">
                        <div>{formatCurrency(item.subtotal, quote.currency)}</div>
                        <div className="text-[10px] font-normal text-[#4E5D6C]">
                          KDV: {formatCurrency(item.vatAmount, quote.currency)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="px-4 py-4 bg-[#F3F6FA] border-t border-[#DCE3EC] flex justify-end">
              <dl className="w-full max-w-xs space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-[#4E5D6C]">Ara Toplam (KDV Hariç)</dt>
                  <dd className="font-mono font-semibold text-[#0B2239] tabular-nums">
                    {formatCurrency(quote.subtotalAmount, quote.currency)}
                  </dd>
                </div>
                {quote.discountTotal > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-[#4E5D6C]">Toplam İskonto</dt>
                    <dd className="font-mono font-semibold text-red-700 tabular-nums">
                      -{formatCurrency(quote.discountTotal, quote.currency)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-[#4E5D6C]">Toplam KDV</dt>
                  <dd className="font-mono font-semibold text-[#0B2239] tabular-nums">
                    {formatCurrency(quote.vatTotal, quote.currency)}
                  </dd>
                </div>
                <div className="pt-2 border-t border-[#DCE3EC] flex justify-between text-sm">
                  <dt className="font-bold text-[#0B2239]">Genel Toplam</dt>
                  <dd className="font-mono font-bold text-[#007A53] tabular-nums">
                    {formatCurrency(quote.grandTotal, quote.currency)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Commercial Terms & Bank Details */}
          <div className="p-4 border border-[#DCE3EC] rounded-xl bg-white space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0B2239]">
              <Landmark className="w-4 h-4 text-[#0066B3]" />
              <span>Ticari Şartlar &amp; Banka Bilgileri</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="font-semibold text-[#4E5D6C]">Teslimat: </span>
                <span className="text-[#0B2239]">{quote.deliveryTerms || 'Belirtilmedi'}</span>
              </div>
              <div>
                <span className="font-semibold text-[#4E5D6C]">Ödeme: </span>
                <span className="text-[#0B2239]">{quote.paymentTerms || 'Belirtilmedi'}</span>
              </div>
              <div>
                <span className="font-semibold text-[#4E5D6C]">Garanti: </span>
                <span className="text-[#0B2239]">{quote.warrantyTerms || 'Belirtilmedi'}</span>
              </div>
              {quote.exchangeNote && (
                <div>
                  <span className="font-semibold text-[#4E5D6C]">Kur Notu: </span>
                  <span className="text-[#0B2239]">{quote.exchangeNote}</span>
                </div>
              )}
              {quote.bankInfo && (
                <div className="sm:col-span-2">
                  <span className="font-semibold text-[#4E5D6C]">Banka / IBAN: </span>
                  <span className="font-mono text-[#0B2239]">{quote.bankInfo}</span>
                </div>
              )}
              {quote.notes && (
                <div className="sm:col-span-2 pt-1 border-t border-[#DCE3EC]/70">
                  <span className="font-semibold text-[#4E5D6C]">Özel Notlar: </span>
                  <span className="text-[#0B2239] whitespace-pre-wrap">{quote.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Delete Section */}
          <div className="pt-3 border-t border-[#DCE3EC] flex items-center justify-between gap-3">
            {canDeleteOwn ? (
              !confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[40px] px-3 inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Geri Dönüşüm Kutusuna Taşı</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xs font-medium text-red-700">
                    {quote.quoteNumber} numaralı belge geri dönüşüm kutusuna taşınsın mı?
                  </span>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true);
                      setErrorMsg(null);
                      try {
                        await onDelete(quote);
                        onClose();
                      } catch (err) {
                        setErrorMsg(
                          err instanceof Error ? err.message : 'Belge silinemedi.'
                        );
                      } finally {
                        setDeleting(false);
                      }
                    }}
                    className="min-h-[38px] px-3 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60"
                  >
                    {deleting ? 'Taşınıyor…' : 'Evet, Sil'}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[38px] px-3 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs rounded-lg cursor-pointer"
                  >
                    Vazgeç
                  </button>
                </div>
              )
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-[#4E5D6C]">
                <Lock className="w-3.5 h-3.5" />
                <span>Silme yetkisi yalnızca kaydı oluşturan kullanıcıya aittir.</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
