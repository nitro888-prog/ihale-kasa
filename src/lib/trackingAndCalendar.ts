import { CurrencyCode, SCHEMA_LIMITS, Tender } from '../types/tender';

export function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * Takvim tarihine senkronize İhale Takip Numarası üretir: IH-YYYYMMDD-01
 */
export function generateSyncedTrackingCode(
  tenderDate: string,
  existingTenders: Tender[],
  excludeTenderId?: string
): string {
  const compactDate = (tenderDate || getTodayDateStr()).replace(/-/g, '');
  const prefix = `IH-${compactDate}-`;
  const usedSequences = new Set<number>();

  for (const t of existingTenders) {
    if (excludeTenderId && t.id === excludeTenderId) continue;
    if (t.trackingCode.startsWith(prefix)) {
      const seqPart = Number(t.trackingCode.slice(prefix.length));
      if (!Number.isNaN(seqPart) && seqPart > 0) {
        usedSequences.add(seqPart);
      }
    }
  }

  let nextSeq = 1;
  while (usedSequences.has(nextSeq)) {
    nextSeq += 1;
  }
  return `${prefix}${String(nextSeq).padStart(2, '0')}`;
}

/**
 * İhale tarihi takvimde değiştirildiğinde takip numarasını yeni tarihle otomatik senkronize eder.
 */
export function syncTrackingCodeWithDate(
  currentCode: string,
  newDate: string,
  existingTenders: Tender[],
  excludeTenderId?: string
): string {
  const compactDate = newDate.replace(/-/g, '');
  const targetPrefix = `IH-${compactDate}-`;
  if (currentCode.startsWith(targetPrefix)) {
    return currentCode;
  }
  return generateSyncedTrackingCode(newDate, existingTenders, excludeTenderId);
}

const TURKISH_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const TURKISH_DAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function getMonthTitle(year: number, monthIndex: number): string {
  return `${TURKISH_MONTHS[monthIndex]} ${year}`;
}

export function getTurkishDayHeaders(): string[] {
  return TURKISH_DAYS_SHORT;
}

export interface CalendarCell {
  dateStr: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

/**
 * Pazartesi başlangıçlı aylık takvim ızgarası (42 hücre)
 */
export function getMonthGrid(year: number, monthIndex: number): CalendarCell[] {
  const firstDay = new Date(year, monthIndex, 1);
  // JS Sunday=0..Saturday=6 -> Monday=0..Sunday=6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, monthIndex, 1 - startOffset);
  const todayStr = getTodayDateStr();

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    cells.push({
      dateStr,
      dayNumber: d.getDate(),
      inCurrentMonth: d.getMonth() === monthIndex,
      isToday: dateStr === todayStr,
    });
  }
  return cells;
}

export function formatTurkishDate(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${TURKISH_MONTHS[(m || 1) - 1]} ${y}`;
}

export function formatTurkishDayMonth(dateStr: string): { day: number; monthShort: string; weekday: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const weekdayIdx = (dt.getDay() + 6) % 7;
  return {
    day: d,
    monthShort: TURKISH_MONTHS[(m || 1) - 1].slice(0, 3),
    weekday: TURKISH_DAYS_SHORT[weekdayIdx],
  };
}

export function getDaysDifference(dateStr: string): number {
  const today = getTodayDateStr();
  const [ty, tm, td] = today.split('-').map(Number);
  const [y, m, d] = dateStr.split('-').map(Number);
  const tUtc = Date.UTC(ty, tm - 1, td);
  const dUtc = Date.UTC(y, m - 1, d);
  return Math.round((dUtc - tUtc) / (1000 * 60 * 60 * 24));
}

export function getRelativeDayLabel(dateStr: string): string {
  const diff = getDaysDifference(dateStr);
  if (diff === 0) return 'Bugün İhale Günü';
  if (diff === 1) return 'Yarın';
  if (diff === -1) return 'Dün';
  if (diff > 1) return `${diff} gün kaldı`;
  return `${Math.abs(diff)} gün geçti`;
}

export function formatCurrency(amount: number, currency: CurrencyCode): string {
  const symbols: Record<CurrencyCode, string> = { TRY: '₺', USD: '$', EUR: '€' };
  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount || 0);
  return `${formatted} ${symbols[currency] || '₺'}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeIcsText(val: string): string {
  return (val || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatIcsDateTime(dateStr: string, timeStr: string, addHours = 0): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '10:00').split(':').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, (hh || 10) + addHours, mm || 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
}

function buildIcsEventBlock(tender: Tender, companyName?: string): string {
  const dtStart = formatIcsDateTime(tender.tenderDate, tender.tenderTime, 0);
  const dtEnd = formatIcsDateTime(tender.tenderDate, tender.tenderTime, 1);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const summary = `[${tender.trackingCode}] ${tender.title}`;
  const description = [
    `Takip No: ${tender.trackingCode}`,
    tender.ikn ? `İKN: ${tender.ikn}` : '',
    `İhale Makamı: ${tender.authority}`,
    companyName ? `Katılımcı Firma: ${companyName}` : '',
    tender.notes ? `Notlar: ${tender.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return [
    'BEGIN:VEVENT',
    `UID:${tender.id}@ihalekasa.app`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(tender.location || tender.authority)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`${tender.trackingCode} ihalesine 24 saat kaldı`)}`,
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`${tender.trackingCode} ihalesine 2 saat kaldı - Evraklarınızı kontrol edin`)}`,
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n');
}

export function downloadTenderICS(tender: Tender, companyName?: string): void {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IhaleKasa//Kurumsal Ihale Takip//TR',
    'CALSCALE:GREGORIAN',
    buildIcsEventBlock(tender, companyName),
    'END:VCALENDAR',
  ].join('\r\n');
  const safeName = (tender.trackingCode || 'ihale').replace(/[^a-zA-Z0-9._-]+/g, '_');
  triggerTextFileDownload(ics, `${safeName}.ics`, 'text/calendar;charset=utf-8');
}

export function downloadAllTendersICS(tenders: Tender[], companyName?: string): void {
  const active = tenders.filter((t) => t.status !== 'iptal');
  const events = active.map((t) => buildIcsEventBlock(t, companyName)).join('\r\n');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IhaleKasa//Kurumsal Ihale Takip//TR',
    'CALSCALE:GREGORIAN',
    events,
    'END:VCALENDAR',
  ].join('\r\n');
  triggerTextFileDownload(ics, `ihalekasa-takvim-${getTodayDateStr()}.ics`, 'text/calendar;charset=utf-8');
}

export function getGoogleCalendarUrl(tender: Tender): string {
  const start = formatIcsDateTime(tender.tenderDate, tender.tenderTime, 0);
  const end = formatIcsDateTime(tender.tenderDate, tender.tenderTime, 1);
  const title = `[${tender.trackingCode}] ${tender.title}`;
  const details = [
    `Takvim Takip No: ${tender.trackingCode}`,
    tender.ikn ? `Resmi İKN: ${tender.ikn}` : '',
    `Kurum: ${tender.authority}`,
    tender.notes ? `Notlar: ${tender.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details,
    location: tender.location || tender.authority,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function triggerTextFileDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encodeFileToChunks(file: File): Promise<{
  chunks: string[];
  sha256: string;
  mimeType: string;
  sizeBytes: number;
}> {
  if (file.size <= 0) {
    throw new Error('Boş dosya yüklenemez.');
  }
  if (file.size > SCHEMA_LIMITS.MAX_FILE_BYTES) {
    throw new Error(`Dosya boyutu en fazla ${formatBytes(SCHEMA_LIMITS.MAX_FILE_BYTES)} olabilir.`);
  }
  const buffer = await file.arrayBuffer();
  const sha256 = await computeSha256(buffer);
  const base64 = arrayBufferToBase64(buffer);
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += SCHEMA_LIMITS.CHUNK_CHAR_SIZE) {
    chunks.push(base64.slice(i, i + SCHEMA_LIMITS.CHUNK_CHAR_SIZE));
  }
  return {
    chunks,
    sha256,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  };
}

export function assembleChunksToBlob(chunks: string[], mimeType: string): Blob {
  const combinedBase64 = chunks.join('');
  const bytes = base64ToUint8Array(combinedBase64);
  return new Blob([bytes as unknown as BlobPart], { type: mimeType || 'application/octet-stream' });
}
