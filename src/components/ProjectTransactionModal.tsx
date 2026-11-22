import React, { useEffect, useMemo, useState } from 'react';
import { X, Receipt } from 'lucide-react';
import {
  AccountingCompany,
  AccountingPaymentMethod,
  AccountingPaymentStatus,
  ACCOUNTING_PAYMENT_METHOD_LABELS,
  ACCOUNTING_PAYMENT_STATUS_LABELS,
  BidProduct,
  CurrencyCode,
  isProjectIncomeTx,
  Project,
  PROJECT_TX_CATEGORIES,
  PROJECT_TX_TYPE_LABELS,
  ProjectTransaction,
  ProjectTransactionType,
  SCHEMA_LIMITS,
} from '../types/tender';
import { ProjectTransactionInput } from '../services/firestoreService';
import { getTodayDateStr } from '../lib/trackingAndCalendar';

export interface ProjectTransactionPrefill {
  projectId?: string;
  txType?: ProjectTransactionType;
}

interface ProjectTransactionModalProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  companies: AccountingCompany[];
  bidProducts: BidProduct[];
  editingTx: ProjectTransaction | null;
  prefillValues?: ProjectTransactionPrefill | null;
  canAlsoCreateAccountingEntry: boolean;
  onSubmit: (
    data: ProjectTransactionInput,
    options?: { alsoCreateAccountingEntry?: boolean }
  ) => Promise<void>;
}

export const ProjectTransactionModal: React.FC<ProjectTransactionModalProps> = ({
  open,
  onClose,
  projects,
  companies,
  bidProducts,
  editingTx,
  prefillValues,
  canAlsoCreateAccountingEntry,
  onSubmit,
}) => {
  const [projectId, setProjectId] = useState('');
  const [txType, setTxType] = useState<ProjectTransactionType>('gelen_fatura');
  const [category, setCategory] = useState(PROJECT_TX_CATEGORIES[1]);
  const [companyName, setCompanyName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [title, setTitle] = useState('');
  const [subtotalInput, setSubtotalInput] = useState('');
  const [vatRate, setVatRate] = useState('20');
  const [currency, setCurrency] = useState<CurrencyCode>('TRY');
  const [txDate, setTxDate] = useState(getTodayDateStr());
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] =
    useState<AccountingPaymentMethod>('banka_havale');
  const [paymentStatus, setPaymentStatus] =
    useState<AccountingPaymentStatus>('bekliyor');
  const [paidAmountInput, setPaidAmountInput] = useState('0');
  const [notes, setNotes] = useState('');
  const [alsoLogAccounting, setAlsoLogAccounting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) || null,
    [projects, projectId]
  );

  const companySuggestions = useMemo(() => {
    const set = new Set<string>();
    companies.forEach((c) => {
      if (c.name) set.add(c.name);
    });
    bidProducts.forEach((p) => {
      if (p.supplierCompany) set.add(p.supplierCompany);
    });
    if (selectedProject?.authority) {
      set.add(selectedProject.authority);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [companies, bidProducts, selectedProject]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAlsoLogAccounting(false);

    if (editingTx) {
      setProjectId(editingTx.projectId);
      setTxType(editingTx.txType);
      setCategory(editingTx.category || PROJECT_TX_CATEGORIES[1]);
      setCompanyName(editingTx.companyName || '');
      setInvoiceNo(editingTx.invoiceNo || '');
      setTitle(editingTx.title || '');
      setSubtotalInput(String(editingTx.subtotalAmount ?? 0));
      setVatRate(String(editingTx.vatRate ?? 20));
      setCurrency(editingTx.currency || 'TRY');
      setTxDate(editingTx.txDate || getTodayDateStr());
      setDueDate(editingTx.dueDate || '');
      setPaymentMethod(editingTx.paymentMethod || 'banka_havale');
      setPaymentStatus(editingTx.paymentStatus || 'bekliyor');
      setPaidAmountInput(String(editingTx.paidAmount ?? 0));
      setNotes(editingTx.notes || '');
      return;
    }

    const defaultProject =
      (prefillValues?.projectId
        ? projects.find((p) => p.id === prefillValues.projectId)
        : null) || projects[0] || null;
    const defaultType = prefillValues?.txType || 'gelen_fatura';

    setProjectId(defaultProject?.id || '');
    setTxType(defaultType);
    setCategory(
      isProjectIncomeTx(defaultType)
        ? PROJECT_TX_CATEGORIES[0]
        : PROJECT_TX_CATEGORIES[1]
    );
    setCompanyName(
      isProjectIncomeTx(defaultType) && defaultProject?.authority
        ? defaultProject.authority
        : ''
    );
    setInvoiceNo('');
    setTitle('');
    setSubtotalInput('');
    setVatRate(defaultType === 'gider' ? '0' : '20');
    setCurrency(defaultProject?.currency || 'TRY');
    setTxDate(getTodayDateStr());
    setDueDate('');
    setPaymentMethod('banka_havale');
    setPaymentStatus('bekliyor');
    setPaidAmountInput('0');
    setNotes('');
  }, [open, editingTx, prefillValues, projects]);

  if (!open) return null;

  const subtotal = Math.max(0, Number(subtotalInput) || 0);
  const vatPct = Math.max(0, Math.min(100, Number(vatRate) || 0));
  const vatAmount = Number(((subtotal * vatPct) / 100).toFixed(2));
  const totalAmount = Number((subtotal + vatAmount).toFixed(2));

  const handleTxTypeChange = (nextType: ProjectTransactionType) => {
    setTxType(nextType);
    if (!editingTx) {
      if (isProjectIncomeTx(nextType)) {
        setCategory(PROJECT_TX_CATEGORIES[0]);
        if (!companyName.trim() && selectedProject?.authority) {
          setCompanyName(selectedProject.authority);
        }
      } else {
        setCategory(nextType === 'gider' ? PROJECT_TX_CATEGORIES[5] : PROJECT_TX_CATEGORIES[1]);
        if (selectedProject && companyName === selectedProject.authority) {
          setCompanyName('');
        }
      }
      if (nextType === 'gider') setVatRate('0');
      else if (vatRate === '0') setVatRate('20');
    }
  };

  const handlePaymentStatusChange = (nextStatus: AccountingPaymentStatus) => {
    setPaymentStatus(nextStatus);
    if (nextStatus === 'odendi') {
      setPaidAmountInput(String(totalAmount));
    } else if (nextStatus === 'bekliyor' || nextStatus === 'iptal') {
      setPaidAmountInput('0');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) {
      setError('Lütfen bir proje seçin.');
      return;
    }
    if (!companyName.trim()) {
      setError('Karşı firma / kurum bilgisi zorunludur.');
      return;
    }
    if (!title.trim()) {
      setError('İşlem / Fatura açıklaması zorunludur.');
      return;
    }
    if (totalAmount <= 0) {
      setError('Lütfen 0’dan büyük bir tutar girin.');
      return;
    }

    const matchedCompany = companies.find(
      (c) => c.name.trim().toLowerCase() === companyName.trim().toLowerCase()
    );

    const resolvedPaidAmount =
      paymentStatus === 'odendi'
        ? totalAmount
        : paymentStatus === 'bekliyor' || paymentStatus === 'iptal'
        ? 0
        : Math.min(totalAmount, Math.max(0, Number(paidAmountInput) || 0));

    setSaving(true);
    setError(null);
    try {
      await onSubmit(
        {
          projectId: selectedProject.id,
          projectCode: selectedProject.projectCode,
          projectTitle: selectedProject.title,
          tenderId: selectedProject.tenderId || '',
          tenderTrackingCode: selectedProject.tenderTrackingCode || '',
          txType,
          category: category || PROJECT_TX_CATEGORIES[8],
          companyId: matchedCompany?.id || '',
          companyName: companyName.trim(),
          invoiceNo: invoiceNo.trim(),
          title: title.trim(),
          vatRate: vatPct,
          subtotalAmount: subtotal,
          vatAmount,
          totalAmount,
          paidAmount: resolvedPaidAmount,
          currency,
          txDate: txDate || getTodayDateStr(),
          dueDate: dueDate || '',
          paymentMethod,
          paymentStatus,
          notes: notes.trim(),
        },
        {
          alsoCreateAccountingEntry:
            !editingTx && canAlsoCreateAccountingEntry && alsoLogAccounting,
        }
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Proje hareketi kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B2239]/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={editingTx ? 'Proje İşlemini Düzenle' : 'Yeni Proje Fatura / Gider Kaydı'}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[#DCE3EC] rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="px-5 py-4 bg-[#0B2239] text-white border-b-2 border-[#007A53] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Receipt className="w-5 h-5 text-[#34D399] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-white truncate">
                {editingTx ? 'Proje Fatura / Gider Kaydını Düzenle' : 'Proje Fatura / Gider Ekle'}
              </h2>
              <p className="text-xs text-slate-300 truncate">
                Yazılan gelir ve giderler Genel Proje Maliyet Muhasebesi tablosuna anlık işlenir.
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Proje *
              </label>
              <select
                value={projectId}
                disabled={Boolean(editingTx)}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  const nextP = projects.find((item) => item.id === e.target.value);
                  if (nextP) setCurrency(nextP.currency);
                }}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] disabled:bg-[#F3F6FA] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode} · {p.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İşlem Türü *
              </label>
              <select
                value={txType}
                onChange={(e) => handleTxTypeChange(e.target.value as ProjectTransactionType)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {(Object.keys(PROJECT_TX_TYPE_LABELS) as ProjectTransactionType[]).map((k) => (
                  <option key={k} value={k}>
                    {PROJECT_TX_TYPE_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                {isProjectIncomeTx(txType) ? 'Kesilen Kurum / Müşteri Firma *' : 'Tedarikçi / Harcama Firması *'}
              </label>
              <input
                type="text"
                required
                list="project-company-suggestions"
                maxLength={SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Firma veya kurum adı yazın / seçin"
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
              <datalist id="project-company-suggestions">
                {companySuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Fatura / Belge No
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.INVOICE_NO_MAX}
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="Örn: FTR-2026-0142"
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-mono text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İşlem / Kalem Açıklaması *
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.ACCOUNTING_TITLE_MAX}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Örn: 1. Hakediş Faturası veya Saha Kablo Tedariki"
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Maliyet / Gelir Kalemi
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {PROJECT_TX_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                KDV Hariç Tutar *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={subtotalInput}
                onChange={(e) => setSubtotalInput(e.target.value)}
                placeholder="0.00"
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-mono text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                KDV Oranı (%)
              </label>
              <select
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-mono text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                <option value="0">%0</option>
                <option value="1">%1</option>
                <option value="10">%10</option>
                <option value="20">%20</option>
              </select>
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
              <div className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                KDV Dahil Toplam
              </div>
              <div className="min-h-[44px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg text-sm font-mono font-bold text-[#0B2239] flex items-center tabular-nums">
                {totalAmount.toLocaleString('tr-TR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                {currency}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                İşlem / Fatura Tarihi *
              </label>
              <input
                type="date"
                required
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-mono text-[#0B2239]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Vade Tarihi
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-mono text-[#0B2239]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Ödeme Yöntemi
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as AccountingPaymentMethod)
                }
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239]"
              >
                {(Object.keys(ACCOUNTING_PAYMENT_METHOD_LABELS) as AccountingPaymentMethod[]).map(
                  (m) => (
                    <option key={m} value={m}>
                      {ACCOUNTING_PAYMENT_METHOD_LABELS[m]}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Ödeme Durumu
              </label>
              <select
                value={paymentStatus}
                onChange={(e) =>
                  handlePaymentStatusChange(e.target.value as AccountingPaymentStatus)
                }
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239]"
              >
                {(Object.keys(ACCOUNTING_PAYMENT_STATUS_LABELS) as AccountingPaymentStatus[]).map(
                  (s) => (
                    <option key={s} value={s}>
                      {ACCOUNTING_PAYMENT_STATUS_LABELS[s]}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {paymentStatus === 'kismi' && (
            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Ödenen / Tahsil Edilen Tutar
              </label>
              <input
                type="number"
                min="0"
                max={totalAmount}
                step="0.01"
                value={paidAmountInput}
                onChange={(e) => setPaidAmountInput(e.target.value)}
                className="w-full sm:w-64 min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm font-mono text-[#0B2239]"
              />
            </div>
          )}

          {!editingTx && canAlsoCreateAccountingEntry && (
            <label className="p-3 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg flex items-center gap-2.5 cursor-pointer text-xs text-[#0B2239]">
              <input
                type="checkbox"
                checked={alsoLogAccounting}
                onChange={(e) => setAlsoLogAccounting(e.target.checked)}
                className="w-4 h-4 accent-[#0066B3]"
              />
              <span>
                Bu faturayı / gideri eşzamanlı olarak <strong>Ön Muhasebe</strong> defterine de otomatik işle
              </span>
            </label>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
              Açıklama / Notlar
            </label>
            <textarea
              rows={2}
              maxLength={SCHEMA_LIMITS.NOTES_MAX}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Fatura detayı, irsaliye no veya şantiye notları..."
              className="w-full px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239]"
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
              : editingTx
              ? 'Değişiklikleri Kaydet'
              : 'İşlemi Kaydet'}
          </button>
        </div>
      </form>
    </div>
  );
};
