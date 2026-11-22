import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  ShieldCheck,
  CalendarClock,
  FolderLock,
  ArrowRight,
  Calculator,
  Briefcase,
  Lock,
} from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import { TiniatechLogo } from './TiniatechLogo';

export const AuthGate: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      const message = err instanceof Error ? err.message : String(err || '');

      if (code === 'auth/popup-closed-by-user' || message.includes('popup-closed-by-user')) {
        setErrorMsg('Giriş penceresi kapatıldı. Devam etmek için tekrar deneyin.');
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg(
          'Tarayıcı açılır giriş penceresini engelledi. Lütfen bu site için açılır pencerelere (pop-up) izin verip tekrar deneyin.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setErrorMsg(
          `Bu alan adı (${window.location.hostname}) Firebase Authentication Yetkili Alan Adları listesinde tanımlı değil (${code}). Yönetici Firebase Console > Authentication > Settings > Authorized domains bölümüne bu adresi eklemelidir.`
        );
      } else if (
        code.includes('403') ||
        message.includes('403') ||
        message.includes('access_denied') ||
        message.includes('disallowed_useragent')
      ) {
        setErrorMsg(
          `Google oturum erişimi engellendi (403${code ? ` · ${code}` : ''}). Uygulamayı WhatsApp/Gmail içi tarayıcı yerine Chrome/Safari'de açın ve OAuth Test Kullanıcıları / Paylaşım ayarlarını kontrol edin.`
        );
      } else {
        setErrorMsg(
          `Google ile giriş sırasında bir hata oluştu${code ? ` (${code})` : ''}. Lütfen tekrar deneyin.`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F6FA] text-[#0B2239] flex flex-col justify-between">
      {/* Kurumsal Üst Başlık Bandı */}
      <header className="w-full bg-white border-b border-[#DCE3EC]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <TiniatechLogo variant="inline" subtitle="İhaleKasa Kurumsal Portal" />
          <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-[#4E5D6C] whitespace-nowrap shrink-0">
            <Lock className="w-3.5 h-3.5 text-[#007A53]" />
            <span>Yetkili Personel ve Firma Erişim Sistemi</span>
          </div>
        </div>
        <div className="h-[3px] w-full bg-gradient-to-r from-[#00AEEF] via-[#0066B3] to-[#007A53]" />
      </header>

      <main className="w-full max-w-6xl mx-auto px-6 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        {/* Sol: TINIATECH Kurumsal Giriş ve Değer Önerisi */}
        <section className="lg:col-span-6 bg-white border border-[#DCE3EC] rounded-2xl p-7 sm:p-10 flex flex-col justify-between gap-8">
          <div className="space-y-6">
            <TiniatechLogo variant="hero" subtitle="İhale, Proje ve Ön Muhasebe" />

            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0066B3]">
                Kurumsal İşletme Yönetim Platformu
              </p>
              <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-[#0B2239] leading-[1.12] [text-wrap:balance]">
                İhale süreçleri, proje maliyetleri ve ön muhasebe tek kurumsal çatıda.
              </h1>
              <p className="text-sm sm:text-base text-[#4E5D6C] leading-relaxed">
                Tiniatech operasyon ekipleri için geliştirilen kurumsal çalışma alanı ile ihale
                dosyalarını, teklif ürünlerini, kazanılan projelerin gelir-gider muhasebesini ve
                PDF fatura aktarımlarını rol tabanlı yetkiyle yönetin.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-[#DCE3EC] space-y-4">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 min-h-[48px] px-6 py-3 bg-[#0066B3] hover:bg-[#00508E] active:scale-[0.99] text-white text-sm font-semibold rounded-lg transition-all cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <span>{loading ? 'Oturum Açılıyor...' : 'Kurumsal Google Hesabı ile Giriş Yap'}</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>

            {errorMsg && (
              <p className="text-sm text-red-700 font-medium" role="alert">
                {errorMsg}
              </p>
            )}

            <p className="text-xs text-[#4E5D6C] leading-relaxed">
              Tüm firma belgeleri ve finansal kayıtlar kullanıcı bazlı yetkilendirme ve Firebase
              güvenlik kurallarıyla korunur.
            </p>
          </div>
        </section>

        {/* Sağ: Kurumsal Modül Mimarisi */}
        <section className="lg:col-span-6 bg-[#0B2239] text-white border border-[#143252] rounded-2xl p-7 sm:p-10 corporate-grid-bg flex flex-col justify-between gap-6">
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7DD3FC]">
              Entegre Modül Yapısı
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Tiniatech Kurumsal İş Akışı
            </h2>
          </div>

          <div className="divide-y divide-[#183B5E]">
            <div className="py-4 first:pt-0 flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-[#143252] border border-[#1E4A75] flex items-center justify-center shrink-0">
                <CalendarClock className="w-4 h-4 text-[#00AEEF]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  İhale Takibi ve İhale Günü Hızlı Erişim
                </h3>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                  Takvimle senkronize <span className="font-mono text-[#7DD3FC]">IH-YYYYAAGG-01</span>{' '}
                  kodları, sabah bildirimleri ve komisyon başında tek dokunuşla onaylı PDF erişimi.
                </p>
              </div>
            </div>

            <div className="py-4 flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-[#143252] border border-[#1E4A75] flex items-center justify-center shrink-0">
                <Briefcase className="w-4 h-4 text-[#34D399]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Proje Yönetimi ve Maliyet Muhasebesi
                </h3>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                  Kazanılan ihalelere atanan proje yöneticileriyle hakediş, gelen/kesilen fatura ve
                  proje kârlılık takibi.
                </p>
              </div>
            </div>

            <div className="py-4 flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-[#143252] border border-[#1E4A75] flex items-center justify-center shrink-0">
                <Calculator className="w-4 h-4 text-[#00AEEF]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Ön Muhasebe, Çek Portföyü ve PDF Fatura Okuma
                </h3>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                  PDF fatura yüklemeyle otomatik cari/ürün kaydı, çek vade takibi, KDV ve Kurumlar
                  Vergisi raporlaması.
                </p>
              </div>
            </div>

            <div className="py-4 last:pb-0 flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-[#143252] border border-[#1E4A75] flex items-center justify-center shrink-0">
                <FolderLock className="w-4 h-4 text-[#34D399]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Kurumsal Evrak Kasası ve Rol Yetkilendirme
                </h3>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                  İmza sirküleri, vergi levhası ve teminat belgeleri için geçerlilik süresi izlemeli
                  güvenli kasa ve yönetici onay kapısı.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#183B5E] flex items-center justify-between gap-4 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#34D399]" />
              <span>Rol Tabanlı Erişim Kontrolü (RBAC)</span>
            </span>
            <span className="font-mono text-[11px] text-slate-400">TINIATECH®</span>
          </div>
        </section>
      </main>

      <footer className="w-full max-w-6xl mx-auto px-6 py-5 border-t border-[#DCE3EC] flex flex-wrap items-center justify-between gap-4 text-xs text-[#4E5D6C]">
        <span>© {new Date().getFullYear()} Tiniatech® · İhaleKasa Kurumsal Yönetim Platformu</span>
        <span>Masaüstü ve Mobil Tarayıcılarla Tam Uyumlu</span>
      </footer>
    </div>
  );
};
