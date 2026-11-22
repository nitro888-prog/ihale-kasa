import React, { useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import {
  CurrencyCode,
  DEFAULT_CHECKLIST,
  PROCUREMENT_LABELS,
  ProcurementType,
  SCHEMA_LIMITS,
  STATUS_LABELS,
  Tender,
  TenderStatus,
} from '../types/tender';
import {
  generateSyncedTrackingCode,
  getTodayDateStr,
} from '../lib/trackingAndCalendar';
import { TenderInput } from '../services/firestoreService';

interface TenderFormModalProps {
  open: boolean;
  onClose: () => void;
  existingTenders: Tender[];
  editingTender?: Tender | null;
  initialDate?: string;
  onSubmit: (data: TenderInput) => Promise<void>;
}

export const TenderFormModal: React.FC<TenderFormModalProps> = ({
  open,
  onClose,
  existingTenders,
  editingTender,
  initialDate,
  onSubmit,
}) => {
  const defaultDate = editingTender?.tenderDate || initialDate || getTodayDateStr();

  const [tenderDate, setTenderDate] = useState(defaultDate);
  const [tenderTime, setTenderTime] = useState(editingTender?.tenderTime || '10:30');
  const [trackingCode, setTrackingCode] = useState(editingTender?.trackingCode || '');
  const [ikn, setIkn] = useState(editingTender?.ikn || '');
  const [title, setTitle] = useState(editingTender?.title || '');
  const [authority, setAuthority] = useState(editingTender?.authority || '');
  const [location, setLocation] = useState(editingTender?.location || '');
  const [procurementType, setProcurementType] = useState<ProcurementType>(
    editingTender?.procurementType || 'acik_ihale'
  );
  const [estimatedAmount, setEstimatedAmount] = useState(
    editingTender ? String(editingTender.estimatedAmount) : ''
  );
  const [bidBondAmount, setBidBondAmount] = useState(
    editingTender ? String(editingTender.bidBondAmount) : ''
  );
  const [currency, setCurrency] = useState<CurrencyCode>(editingTender?.currency || 'TRY');
  const [status, setStatus] = useState<TenderStatus>(editingTender?.status || 'hazirlik');
  const [notes, setNotes] = useState(editingTender?.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const d = editingTender?.tenderDate || initialDate || getTodayDateStr();
    setTenderDate(d);
    setTenderTime(editingTender?.tenderTime || '10:30');
    setTrackingCode(editingTender?.trackingCode || '');
    setIkn(editingTender?.ikn || '');
    setTitle(editingTender?.title || '');
    setAuthority(editingTender?.authority || '');
    setLocation(editingTender?.location || '');
    setProcurementType(editingTender?.procurementType || 'acik_ihale');
    setEstimatedAmount(editingTender ? String(editingTender.estimatedAmount) : '');
    setBidBondAmount(editingTender ? String(editingTender.bidBondAmount) : '');
    setCurrency(editingTender?.currency || 'TRY');
    setStatus(editingTender?.status || 'hazirlik');
    setNotes(editingTender?.notes || '');
    setError(null);
  }, [open, editingTender, initialDate]);

  if (!open) return null;

  const handleDateChange = (newDate: string) => {
    setTenderDate(newDate);
  };

  const handleRegenerateCode = () => {
    setTrackingCode(
      generateSyncedTrackingCode(tenderDate, existingTenders, editingTender?.id)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTrackingCode = trackingCode.trim();
    if (!title.trim() || !authority.trim()) {
      setError('İhale adı ve ihale makamı zorunludur.');
      return;
    }
    if (trimmedTrackingCode.length < 1 || trimmedTrackingCode.length > SCHEMA_LIMITS.TRACKING_CODE_MAX) {
      setError(`Lütfen geçerli bir takip numarası girin (1-${SCHEMA_LIMITS.TRACKING_CODE_MAX} karakter).`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        trackingCode: trackingCode.trim(),
        ikn: ikn.trim(),
        title: title.trim(),
        authority: authority.trim(),
        tenderDate,
        tenderTime: tenderTime || '10:00',
        location: location.trim(),
        procurementType,
        estimatedAmount: Number(estimatedAmount) || 0,
        bidBondAmount: Number(bidBondAmount) || 0,
        currency,
        status,
        notes: notes.trim(),
        checklist: editingTender?.checklist || { ...DEFAULT_CHECKLIST },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kayıt sırasında hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B2239]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editingTender ? 'İhaleyi Düzenle' : 'Yeni İhale Kaydı'}
    >
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] rounded-t-2xl sm:rounded-xl border border-[#DCE3EC] flex flex-col overflow-hidden">
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 bg-[#DCE3EC] rounded-full" />
        </div>

        <div className="px-5 py-4 border-b border-[#DCE3EC] flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-[#0B2239]">
              {editingTender ? 'İhale Kaydını Düzenle' : 'Yeni İhale Kaydı Oluştur'}
            </h2>
            <p className="text-xs text-[#4E5D6C] mt-0.5">
              İhale takip numaranızı kendiniz belirleyin veya isterseniz otomatik öneri alın.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[#4E5D6C] hover:text-[#0B2239] rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
              {error}
            </div>
          )}

          {/* Takvim & Takip Numarası Senkron Bloğu */}
          <div className="p-4 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İhale Tarihi *
              </label>
              <input
                type="date"
                required
                value={tenderDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İhale Saati *
              </label>
              <input
                type="time"
                required
                value={tenderTime}
                onChange={(e) => setTenderTime(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Takip Numarası *
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  required
                  maxLength={SCHEMA_LIMITS.TRACKING_CODE_MAX}
                  placeholder="Örn: 2026-001"
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-xs font-mono font-semibold text-[#0066B3] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                />
                <button
                  type="button"
                  onClick={handleRegenerateCode}
                  title="Tarihe Göre Otomatik Öner"
                  aria-label="Tarihe Göre Otomatik Öner"
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] rounded-lg text-[#4E5D6C] hover:text-[#0B2239] cursor-pointer shrink-0 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İhale Konusu / Adı *
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.TITLE_MAX}
                placeholder="Örn: Merkez Yerleşke Mekanik Tesisat Yenileme İşi"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İhale Makamı / Kurum *
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.AUTHORITY_MAX}
                placeholder="Örn: Ankara Büyükşehir Belediyesi"
                value={authority}
                onChange={(e) => setAuthority(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Resmi İKN / Dosya No
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.IKN_MAX}
                placeholder="Örn: 2026/1184920"
                value={ikn}
                onChange={(e) => setIkn(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İhale Usulü
              </label>
              <select
                value={procurementType}
                onChange={(e) => setProcurementType(e.target.value as ProcurementType)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {(Object.keys(PROCUREMENT_LABELS) as ProcurementType[]).map((k) => (
                  <option key={k} value={k}>
                    {PROCUREMENT_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Durum
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TenderStatus)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {(Object.keys(STATUS_LABELS) as TenderStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {STATUS_LABELS[k]}
                  </option>
                ))}
              </select>
              {(status === 'sonuclandi' || status === 'iptal') && (
                <p className="mt-1 text-[11px] text-amber-700">
                  Not: Sonuçlandı veya İptal durumu seçildiğinde ihale dosyası güvenlik gereği kilitlenir.
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Teslim Yeri / Komisyon Salonu / EKAP Bilgisi
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.LOCATION_MAX}
                placeholder="Örn: EKAP E-Teklif / İhale Salonu Kat 3"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Teklif / Yaklaşık Tutar
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  step="any"
                  placeholder="0"
                  value={estimatedAmount}
                  onChange={(e) => setEstimatedAmount(e.target.value)}
                  className="flex-1 min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                  className="w-24 min-h-[44px] px-2.5 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                >
                  <option value="TRY">TRY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Geçici Teminat Tutarı ({currency})
              </label>
              <input
                type="number"
                min={0}
                step="any"
                placeholder="0"
                value={bidBondAmount}
                onChange={(e) => setBidBondAmount(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İhale Notları ve Kritik Hatırlatmalar
              </label>
              <textarea
                rows={3}
                maxLength={SCHEMA_LIMITS.NOTES_MAX}
                placeholder="Zeyilname tarihleri, iş deneyim oranı, ortak girişim notları..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#DCE3EC] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-sm font-medium rounded-lg cursor-pointer transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-5 py-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-sm font-semibold rounded-lg cursor-pointer disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Kaydediliyor…' : editingTender ? 'Değişiklikleri Kaydet' : 'İhaleyi Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
