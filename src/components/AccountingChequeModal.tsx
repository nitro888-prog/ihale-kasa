import React, { useEffect, useMemo, useState } from 'react';
import { Landmark, X } from 'lucide-react';
import {
  ACCOUNTING_CHEQUE_DIRECTION_LABELS,
  ACCOUNTING_CHEQUE_STATUS_LABELS,
  AccountingCheque,
  AccountingChequeDirection,
  AccountingChequeStatus,
  AccountingCompany,
  BidProduct,
  CurrencyCode,
  SCHEMA_LIMITS,
  Tender,
} from '../types/tender';
import { AccountingChequeInput } from '../services/firestoreService';
import { getTodayDateStr } from '../lib/trackingAndCalendar';

export interface AccountingChequePrefill {
  direction?: AccountingChequeDirection;
  companyId?: string;
  companyName?: string;
  chequeNo?: string;
  bankName?: string;
  amount?: number;
  currency?: CurrencyCode;
  dueDate?: string;
  tenderId?: string;
  notes?: string;
}

interface AccountingChequeModalProps {
  open: boolean;
  onClose: () => void;
  companies: AccountingCompany[];
  bidProducts: BidProduct[];
  tenders: Tender[];
  editingCheque?: AccountingCheque | null;
  prefillValues?: AccountingChequePrefill | null;
  onSubmit: (
    data: AccountingChequeInput,
    options?: { alsoEnsureCompany?: boolean; alsoLogAccountingEntry?: boolean }
  ) => Promise<void>;
}

const COMMON_BANKS = [
  'T.C. Ziraat Bankası',
  'Türkiye İş Bankası',
  'Garanti BBVA',
  'Yapı ve Kredi Bankası',
  'Akbank',
  'VakıfBank',
  'Halkbank',
  'QNB Finansbank',
  'DenizBank',
  'TEB',
  'Kuveyt Türk',
  'Albaraka Türk',
  'Türkiye Finans',
  'ING Bank',
];

export const AccountingChequeModal: React.FC<AccountingChequeModalProps> = ({
  open,
  onClose,
  companies,
  bidProducts,
  tenders,
  editingCheque,
  prefillValues = null,
  onSubmit,
}) => {
  const todayStr = getTodayDateStr();

  const [direction, setDirection] = useState<AccountingChequeDirection>('alinan');
  const [companyName, setCompanyName] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [drawerName, setDrawerName] = useState('');
  const [endorsedTo, setEndorsedTo] = useState('');
  const [issueDate, setIssueDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState(todayStr);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('TRY');
  const [status, setStatus] = useState<AccountingChequeStatus>('portfoyde');
  const [tenderId, setTenderId] = useState('');
  const [notes, setNotes] = useState('');
  const [alsoEnsureCompany, setAlsoEnsureCompany] = useState(true);
  const [alsoLogAccountingEntry, setAlsoLogAccountingEntry] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editingCheque) {
      setDirection(editingCheque.direction);
      setCompanyName(editingCheque.companyName);
      setChequeNo(editingCheque.chequeNo);
      setBankName(editingCheque.bankName);
      setBranchName(editingCheque.branchName || '');
      setDrawerName(editingCheque.drawerName || '');
      setEndorsedTo(editingCheque.endorsedTo || '');
      setIssueDate(editingCheque.issueDate || '');
      setDueDate(editingCheque.dueDate || todayStr);
      setAmount(String(editingCheque.amount ?? 0));
      setCurrency(editingCheque.currency || 'TRY');
      setStatus(editingCheque.status || 'portfoyde');
      setTenderId(editingCheque.tenderId || '');
      setNotes(editingCheque.notes || '');
      setAlsoEnsureCompany(false);
      setAlsoLogAccountingEntry(false);
    } else {
      setDirection(prefillValues?.direction || 'alinan');
      setCompanyName(prefillValues?.companyName || '');
      setChequeNo(prefillValues?.chequeNo || '');
      setBankName(prefillValues?.bankName || '');
      setBranchName('');
      setDrawerName('');
      setEndorsedTo('');
      setIssueDate(todayStr);
      setDueDate(prefillValues?.dueDate || todayStr);
      setAmount(
        typeof prefillValues?.amount === 'number' && prefillValues.amount > 0
          ? String(prefillValues.amount)
          : ''
      );
      setCurrency(prefillValues?.currency || 'TRY');
      setStatus('portfoyde');
      setTenderId(prefillValues?.tenderId || '');
      setNotes(prefillValues?.notes || '');
      setAlsoEnsureCompany(true);
      setAlsoLogAccountingEntry(false);
    }
    setError(null);
  }, [open, editingCheque, prefillValues, todayStr]);

  const companySuggestions = useMemo(() => {
    const names = new Set<string>();
    for (const c of companies) {
      if (c.name.trim()) names.add(c.name.trim());
    }
    for (const p of bidProducts) {
      if (p.supplierCompany.trim()) names.add(p.supplierCompany.trim());
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [companies, bidProducts]);

  const matchedCompany = useMemo(() => {
    const target = companyName.trim().toLowerCase();
    if (!target) return null;
    return companies.find((c) => c.name.trim().toLowerCase() === target) || null;
  }, [companies, companyName]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError('Her çek kaydında ilgili firma bilgisi zorunludur.');
      return;
    }
    if (!chequeNo.trim()) {
      setError('Çek seri / sıra numarası zorunludur.');
      return;
    }
    if (!bankName.trim()) {
      setError('Banka adı zorunludur.');
      return;
    }
    if (!dueDate) {
      setError('Çek vade tarihi zorunludur.');
      return;
    }
    const numericAmount = Math.max(0, Number(amount) || 0);
    if (numericAmount <= 0) {
      setError('Çek tutarı 0’dan büyük olmalıdır.');
      return;
    }

    const linkedTender = tenders.find((t) => t.id === tenderId);

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(
        {
          direction,
          chequeNo: chequeNo.trim(),
          bankName: bankName.trim(),
          branchName: branchName.trim(),
          drawerName: drawerName.trim(),
          companyId: matchedCompany?.id || '',
          companyName: companyName.trim(),
          endorsedTo: endorsedTo.trim(),
          issueDate,
          dueDate,
          amount: numericAmount,
          currency,
          status,
          tenderId: linkedTender ? linkedTender.id : '',
          tenderTrackingCode: linkedTender ? linkedTender.trackingCode : '',
          notes: notes.trim(),
        },
        {
          alsoEnsureCompany: !matchedCompany && alsoEnsureCompany,
          alsoLogAccountingEntry: !editingCheque && alsoLogAccountingEntry,
        }
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Çek kaydı kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B2239]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editingCheque ? 'Çek Kaydını Düzenle' : 'Yeni Çek Kaydı'}
    >
      <div className="bg-white w-full sm:max-w-3xl max-h-[92vh] rounded-t-2xl sm:rounded-xl border border-[#DCE3EC] flex flex-col overflow-hidden">
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 bg-[#DCE3EC] rounded-full" />
        </div>

        <div className="px-5 py-4 bg-[#0B2239] text-white border-b-2 border-[#007A53] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Landmark className="w-5 h-5 text-[#FBBF24] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-white truncate">
                {editingCheque ? 'Çek Kaydını Düzenle' : 'Yeni Çek Kaydı'}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 truncate">
                Alınan müşteri çekleri ve verilen firma çeklerini banka, vade ve ciro bilgileriyle takip edin.
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium"
            >
              {error}
            </div>
          )}

          {/* Çek Yönü Seçimi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(['alinan', 'verilen'] as AccountingChequeDirection[]).map((dir) => {
              const active = direction === dir;
              return (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setDirection(dir)}
                  className={`min-h-[46px] px-4 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#0B2239] border-[#0B2239] text-white'
                      : 'bg-[#F3F6FA]/70 border-[#DCE3EC] text-[#0B2239] hover:bg-[#F3F6FA]'
                  }`}
                >
                  <div className="text-xs font-bold">
                    {ACCOUNTING_CHEQUE_DIRECTION_LABELS[dir]}
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 ${
                      active ? 'text-slate-300' : 'text-[#4E5D6C]'
                    }`}
                  >
                    {dir === 'alinan'
                      ? 'Müşteri veya kurumdan tahsilat amaçlı alınan çek'
                      : 'Tedarikçiye veya ödemeye karşılık kesilen çek'}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                {direction === 'alinan'
                  ? 'Çekin Alındığı Firma Bilgisi *'
                  : 'Çekin Verildiği Firma Bilgisi *'}
              </label>
              <input
                type="text"
                required
                list="cheque-company-suggestions"
                maxLength={SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX}
                placeholder="Firma ünvanını yazın veya listeden seçin..."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
              <datalist id="cheque-company-suggestions">
                {companySuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {companyName.trim() && !matchedCompany && (
                <label className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-[#4E5D6C] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoEnsureCompany}
                    onChange={(e) => setAlsoEnsureCompany(e.target.checked)}
                    className="w-3.5 h-3.5 accent-[#0066B3]"
                  />
                  <span>Bu firmayı Cari Firmalar listesine de otomatik ekle</span>
                </label>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Çek Seri / Sıra No *
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.CHEQUE_NO_MAX}
                placeholder="Örn: TR-4829105"
                value={chequeNo}
                onChange={(e) => setChequeNo(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Banka Adı *
              </label>
              <input
                type="text"
                required
                list="cheque-bank-suggestions"
                maxLength={SCHEMA_LIMITS.BANK_NAME_MAX}
                placeholder="Örn: T.C. Ziraat Bankası"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
              <datalist id="cheque-bank-suggestions">
                {COMMON_BANKS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Şube Adı / Kodu
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.BRANCH_NAME_MAX}
                placeholder="Örn: Çankaya Ticari Şb."
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Keşideci (Düzenleyen)
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX}
                placeholder="Boş bırakılırsa firma ile aynı"
                value={drawerName}
                onChange={(e) => setDrawerName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Çek Tutarı *
              </label>
              <input
                type="number"
                required
                min={0.01}
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Para Birimi
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Çek Durumu
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AccountingChequeStatus)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {(
                  Object.keys(ACCOUNTING_CHEQUE_STATUS_LABELS) as AccountingChequeStatus[]
                ).map((st) => (
                  <option key={st} value={st}>
                    {ACCOUNTING_CHEQUE_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Keşide / Düzenleme Tarihi
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Vade Tarihi *
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İlişkili İhale (İsteğe Bağlı)
              </label>
              <select
                value={tenderId}
                onChange={(e) => setTenderId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                <option value="">Genel / İhaleye Bağlı Değil</option>
                {tenders.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.trackingCode} — {t.title}
                  </option>
                ))}
              </select>
            </div>

            {(status === 'ciro_edildi' || endorsedTo.trim() !== '') && (
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                  Ciro Edilen Firma / Kişi
                </label>
                <input
                  type="text"
                  list="cheque-company-suggestions"
                  maxLength={SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX}
                  placeholder="Çekin ciro edildiği tedarikçi veya kişi..."
                  value={endorsedTo}
                  onChange={(e) => setEndorsedTo(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
                />
              </div>
            )}

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Çek Notları / Banka Takas Bilgisi
              </label>
              <textarea
                rows={2}
                maxLength={SCHEMA_LIMITS.NOTES_MAX}
                placeholder="Bordro numarası, takas bankası veya ek açıklamalar..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>
          </div>

          {!editingCheque && (
            <label className="p-3 bg-[#0066B3]/5 border border-[#0066B3]/30 rounded-lg flex items-start gap-2.5 text-xs text-[#0B2239] cursor-pointer">
              <input
                type="checkbox"
                checked={alsoLogAccountingEntry}
                onChange={(e) => setAlsoLogAccountingEntry(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#0066B3]"
              />
              <span>
                <strong>İşlemler &amp; Faturalar akışına da işle:</strong> Bu çek için ön muhasebe hareketlerine otomatik bir{' '}
                {direction === 'alinan' ? 'Tahsilat' : 'Ödeme'} (Çek / Senet) kaydı oluştur.
              </span>
            </label>
          )}

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
              {submitting
                ? 'Kaydediliyor…'
                : editingCheque
                ? 'Çek Kaydını Güncelle'
                : 'Çek Kaydını Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
