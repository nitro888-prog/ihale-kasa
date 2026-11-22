import React, { useEffect, useState } from 'react';
import { Building2, Download, Check, Bell, Send } from 'lucide-react';
import { CompanyProfile, SCHEMA_LIMITS, Tender } from '../types/tender';
import { saveCompanyProfile } from '../services/firestoreService';
import { downloadAllTendersICS } from '../lib/trackingAndCalendar';
import {
  clearNotifiedTenderMorningForToday,
  dispatchTestBrowserNotification,
  NotificationPrefs,
  requestBrowserNotificationPermission,
} from '../lib/morningNotifications';
import { TiniatechLogo } from './TiniatechLogo';

interface SettingsViewProps {
  uid: string;
  workspaceOwnerId: string;
  memberIds?: string[];
  canManageSettings?: boolean;
  userEmail: string;
  profile: CompanyProfile | null;
  tenders: Tender[];
  notificationPrefs: NotificationPrefs;
  notificationPermission: NotificationPermission | 'unsupported';
  onUpdateNotificationPrefs: (next: NotificationPrefs) => void;
  onUpdatePermission: (perm: NotificationPermission | 'unsupported') => void;
  onTriggerImmediateCheck: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  uid,
  workspaceOwnerId,
  memberIds,
  canManageSettings = true,
  userEmail,
  profile,
  tenders,
  notificationPrefs,
  notificationPermission,
  onUpdateNotificationPrefs,
  onUpdatePermission,
  onTriggerImmediateCheck,
}) => {
  const [companyName, setCompanyName] = useState(profile?.companyName || '');
  const [taxOffice, setTaxOffice] = useState(profile?.taxOffice || '');
  const [taxNumber, setTaxNumber] = useState(profile?.taxNumber || '');
  const [authorizedPerson, setAuthorizedPerson] = useState(
    profile?.authorizedPerson || ''
  );
  const [phone, setPhone] = useState(profile?.phone || '');
  const [email, setEmail] = useState(profile?.email || userEmail || '');
  const [defaultReminderDays, setDefaultReminderDays] = useState(
    profile?.defaultReminderDays ?? 3
  );
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setCompanyName(profile.companyName || '');
    setTaxOffice(profile.taxOffice || '');
    setTaxNumber(profile.taxNumber || '');
    setAuthorizedPerson(profile.authorizedPerson || '');
    setPhone(profile.phone || '');
    setEmail(profile.email || userEmail || '');
    setDefaultReminderDays(profile.defaultReminderDays ?? 3);
  }, [profile, userEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageSettings) return;
    setSaving(true);
    setSavedToast(false);
    try {
      await saveCompanyProfile(
        workspaceOwnerId,
        {
          companyName: companyName || 'Kurumsal Firma',
          taxOffice,
          taxNumber,
          authorizedPerson,
          phone,
          email,
          defaultReminderDays,
        },
        memberIds
      );
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Kurumsal Marka Kimliği Önizleme Kartı */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <TiniatechLogo variant="hero" subtitle="Kurumsal Antet ve Rapor Logosu" />
        <div className="text-xs text-[#4E5D6C] sm:text-right space-y-0.5">
          <div className="font-semibold text-[#0B2239]">
            {companyName || 'Tiniatech Kurumsal'}
          </div>
          <div>
            {taxOffice ? `${taxOffice} V.D.` : 'Vergi Dairesi Belirtilmedi'}
            {taxNumber ? ` · VKN ${taxNumber}` : ''}
          </div>
          <div className="text-[11px] text-[#007A53] font-medium">
            PDF rapor ve antetlerde aktif logo
          </div>
        </div>
      </section>

      <form
        onSubmit={handleSubmit}
        className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[#DCE3EC] flex items-center gap-3">
          <Building2 className="w-5 h-5 text-[#0066B3] shrink-0" />
          <div>
            <h2 className="font-display text-sm font-bold text-[#0B2239]">
              Firma Kimliği ve İhale Ayarları
            </h2>
            <p className="text-xs text-[#4E5D6C] mt-0.5">
              Takvim dosyalarında, PDF fatura eşleştirmelerinde ve raporlarda kullanılacak firma bilgileriniz
            </p>
          </div>
        </div>

        <fieldset
          disabled={!canManageSettings}
          className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 disabled:opacity-75"
        >
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
              Firma Ticari Ünvanı *
            </label>
            <input
              type="text"
              required
              maxLength={SCHEMA_LIMITS.COMPANY_NAME_MAX}
              placeholder="Örn: Tiniatech Endüstri Sanayi ve Ticaret A.Ş."
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
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
              value={taxOffice}
              onChange={(e) => setTaxOffice(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
              Vergi Numarası
            </label>
            <input
              type="text"
              maxLength={SCHEMA_LIMITS.TAX_NUMBER_MAX}
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
              Yetkili Kişi
            </label>
            <input
              type="text"
              maxLength={SCHEMA_LIMITS.PERSON_MAX}
              value={authorizedPerson}
              onChange={(e) => setAuthorizedPerson(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
              İletişim Telefonu
            </label>
            <input
              type="tel"
              maxLength={SCHEMA_LIMITS.PHONE_MAX}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
              Kurumsal E-Posta
            </label>
            <input
              type="email"
              maxLength={SCHEMA_LIMITS.EMAIL_MAX}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
              Varsayılan Hatırlatma Süresi (Gün)
            </label>
            <input
              type="number"
              min={0}
              max={30}
              value={defaultReminderDays}
              onChange={(e) => setDefaultReminderDays(Number(e.target.value) || 0)}
              className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
            />
          </div>
        </fieldset>

        <div className="px-5 py-4 bg-[#F3F6FA]/80 border-t border-[#DCE3EC] flex items-center justify-between gap-4">
          <div className="text-xs font-medium flex items-center gap-1.5">
            {!canManageSettings ? (
              <span className="text-[#4E5D6C]">
                Firma kimlik bilgilerini yalnızca &quot;Firma Ayarları&quot; yetkisine sahip kullanıcılar düzenleyebilir.
              </span>
            ) : (
              savedToast && (
                <span className="text-[#007A53] flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  <span>Firma bilgileri kaydedildi.</span>
                </span>
              )
            )}
          </div>
          {canManageSettings && (
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-5 py-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-sm font-semibold rounded-lg cursor-pointer disabled:opacity-60 transition-colors"
            >
              {saving ? 'Kaydediliyor…' : 'Ayarları Kaydet'}
            </button>
          )}
        </div>
      </form>

      {/* Sabah Tarayıcı Bildirimleri */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#DCE3EC] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-[#0066B3] shrink-0" />
            <div>
              <h3 className="font-display text-sm font-bold text-[#0B2239]">
                İhale Günü Sabah Bildirimleri
              </h3>
              <p className="text-xs text-[#4E5D6C] mt-0.5">
                Son teslim tarihi gelen ihaleler için belirlediğiniz sabah saatinde yerel tarayıcı bildirimi ve panel uyarısı tetiklenir.
              </p>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={notificationPrefs.enabled}
              onChange={(e) =>
                onUpdateNotificationPrefs({
                  ...notificationPrefs,
                  enabled: e.target.checked,
                })
              }
              className="w-4 h-4 accent-[#0066B3] cursor-pointer"
            />
            <span className="text-xs font-semibold text-[#0B2239]">Aktif</span>
          </label>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-[#0B2239] mb-1.5">
                Sabah Bildirim Saati
              </label>
              <select
                value={notificationPrefs.morningTime}
                disabled={!notificationPrefs.enabled}
                onChange={(e) =>
                  onUpdateNotificationPrefs({
                    ...notificationPrefs,
                    morningTime: e.target.value,
                  })
                }
                className="w-full min-h-[44px] px-3 py-2 bg-white border border-[#DCE3EC] rounded-lg text-sm text-[#0B2239] font-mono tabular-nums disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#0066B3]"
              >
                <option value="07:00">07:00</option>
                <option value="07:30">07:30</option>
                <option value="08:00">08:00 (Önerilen)</option>
                <option value="08:30">08:30</option>
                <option value="09:00">09:00</option>
              </select>
            </div>

            <div>
              <div className="text-xs font-semibold text-[#0B2239] mb-1.5">
                Tarayıcı Bildirim İzni
              </div>
              <div className="min-h-[44px] px-3 py-2 bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg flex items-center justify-between gap-2 text-xs">
                <span
                  className={`font-semibold ${
                    notificationPermission === 'granted'
                      ? 'text-[#007A53]'
                      : notificationPermission === 'denied'
                      ? 'text-red-700'
                      : 'text-amber-700'
                  }`}
                >
                  {notificationPermission === 'granted'
                    ? 'İzin Verildi'
                    : notificationPermission === 'denied'
                    ? 'Tarayıcıdan Engelli'
                    : notificationPermission === 'unsupported'
                    ? 'Desteklenmiyor (Panel Uyarısı Aktif)'
                    : 'Onay Bekliyor'}
                </span>
                {notificationPermission === 'default' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const nextPerm = await requestBrowserNotificationPermission();
                      onUpdatePermission(nextPerm);
                    }}
                    className="px-2.5 py-1 bg-[#0066B3] hover:bg-[#00508E] text-white font-semibold rounded cursor-pointer whitespace-nowrap transition-colors"
                  >
                    İzin Ver
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                let perm = notificationPermission;
                if (perm === 'default') {
                  perm = await requestBrowserNotificationPermission();
                  onUpdatePermission(perm);
                }
                const sent = dispatchTestBrowserNotification(tenders[0]);
                if (!sent) {
                  clearNotifiedTenderMorningForToday(uid, tenders);
                  onTriggerImmediateCheck();
                }
              }}
              className="min-h-[44px] px-4 inline-flex items-center gap-2 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer transition-colors"
            >
              <Send className="w-3.5 h-3.5 text-[#0066B3]" />
              <span>Test Bildirimi Gönder</span>
            </button>

            <button
              type="button"
              onClick={() => {
                clearNotifiedTenderMorningForToday(uid, tenders);
                onTriggerImmediateCheck();
              }}
              className="min-h-[44px] px-4 inline-flex items-center gap-2 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#4E5D6C] text-xs font-medium rounded-lg cursor-pointer transition-colors"
            >
              <span>Bugünkü İhale Uyarılarını Yeniden Kontrol Et</span>
            </button>
          </div>
        </div>
      </section>

      {/* Toplu Takvim Yedekleme */}
      <section className="bg-white border border-[#DCE3EC] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-sm font-bold text-[#0B2239]">
            Takvim Yedeği ve Dışa Aktarım (.ics)
          </h3>
          <p className="text-xs text-[#4E5D6C] mt-1">
            Tüm aktif ihalelerinizi, takip numaralarını ve 24s / 2s öncesi alarmlarını telefon veya masaüstü takviminize aktarın.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadAllTendersICS(tenders, companyName)}
          disabled={tenders.length === 0}
          className="min-h-[44px] px-4 inline-flex items-center justify-center gap-2 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer shrink-0 disabled:opacity-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Tüm İhaleleri İndir (.ics)</span>
        </button>
      </section>
    </div>
  );
};
