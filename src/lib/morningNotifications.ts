import { Tender } from '../types/tender';
import { getTodayDateStr } from './trackingAndCalendar';

export interface NotificationPrefs {
  enabled: boolean;
  morningTime: string; // HH:mm e.g. '08:00'
}

const DEFAULT_PREFS: NotificationPrefs = {
  enabled: true,
  morningTime: '08:00',
};

function getPrefsKey(uid: string): string {
  return `ihalekasa_notif_prefs_${uid}`;
}

function getNotifiedKey(uid: string, tenderId: string, tenderDate: string): string {
  return `ihalekasa_morning_alert_${uid}_${tenderId}_${tenderDate}`;
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function loadNotificationPrefs(uid: string): NotificationPrefs {
  try {
    const raw = localStorage.getItem(getPrefsKey(uid));
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
      morningTime:
        typeof parsed.morningTime === 'string' && /^\d{2}:\d{2}$/.test(parsed.morningTime)
          ? parsed.morningTime
          : '08:00',
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveNotificationPrefs(uid: string, prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(getPrefsKey(uid), JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export function hasNotifiedTenderMorning(
  uid: string,
  tenderId: string,
  tenderDate: string
): boolean {
  try {
    return localStorage.getItem(getNotifiedKey(uid, tenderId, tenderDate)) === '1';
  } catch {
    return false;
  }
}

export function markNotifiedTenderMorning(
  uid: string,
  tenderId: string,
  tenderDate: string
): void {
  try {
    localStorage.setItem(getNotifiedKey(uid, tenderId, tenderDate), '1');
  } catch {
    // Ignore storage errors
  }
}

export function clearNotifiedTenderMorningForToday(uid: string, tenders: Tender[]): void {
  const today = getTodayDateStr();
  try {
    for (const t of tenders) {
      if (t.tenderDate === today) {
        localStorage.removeItem(getNotifiedKey(uid, t.id, t.tenderDate));
      }
    }
  } catch {
    // Ignore
  }
}

function parseMinutes(hhmm: string): number {
  const [hh, mm] = (hhmm || '08:00').split(':').map(Number);
  return (hh || 8) * 60 + (mm || 0);
}

/**
 * Son teslim / ihale günü sabahı tetiklenmesi gereken ve henüz bildirilmemiş ihaleleri döndürür.
 */
export function getDueMorningAlerts(
  uid: string,
  tenders: Tender[],
  prefs: NotificationPrefs,
  now: Date = new Date()
): Tender[] {
  if (!prefs.enabled) return [];
  const todayStr = getTodayDateStr();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = parseMinutes(prefs.morningTime);

  if (nowMinutes < targetMinutes) {
    return [];
  }

  return tenders.filter(
    (t) =>
      t.tenderDate === todayStr &&
      t.status !== 'iptal' &&
      t.status !== 'sonuclandi' &&
      !hasNotifiedTenderMorning(uid, t.id, t.tenderDate)
  );
}

/**
 * Bir sonraki yaklaşan ihalenin sabah bildirim zamanına kalan süreyi (ms) hesaplar.
 */
export function getNextMorningTriggerDelayMs(
  uid: string,
  tenders: Tender[],
  prefs: NotificationPrefs,
  now: Date = new Date()
): number | null {
  if (!prefs.enabled) return null;
  const todayStr = getTodayDateStr();
  const [hh, mm] = (prefs.morningTime || '08:00').split(':').map(Number);

  let earliestMs: number | null = null;
  for (const t of tenders) {
    if (t.status === 'iptal' || t.status === 'sonuclandi') continue;
    if (t.tenderDate < todayStr) continue;
    if (hasNotifiedTenderMorning(uid, t.id, t.tenderDate)) continue;

    const [y, m, d] = t.tenderDate.split('-').map(Number);
    const triggerAt = new Date(y, (m || 1) - 1, d || 1, hh || 8, mm || 0, 0, 0);
    const diff = Math.max(0, triggerAt.getTime() - now.getTime());
    if (earliestMs === null || diff < earliestMs) {
      earliestMs = diff;
    }
  }

  if (earliestMs === null) return null;
  // Cap setTimeout under 24h (86,400,000 ms) so long-future tenders re-check safely
  return Math.min(earliestMs, 12 * 60 * 60 * 1000);
}

export function dispatchBrowserNotification(
  tender: Tender,
  onClick?: (tenderId: string) => void
): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }
  try {
    const notification = new Notification(
      `İhale Günü Hatırlatması · ${tender.trackingCode}`,
      {
        body: `${tender.title} — ${tender.authority} (Saat ${tender.tenderTime})`,
        tag: `ihalekasa-${tender.id}-${tender.tenderDate}`,
        requireInteraction: true,
      }
    );
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignore
      }
      if (onClick) onClick(tender.id);
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}

export function dispatchTestBrowserNotification(sampleTender?: Tender): boolean {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }
  try {
    const title = sampleTender
      ? `Test Bildirimi · ${sampleTender.trackingCode}`
      : 'İhaleKasa · Sabah Bildirimi Testi';
    const body = sampleTender
      ? `${sampleTender.title} ihalesi için sabah hatırlatması aktif.`
      : 'İhale günü sabah saatinde tarayıcı bildirimleriniz bu şekilde görüntülenecektir.';
    const notification = new Notification(title, {
      body,
      tag: 'ihalekasa-test-notification',
    });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // Ignore
      }
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}
