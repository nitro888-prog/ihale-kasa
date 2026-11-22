import React, { useEffect, useState } from 'react';
import { Building2, X } from 'lucide-react';
import {
  ACCOUNTING_COMPANY_TYPE_LABELS,
  AccountingCompany,
  AccountingCompanyType,
  SCHEMA_LIMITS,
} from '../types/tender';
import { AccountingCompanyInput } from '../services/firestoreService';

interface AccountingCompanyModalProps {
  open: boolean;
  onClose: () => void;
  editingCompany?: AccountingCompany | null;
  initialName?: string;
  onSubmit: (data: AccountingCompanyInput) => Promise<void>;
}

export const AccountingCompanyModal: React.FC<AccountingCompanyModalProps> = ({
  open,
  onClose,
  editingCompany,
  initialName = '',
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [companyType, setCompanyType] = useState<AccountingCompanyType>('tedarikci');
  const [taxOffice, setTaxOffice] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [iban, setIban] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(editingCompany?.name || initialName || '');
    setCompanyType(editingCompany?.companyType || 'tedarikci');
    setTaxOffice(editingCompany?.taxOffice || '');
    setTaxNumber(editingCompany?.taxNumber || '');
    setContactPerson(editingCompany?.contactPerson || '');
    setPhone(editingCompany?.phone || '');
    setEmail(editingCompany?.email || '');
    setAddress(editingCompany?.address || '');
    setIban(editingCompany?.iban || '');
    setNotes(editingCompany?.notes || '');
    setError(null);
  }, [open, editingCompany, initialName]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Cari firma ünvanı zorunludur.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        companyType,
        taxOffice: taxOffice.trim(),
        taxNumber: taxNumber.trim(),
        contactPerson: contactPerson.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        iban: iban.trim(),
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cari firma kaydedilemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B2239]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editingCompany ? 'Cari Firma Kartını Düzenle' : 'Yeni Cari Firma Kartı'}
    >
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] rounded-t-2xl sm:rounded-xl border border-[#DCE3EC] flex flex-col overflow-hidden">
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 bg-[#DCE3EC] rounded-full" />
        </div>

        <div className="px-5 py-4 bg-[#0B2239] text-white border-b-2 border-[#007A53] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Building2 className="w-5 h-5 text-[#FBBF24] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-white truncate">
                {editingCompany ? 'Cari Firma Kartını Düzenle' : 'Yeni Cari Firma Kartı'}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 truncate">
                Tedarikçi, alt yüklenici veya müşteri kurum bilgilerini kaydedin.
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Firma Ünvanı *
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.SUPPLIER_COMPANY_MAX}
                placeholder="Örn: Beta Elektromekanik San. ve Tic. A.Ş."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Cari Türü *
              </label>
              <select
                value={companyType}
                onChange={(e) => setCompanyType(e.target.value as AccountingCompanyType)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                {(Object.keys(ACCOUNTING_COMPANY_TYPE_LABELS) as AccountingCompanyType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {ACCOUNTING_COMPANY_TYPE_LABELS[t]}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Yetkili Kişi
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.PERSON_MAX}
                placeholder="Örn: Mehmet Kaya"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Vergi Dairesi
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.TAX_OFFICE_MAX}
                placeholder="Örn: OSTİM Vergi Dairesi"
                value={taxOffice}
                onChange={(e) => setTaxOffice(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Vergi No / TCKN
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.TAX_NUMBER_MAX}
                placeholder="10 veya 11 haneli numara"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Telefon
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.PHONE_MAX}
                placeholder="+90 312 ..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                E-Posta
              </label>
              <input
                type="email"
                maxLength={SCHEMA_LIMITS.EMAIL_MAX}
                placeholder="muhasebe@firma.com.tr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                IBAN Bilgisi
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.IBAN_MAX}
                placeholder="TR00 0000 0000 0000 0000 0000 00"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Adres
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.ADDRESS_MAX}
                placeholder="Fatura ve sevkiyat adresi"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Cari Notları
              </label>
              <textarea
                rows={2}
                maxLength={SCHEMA_LIMITS.NOTES_MAX}
                placeholder="Vade anlaşması, iskonto oranı veya banka notları..."
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
              {submitting
                ? 'Kaydediliyor…'
                : editingCompany
                ? 'Cari Kartı Güncelle'
                : 'Cari Firma Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
