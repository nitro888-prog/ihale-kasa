import React, { useState } from 'react';
import { ShieldAlert, Clock, LogOut, RefreshCw, Copy, Check } from 'lucide-react';
import { UserAuthorization } from '../types/tender';
import { TiniatechLogo } from './TiniatechLogo';

import firebaseConfig from '../../firebase-applet-config.json';

interface PendingAccessGateProps {
  userAuth: UserAuthorization;
  setupError?: string | null;
  isQuotaError?: boolean;
  onRetryCheck: () => Promise<void>;
  onSignOut: () => void;
}

export const PendingAccessGate: React.FC<PendingAccessGateProps> = ({
  userAuth,
  setupError,
  isQuotaError = false,
  onRetryCheck,
  onSignOut,
}) => {
  const [checking, setChecking] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  const isSuspended = userAuth.status === 'suspended';
  const quotaUpgradeUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;

  const handleCopyUid = async () => {
    try {
      await navigator.clipboard.writeText(userAuth.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 1600);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleRefresh = async () => {
    setChecking(true);
    try {
      await onRetryCheck();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F6FA] text-[#0B2239] flex flex-col justify-between">
      <header className="w-full bg-white border-b border-[#DCE3EC]">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <TiniatechLogo variant="inline" subtitle="Erişim Doğrulama" />
          <button
            type="button"
            onClick={onSignOut}
            className="min-h-[40px] px-3.5 inline-flex items-center gap-2 border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Oturumu Kapat</span>
          </button>
        </div>
        <div className="h-[3px] w-full bg-gradient-to-r from-[#00AEEF] via-[#0066B3] to-[#007A53]" />
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-xl bg-white border border-[#DCE3EC] rounded-2xl overflow-hidden">
          <div className="px-6 py-5 bg-[#0B2239] text-white flex items-center gap-3.5 border-b border-[#143252]">
            {isSuspended ? (
              <ShieldAlert className="w-6 h-6 text-red-400 shrink-0" />
            ) : (
              <Clock className="w-6 h-6 text-[#FBBF24] shrink-0" />
            )}
            <div>
              <h1 className="font-display text-lg font-bold text-white">
                {isSuspended
                  ? 'Erişim Yetkiniz Askıya Alındı'
                  : 'Yönetici Onayı Bekleniyor'}
              </h1>
              <p className="text-xs text-slate-300 mt-0.5">
                Tiniatech Kurumsal Rol Tabanlı Yetkilendirme Kontrolü
              </p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <p className="text-sm text-[#4E5D6C] leading-relaxed">
              {isSuspended
                ? 'Kurumsal ihale paneline erişim yetkiniz sistem yöneticisi tarafından geçici olarak askıya alınmıştır. Yeniden yetkilendirme için firma yöneticinizle iletişime geçin.'
                : 'Oturumunuz doğrulandı ancak firma çalışma alanına erişebilmeniz için sistem yöneticisinin hesabınıza rol ve modül yetkisi tanımlaması gerekiyor.'}
            </p>

            <div className="bg-[#F3F6FA] border border-[#DCE3EC] rounded-lg p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#4E5D6C]">Kayıtlı Ad Soyad</span>
                <span className="font-semibold text-[#0B2239]">
                  {userAuth.displayName || 'Belirtilmedi'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#4E5D6C]">E-Posta Adresi</span>
                <span className="font-mono font-semibold text-[#0B2239]">
                  {userAuth.email}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#4E5D6C]">Yetki Durumu</span>
                <span
                  className={`font-semibold ${
                    isSuspended ? 'text-red-700' : 'text-amber-700'
                  }`}
                >
                  {isSuspended ? 'Askıya Alındı' : 'Onay Bekliyor'}
                </span>
              </div>
              <div className="pt-2 border-t border-[#DCE3EC] flex items-center justify-between gap-2">
                <span className="text-[#4E5D6C]">Kullanıcı Kimliği (UID)</span>
                <button
                  type="button"
                  onClick={handleCopyUid}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#0066B3] hover:underline cursor-pointer"
                >
                  <span>{userAuth.uid}</span>
                  {copiedUid ? (
                    <Check className="w-3.5 h-3.5 text-[#007A53]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {setupError && (
              <div
                role="alert"
                className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-2"
              >
                <div className="font-bold">Yetki Kaydı Doğrulanamadı</div>
                <p className="leading-relaxed break-words">{setupError}</p>
                {isQuotaError && (
                  <div className="pt-1 flex flex-wrap items-center gap-3">
                    <a
                      href={quotaUpgradeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[#0066B3] underline hover:text-[#00508E]"
                    >
                      Firebase Veritabanı Planını Yükselt →
                    </a>
                    <a
                      href="https://firebase.google.com/pricing#cloud-firestore"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#4E5D6C] underline hover:text-[#0B2239]"
                    >
                      Spark / Enterprise Kota Detayları
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={checking}
                className="w-full sm:w-auto min-h-[44px] px-5 inline-flex items-center justify-center gap-2 bg-[#0066B3] hover:bg-[#00508E] text-white text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-60 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                <span>
                  {checking ? 'Kontrol Ediliyor…' : 'Yetki Durumunu Kontrol Et'}
                </span>
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="w-full sm:w-auto min-h-[44px] px-5 inline-flex items-center justify-center gap-2 bg-white border border-[#DCE3EC] hover:bg-[#F3F6FA] text-[#0B2239] text-xs font-semibold rounded-lg cursor-pointer transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Farklı Hesapla Giriş Yap</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-4xl w-full mx-auto px-6 py-5 text-xs text-[#4E5D6C] text-center">
        © {new Date().getFullYear()} Tiniatech® · Kurumsal Erişim Güvenlik Kapısı
      </footer>
    </div>
  );
};
