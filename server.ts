import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth, type DecodedIdToken } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

function loadFirebaseProjectId(): string {
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('firebase-applet-config.json bulunamadı.');
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as { projectId?: string };
  const projectId = (parsed.projectId || '').trim();
  if (!projectId || projectId === 'remixed-project-id') {
    throw new Error('Geçerli Firebase projectId yapılandırılmamış.');
  }
  return projectId;
}

const firebaseAdminApp = getApps().length
  ? getApp()
  : initializeApp({ projectId: loadFirebaseProjectId() });
const firebaseAdminAuth = getAdminAuth(firebaseAdminApp);

interface AuthenticatedRequest extends express.Request {
  firebaseUser?: DecodedIdToken;
}

const RATE_LIMIT_MINUTE_MS = 60 * 1000;
const RATE_LIMIT_HOUR_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = Math.max(
  1,
  Number(process.env.GEMINI_RATE_LIMIT_PER_MINUTE) || 8
);
const MAX_REQUESTS_PER_HOUR = Math.max(
  MAX_REQUESTS_PER_MINUTE,
  Number(process.env.GEMINI_RATE_LIMIT_PER_HOUR) || 40
);
const MAX_GEMINI_BASE64_LENGTH = 15_000_000; // ~11 MB binary payload
const ALLOWED_GEMINI_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/csv',
]);

// In-memory per-user sliding window store keyed strictly by verified Firebase UID
const userRequestTimestamps = new Map<string, number[]>();
let lastRateCleanupAt = Date.now();

function cleanupStaleRateEntries(now: number) {
  if (now - lastRateCleanupAt < 5 * 60 * 1000) return;
  lastRateCleanupAt = now;
  const cutoff = now - RATE_LIMIT_HOUR_MS;
  for (const [uid, timestamps] of userRequestTimestamps.entries()) {
    const active = timestamps.filter((ts) => ts > cutoff);
    if (active.length === 0) {
      userRequestTimestamps.delete(uid);
    } else {
      userRequestTimestamps.set(uid, active);
    }
  }
}

async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Oturum doğrulaması gerekli. Lütfen uygulamaya giriş yapıp tekrar deneyin.',
    });
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken || idToken.length > 8192) {
    return res.status(401).json({
      error: 'Geçersiz yetkilendirme jetonu.',
    });
  }

  try {
    const decoded = await firebaseAdminAuth.verifyIdToken(idToken);
    if (!decoded.uid || decoded.email_verified !== true) {
      return res.status(403).json({
        error: 'E-posta doğrulaması yapılmış aktif bir kullanıcı hesabı gereklidir.',
      });
    }
    req.firebaseUser = decoded;
    return next();
  } catch (err) {
    console.warn(
      'Firebase ID token verification failed:',
      err instanceof Error ? err.message : String(err)
    );
    return res.status(401).json({
      error: 'Oturum jetonu geçersiz veya süresi dolmuş. Lütfen sayfayı yenileyip tekrar deneyin.',
    });
  }
}

function geminiRateLimit(
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const uid = req.firebaseUser?.uid;
  if (!uid) {
    return res.status(401).json({ error: 'Kimlik doğrulaması gerekli.' });
  }

  const now = Date.now();
  cleanupStaleRateEntries(now);

  const hourCutoff = now - RATE_LIMIT_HOUR_MS;
  const minuteCutoff = now - RATE_LIMIT_MINUTE_MS;
  const recent = (userRequestTimestamps.get(uid) || []).filter((ts) => ts > hourCutoff);
  const lastMinute = recent.filter((ts) => ts > minuteCutoff);

  if (lastMinute.length >= MAX_REQUESTS_PER_MINUTE) {
    const oldestInMinute = lastMinute[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldestInMinute + RATE_LIMIT_MINUTE_MS - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS_PER_MINUTE));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader(
      'X-RateLimit-Reset',
      String(Math.ceil((oldestInMinute + RATE_LIMIT_MINUTE_MS) / 1000))
    );
    return res.status(429).json({
      error: `Dakikada en fazla ${MAX_REQUESTS_PER_MINUTE} yapay zeka analizi çalıştırabilirsiniz. Lütfen ${retryAfterSec} saniye sonra tekrar deneyin.`,
    });
  }

  if (recent.length >= MAX_REQUESTS_PER_HOUR) {
    const oldestInHour = recent[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldestInHour + RATE_LIMIT_HOUR_MS - now) / 1000));
    const retryAfterMin = Math.max(1, Math.ceil(retryAfterSec / 60));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS_PER_HOUR));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader(
      'X-RateLimit-Reset',
      String(Math.ceil((oldestInHour + RATE_LIMIT_HOUR_MS) / 1000))
    );
    return res.status(429).json({
      error: `Saatlik yapay zeka analiz limitinize (${MAX_REQUESTS_PER_HOUR} istek/saat) ulaşıldı. Lütfen yaklaşık ${retryAfterMin} dakika sonra tekrar deneyin.`,
    });
  }

  recent.push(now);
  userRequestTimestamps.set(uid, recent);

  const remainingMinute = Math.max(0, MAX_REQUESTS_PER_MINUTE - (lastMinute.length + 1));
  res.setHeader('X-RateLimit-Limit', String(MAX_REQUESTS_PER_MINUTE));
  res.setHeader('X-RateLimit-Remaining', String(remainingMinute));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil((now + RATE_LIMIT_MINUTE_MS) / 1000)));
  return next();
}

function normalizeAttachmentMime(mimeType?: string, fileName?: string): string {
  const raw = (mimeType || '').trim().toLowerCase().split(';')[0];
  const lowerName = (fileName || '').trim().toLowerCase();

  if (
    raw === 'application/pdf' ||
    raw === 'application/x-pdf' ||
    raw === 'application/acrobat' ||
    raw === 'application/vnd.pdf'
  ) {
    return 'application/pdf';
  }
  if (raw === 'image/jpg' || raw === 'image/pjpeg') {
    return 'image/jpeg';
  }
  if (raw === 'image/png' || raw === 'image/jpeg' || raw === 'image/webp' || raw === 'image/gif') {
    return raw;
  }
  if (raw === 'text/plain' || raw === 'text/csv') {
    return raw;
  }

  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.gif')) return 'image/gif';

  return raw;
}

function cleanAttachmentBase64(fileBase64: string): string {
  let clean = fileBase64.trim();
  const dataPrefixIdx = clean.indexOf('base64,');
  if (clean.startsWith('data:') && dataPrefixIdx >= 0) {
    clean = clean.slice(dataPrefixIdx + 'base64,'.length);
  }
  return clean.replace(/\s+/g, '');
}

function validateBinaryAttachment(
  fileBase64?: string,
  mimeType?: string,
  fileName?: string
): { valid: boolean; error?: string; cleanMime?: string; cleanBase64?: string } {
  if (!fileBase64 || (!mimeType && !fileName)) {
    return { valid: true };
  }
  const cleanMime = normalizeAttachmentMime(mimeType, fileName);
  if (!ALLOWED_GEMINI_MIME_TYPES.has(cleanMime)) {
    return {
      valid: false,
      error: 'Desteklenmeyen dosya türü. Yalnızca PDF, görsel (PNG/JPG/WEBP) veya metin dosyaları analiz edilebilir.',
    };
  }
  const cleanBase64 = cleanAttachmentBase64(fileBase64);
  if (!cleanBase64) {
    return {
      valid: false,
      error: 'Yüklenen dosya içeriği boş görünüyor.',
    };
  }
  if (cleanBase64.length > MAX_GEMINI_BASE64_LENGTH) {
    return {
      valid: false,
      error: 'Yüklenen dosya boyutu sunucu analiz sınırını (10 MB) aşıyor.',
    };
  }
  return { valid: true, cleanMime, cleanBase64 };
}

function extractGeminiJson(rawText: string | undefined): Record<string, unknown> {
  const trimmed = (rawText ?? '').trim();
  if (!trimmed) {
    throw new Error('EMPTY_GEMINI_RESPONSE');
  }
  let candidate = trimmed;
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced && fenced[1]) {
    candidate = fenced[1].trim();
  }
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    }
    throw new Error('INVALID_GEMINI_JSON');
  }
}

interface AnalyzeRequestBody {
  text?: string;
  tenderTitle?: string;
  trackingCode?: string;
  fileBase64?: string;
  mimeType?: string;
  fileName?: string;
  preferenceNote?: string;
}

interface ParseInvoicePdfBody {
  fileBase64?: string;
  mimeType?: string;
  fileName?: string;
  ownCompanyName?: string;
  ownTaxNumber?: string;
  preferredDirection?: 'auto' | 'alis_faturasi' | 'satis_faturasi';
}

function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateGeminiWithRetry(
  ai: GoogleGenAI,
  request: Parameters<typeof ai.models.generateContent>[0],
  maxAttempts = 3
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
return await ai.models.generateContent(request);
    } catch (err) {
lastError = err;

const message = err instanceof Error ? err.message : String(err);
const upper = message.toUpperCase();

const isTemporary =
  message.includes('503') ||
  message.includes('504') ||
  upper.includes('UNAVAILABLE') ||
  upper.includes('DEADLINE_EXCEEDED') ||
  upper.includes('TIMEOUT');

if (!isTemporary || attempt === maxAttempts) {
  throw err;
}

const delay = attempt * 2000;
console.warn(
  `Gemini geçici hata verdi. ${attempt}/${maxAttempts} deneme. ${delay} ms sonra tekrar denenecek.`
);

await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

function handleGeminiRouteError(res: express.Response, err: unknown, fallbackMessage: string) {
  console.error('Gemini API error:', err);
  try {
  const errorDetails = {
    time: new Date().toISOString(),
    name: err instanceof Error ? err.name : 'UnknownError',
    message: err instanceof Error ? err.message : String(err),
    status: (err as any)?.status || (err as any)?.statusCode || null,
    code: (err as any)?.code || null,
  };

  fs.appendFileSync(
    path.join(__dirname, 'gemini-errors.log'),
    JSON.stringify(errorDetails) + '\n',
    'utf8'
  );
} catch (logError) {
  console.error('Gemini error log could not be written:', logError);
}
  const message = err instanceof Error ? err.message : String(err);
  const upper = message.toUpperCase();

  if (
    message.includes('403') ||
    upper.includes('API_KEY_INVALID') ||
    upper.includes('PERMISSION_DENIED')
  ) {
    return res.status(403).json({
      error:
        'Gemini API anahtarı doğrulanamadı. Lütfen Ayarlar > Gizli Anahtarlar panelinden anahtarınızı kontrol edin.',
    });
  }
  if (message.includes('429') || upper.includes('RESOURCE_EXHAUSTED')) {
    return res.status(429).json({
      error: 'Gemini API kota sınırına ulaşıldı. Lütfen biraz sonra tekrar deneyin.',
    });
  }
  if (
    message.includes('400') ||
    upper.includes('INVALID_ARGUMENT') ||
    upper.includes('PASSWORD') ||
    upper.includes('ENCRYPTED') ||
    upper.includes('UNABLE TO PROCESS INPUT')
  ) {
    return res.status(400).json({
      error:
        'Yüklenen PDF veya görsel okunamadı. Dosya şifreli, bozuk ya da desteklenmeyen formatta olabilir.',
    });
  }
  if (
    message.includes('503') ||
    message.includes('504') ||
    upper.includes('UNAVAILABLE') ||
    upper.includes('DEADLINE_EXCEEDED') ||
    upper.includes('TIMEOUT')
  ) {
    return res.status(503).json({
      error:
        'Yapay zeka çözümleme servisi şu anda yoğun veya yanıt süresi aşıldı. Lütfen birkaç saniye sonra tekrar deneyin.',
    });
  }
  if (message === 'EMPTY_GEMINI_RESPONSE' || message === 'INVALID_GEMINI_JSON') {
    return res.status(502).json({
      error: fallbackMessage,
    });
  }
  return res.status(500).json({ error: fallbackMessage });
}

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '20mb' }));

  // Hosting alt dizininden gelen API isteklerini karşıla.
  app.use((req, res, next) => {
    if (/^\/ihale\/api(?:\/|$)/.test(req.url)) {
      req.url = req.url.replace(/^\/ihale/, '');
    }
    next();
  });

  app.post(
    '/api/tenders/analyze-document',
    requireFirebaseAuth,
    geminiRateLimit,
    documentUpload.single('file'),
    async (req, res) => {
    try {
      const body = (req.body || {}) as AnalyzeRequestBody;
      const uploadedFile = (req as express.Request & { file?: Express.Multer.File }).file;
      const text = body.text;
      const tenderTitle = body.tenderTitle;
      const trackingCode = body.trackingCode;
      const fileBase64 = uploadedFile
        ? uploadedFile.buffer.toString('base64')
        : body.fileBase64;
      const fileName = uploadedFile ? uploadedFile.originalname : body.fileName;
      const mimeType = uploadedFile ? uploadedFile.mimetype : body.mimeType;

      const trimmedText = typeof text === 'string' ? text.trim() : '';
      const hasFile = typeof fileBase64 === 'string' && fileBase64.trim().length > 0;

      if (!trimmedText && !hasFile) {
        return res.status(400).json({
          error:
            'Analiz için lütfen ihale doküman metni girin veya kasadan uygun bir dosya seçin.',
        });
      }

      const attachmentCheck = hasFile
        ? validateBinaryAttachment(fileBase64, mimeType || 'application/pdf', fileName)
        : { valid: true };
      if (!attachmentCheck.valid) {
        return res.status(400).json({ error: attachmentCheck.error });
      }

      const apiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey) {
        return res.status(500).json({
          error:
            'GEMINI_API_KEY ortam değişkeni tanımlı değil. Lütfen Ayarlar > Gizli Anahtarlar panelini kontrol edin.',
        });
      }

      const ai = createGeminiClient(apiKey);

      const contextHeader = [
        trackingCode ? `İhale Takip Kodu: ${trackingCode}` : '',
        tenderTitle ? `İhale Konusu: ${tenderTitle}` : '',
        fileName ? `Doküman Adı: ${fileName}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const promptParts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (hasFile && attachmentCheck.cleanBase64 && attachmentCheck.cleanMime) {
        promptParts.push({
          inlineData: {
            mimeType: attachmentCheck.cleanMime,
            data: attachmentCheck.cleanBase64,
          },
        });
      }

      const instructionPrompt = [
        contextHeader,
        'Aşağıdaki ihale dokümanını / şartname metnini analiz et:',
        '1) Kısa ve net bir yönetici özeti oluştur (kapsam, yeterlik şartları, teminat ve teslim usulü).',
        '2) Metinde geçen TÜM önemli tarihleri ve süreleri (teklif sunum son tarihi/saati, geçici teminat son/vade tarihi, zeyilname/açıklama isteme son günü, yer görme, sözleşme veya iş bitim süreleri) tespit et ve importance alanını "kritik", "yuksek" veya "bilgi" olarak işaretle.',
        '3) En kritik şartname koşullarını (geçici teminat oranı/tutarı, iş deneyim oranı, teslim/ceza koşulları) maddeler halinde çıkar.',
        trimmedText ? `\n--- DOKÜMAN METNİ ---\n${trimmedText.slice(0, 60000)}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      promptParts.push({ text: instructionPrompt });

      const response = await generateGeminiWithRetry(ai, {
        model: 'gemini-4-hydrogen',
        contents: { parts: promptParts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'Sen 4734 sayılı Kamu İhale Kanunu ve ticari ihale şartnameleri konusunda uzman bir Türk ihale analiz uzmanısın. Yanıtlarını her zaman Türkçe, net, somut ve profesyonel bir dille ver. Tarihleri metinde geçtiği şekliyle eksiksiz çıkar.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'İhale dokümanının kapsamlı ancak öz Türkçe özeti.',
              },
              criticalDates: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: {
                      type: Type.STRING,
                      description:
                        'Tarihin türü (örn: Teklif Sunum Son Tarihi, Geçici Teminat Son Tarihi)',
                    },
                    dateText: {
                      type: Type.STRING,
                      description: 'Tespit edilen tarih, saat veya süre ifadesi',
                    },
                    isoDate: {
                      type: Type.STRING,
                      description: 'Belirlenebiliyorsa YYYY-MM-DD formatında tarih, yoksa boş string',
                    },
                    importance: {
                      type: Type.STRING,
                      description: 'Önem derecesi: kritik, yuksek veya bilgi',
                    },
                    excerpt: {
                      type: Type.STRING,
                      description: 'Dokümandaki ilgili kısa açıklama veya dayanak cümle',
                    },
                  },
                  required: ['label', 'dateText', 'isoDate', 'importance', 'excerpt'],
                },
              },
              keyRequirements: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: {
                      type: Type.STRING,
                      description: 'Şartname gereksinimi başlığı',
                    },
                    detail: {
                      type: Type.STRING,
                      description: 'Şartname gereksiniminin detayı',
                    },
                  },
                  required: ['title', 'detail'],
                },
              },
            },
            required: ['summary', 'criticalDates', 'keyRequirements'],
          },
        },
      });

      const parsed = extractGeminiJson(response.text);
      return res.json(parsed);
    } catch (err) {
      return handleGeminiRouteError(
        res,
        err,
        'Doküman analizi sırasında bir hata oluştu. Lütfen metni veya dosyayı kontrol edip tekrar deneyin.'
      );
    }
  });

  app.post(
    '/api/tenders/analyze-products',
    requireFirebaseAuth,
    geminiRateLimit,
    documentUpload.single('file'),
    async (req, res) => {
    try {
      const body = (req.body || {}) as AnalyzeRequestBody;
      const uploadedFile = (req as express.Request & { file?: Express.Multer.File }).file;
      const text = body.text;
      const tenderTitle = body.tenderTitle;
      const trackingCode = body.trackingCode;
      const preferenceNote = body.preferenceNote;
      const fileBase64 = uploadedFile
        ? uploadedFile.buffer.toString('base64')
        : body.fileBase64;
      const fileName = uploadedFile ? uploadedFile.originalname : body.fileName;
      const mimeType = uploadedFile ? uploadedFile.mimetype : body.mimeType;

      const trimmedText = typeof text === 'string' ? text.trim() : '';
      const trimmedPref = typeof preferenceNote === 'string' ? preferenceNote.trim() : '';
      const hasFile = typeof fileBase64 === 'string' && fileBase64.trim().length > 0;

      if (!trimmedText && !hasFile) {
        return res.status(400).json({
          error:
            'Ürün ve marka/model analizi için lütfen teknik şartname metnini girin veya kasadan bir doküman seçin.',
        });
      }

      const attachmentCheck = hasFile
        ? validateBinaryAttachment(fileBase64, mimeType || 'application/pdf', fileName)
        : { valid: true };
      if (!attachmentCheck.valid) {
        return res.status(400).json({ error: attachmentCheck.error });
      }

      const apiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey) {
        return res.status(500).json({
          error:
            'GEMINI_API_KEY ortam değişkeni tanımlı değil. Lütfen Ayarlar > Gizli Anahtarlar panelini kontrol edin.',
        });
      }

      const ai = createGeminiClient(apiKey);

      const contextHeader = [
        trackingCode ? `İhale Takip Kodu: ${trackingCode}` : '',
        tenderTitle ? `İhale Konusu: ${tenderTitle}` : '',
        fileName ? `Doküman Adı: ${fileName}` : '',
        trimmedPref ? `Firma Tercihi / Kısıt Notu: ${trimmedPref}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const promptParts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (hasFile && attachmentCheck.cleanBase64 && attachmentCheck.cleanMime) {
        promptParts.push({
          inlineData: {
            mimeType: attachmentCheck.cleanMime,
            data: attachmentCheck.cleanBase64,
          },
        });
      }

      const instructionPrompt = [
        contextHeader,
        'Aşağıdaki teknik şartnameyi veya alım listesini ürün/kalem bazında incele:',
        '1) Alıma çıkılan tüm ürünleri/ekipman kalemlerini (varsa miktar ve birim bilgisiyle) ayrı ayrı tespit et.',
        '2) Her kalem için şartnamede istenen teknik parametreleri (kapasite, güç, voltaj, verimlilik, malzeme, koruma sınıfı, standartlar, sertifikalar vb.) ve teklif aşamasında eleme riski taşıyan kritik teknik kriterleri çıkar.',
        '3) Her ürün kalemi için, bu teknik özellikleri karşılayan 2 ila 4 gerçek ve piyasada bulunabilir MARKA ve MODEL/SERİ önerisi sun. Varsa katalog/seri/parça numarası ipucunu ekle.',
        '4) Her öneri için segmentini (örn: "Premium / OEM", "Fiyat-Performans", "Yerli Üretim"), şartname uyum düzeyini ("Tam Uyumlu", "Yüksek Uyum", "Opsiyon/Aksesuar Gerekebilir"), gerekçesini ve teklif öncesi üretici datasheet üzerinden teyit edilmesi gereken noktaları belirt.',
        '5) Genel teknik uyumluluk ve muadil ("veya dengi") sunum tavsiyeleri ver. Uydurma veya belirsiz model kodları verme; emin olduğun gerçek ürün ailelerini ve serilerini öner.',
        trimmedText ? `\n--- TEKNİK ŞARTNAME / ÜRÜN ÖZELLİKLERİ ---\n${trimmedText.slice(0, 60000)}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      promptParts.push({ text: instructionPrompt });

      const response = await generateGeminiWithRetry(ai, {
        model: 'gemini-4-hydrogen',
        contents: { parts: promptParts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'Sen 4734 sayılı Kamu İhale Kanunu teknik şartnameleri, endüstriyel/bilişim/medikal/altyapı ürün katalogları ve marka-model eşleştirme konusunda uzman bir kıdemli Türk satınalma ve teklif mühendisisin. Yanıtlarını her zaman Türkçe, teknik olarak tutarlı, gerçek üretici serilerine dayalı ve şeffaf ver; datasheet teyidi gereken kritik nüansları mutlaka uyar.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overview: {
                type: Type.STRING,
                description:
                  'Şartnamede alıma çıkılan ürünlerin genel teknik kapsam ve tedarik değerlendirmesi.',
              },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    itemNo: {
                      type: Type.STRING,
                      description: 'Kalem numarası veya kodu (örn: Kalem 1)',
                    },
                    productName: {
                      type: Type.STRING,
                      description: 'Alıma çıkılan ürün / ekipman / malzeme adı',
                    },
                    quantityAndUnit: {
                      type: Type.STRING,
                      description: 'Miktar ve birim (örn: 10 Adet, yoksa Belirtilmemiş)',
                    },
                    requiredSpecs: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'Şartnamede talep edilen öne çıkan teknik özellikler',
                    },
                    complianceRisks: {
                      type: Type.STRING,
                      description:
                        'Şartnamede elenmeye yol açabilecek kritik teknik sınırlar veya dikkat edilecek noktalar',
                    },
                    recommendations: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          brand: {
                            type: Type.STRING,
                            description: 'Önerilen üretici marka',
                          },
                          model: {
                            type: Type.STRING,
                            description: 'Önerilen model veya ürün serisi',
                          },
                          partNumberHint: {
                            type: Type.STRING,
                            description: 'Varsa tipik parça / katalog kodu veya seri ön eki',
                          },
                          segment: {
                            type: Type.STRING,
                            description: 'Konumlandırma (örn: Premium / OEM, Fiyat-Performans, Yerli Üretim)',
                          },
                          compatibilityLevel: {
                            type: Type.STRING,
                            description: 'Uyum seviyesi: Tam Uyumlu, Yüksek Uyum veya Opsiyon Gerekebilir',
                          },
                          rationale: {
                            type: Type.STRING,
                            description: 'Teknik özelliklerin bu marka/model ile nasıl karşılandığı',
                          },
                          verificationChecklist: {
                            type: Type.STRING,
                            description: 'Datasheet veya üretici onayıyla mutlaka doğrulanması gereken nokta',
                          },
                        },
                        required: [
                          'brand',
                          'model',
                          'partNumberHint',
                          'segment',
                          'compatibilityLevel',
                          'rationale',
                          'verificationChecklist',
                        ],
                      },
                    },
                  },
                  required: [
                    'itemNo',
                    'productName',
                    'quantityAndUnit',
                    'requiredSpecs',
                    'complianceRisks',
                    'recommendations',
                  ],
                },
              },
              generalRecommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  'Muadil sunum, katalog/test raporu ibrazı ve teknik teklif hazırlığı için genel öneriler',
              },
            },
            required: ['overview', 'items', 'generalRecommendations'],
          },
        },
      });

      const parsed = extractGeminiJson(response.text);
      return res.json(parsed);
    } catch (err) {
      return handleGeminiRouteError(
        res,
        err,
        'Ürün ve marka/model analizi sırasında bir hata oluştu. Lütfen teknik şartname metnini veya dosyayı kontrol edip tekrar deneyin.'
      );
    }
  });

  app.post(
    '/api/accounting/parse-invoice-pdf',
    requireFirebaseAuth,
    geminiRateLimit,
    documentUpload.single('file'),
    async (req, res) => {
    try {
      const body = (req.body || {}) as ParseInvoicePdfBody;
      const uploadedFile = (req as express.Request & { file?: Express.Multer.File }).file;
      const fileBase64 = uploadedFile
        ? uploadedFile.buffer.toString('base64')
        : body.fileBase64;
      const fileName = uploadedFile ? uploadedFile.originalname : body.fileName;
      const mimeType = uploadedFile ? uploadedFile.mimetype : body.mimeType;
      const ownCompanyName = body.ownCompanyName;
      const ownTaxNumber = body.ownTaxNumber;
      const preferredDirection = body.preferredDirection ?? 'auto';

      if (typeof fileBase64 !== 'string' || !fileBase64.trim()) {
        return res.status(400).json({
          error: 'Lütfen çözümlenecek geçerli bir fatura PDF veya görsel dosyası yükleyin.',
        });
      }

      const attachmentCheck = validateBinaryAttachment(fileBase64, mimeType, fileName);
      if (!attachmentCheck.valid || !attachmentCheck.cleanBase64 || !attachmentCheck.cleanMime) {
        return res.status(400).json({
          error:
            attachmentCheck.error ||
            'Lütfen çözümlenecek geçerli bir fatura PDF veya görsel dosyası yükleyin.',
        });
      }

      const apiKey = (process.env.GEMINI_API_KEY || '').trim();
      if (!apiKey) {
        return res.status(500).json({
          error:
            'GEMINI_API_KEY ortam değişkeni tanımlı değil. Lütfen Ayarlar > Gizli Anahtarlar panelini kontrol edin.',
        });
      }

      const ai = createGeminiClient(apiKey);

      const ownContextLines = [
        ownCompanyName ? `Bizim Firmamızın Ünvanı: ${ownCompanyName}` : '',
        ownTaxNumber ? `Bizim Firmamızın Vergi/TC Kimlik No: ${ownTaxNumber}` : '',
        fileName ? `Yüklenen Dosya Adı: ${fileName}` : '',
        preferredDirection === 'alis_faturasi'
          ? 'Kullanıcı Seçimi: Bu fatura BİZE KESİLEN FATURADIR (Alış Faturası). Karşı cari olarak SATICI/DÜZENLEYEN firmayı çıkar.'
          : preferredDirection === 'satis_faturasi'
          ? 'Kullanıcı Seçimi: Bu fatura BİZİM KESTİĞİMİZ FATURADIR (Satış Faturası). Karşı cari olarak ALICI/MÜŞTERİ firmayı çıkar.'
          : 'Yön Tespiti: Otomatik. Yukarıdaki "Bizim Firmamız" bilgileri faturadaki SATICI/DÜZENLEYEN ile eşleşiyorsa detectedDirection="satis_faturasi" yap ve karşı cariye ALICIyı yaz. Eğer ALICI ile eşleşiyorsa (veya bizim firmamız alıcı konumundaysa) detectedDirection="alis_faturasi" yap ve karşı cariye SATICIyı yaz.',
      ]
        .filter(Boolean)
        .join('\n');

      const promptText = [
        ownContextLines,
        'Yukarıdaki e-Fatura / e-Arşiv / Ticari Fatura PDF/görsel belgesini eksiksiz incele ve şu verileri çıkar:',
        '1) Fatura Yönü: "alis_faturasi" (bize kesilen / tedarikçiden gelen fatura) veya "satis_faturasi" (bizim müşteriye/kuruma kestiğimiz fatura).',
        '2) Karşı Cari Firma Bilgileri (counterparty): Ünvan (name), Vergi Dairesi (taxOffice), VKN/TCKN (taxNumber), varsa Yetkili (contactPerson), Telefon (phone), E-posta (email), Adres (address), IBAN (iban).',
        '3) Fatura Üst Bilgileri: Fatura No (invoiceNo), Düzenleme Tarihi YYYY-MM-DD (invoiceDate), varsa Vade/Son Ödeme Tarihi YYYY-MM-DD yoksa "" (dueDate), Para Birimi sadece TRY/USD/EUR (currency - TL ibaresini TRY olarak ver), Ödeme Yöntemi ipucu (paymentMethodHint: banka_havale, nakit, kredi_karti, cek_senet veya vadeli), kısa fatura notu/ETTN/irsaliye bilgisi (notes).',
        '4) Fatura Genel Toplamları (totals): İskonto düşülmüş KDV hariç Mal/Hizmet Matrahı (subtotalAmount), Hesaplanan KDV Toplamı (vatAmount), Vergiler Dahil Ödenecek Genel Toplam (totalAmount).',
        '5) Fatura Kalemleri / Ürünler (items): Faturadaki TÜM ürün/hizmet satırlarını tek tek listele. Her satırda materialName (ürün/hizmet adı), varsa stockNumber (stok/malzeme kodu), varsa partNumber (parça/OEM/üretici kodu/barkod), quantity (sayı), unit (Adet, Kg, Metre, Set, Hizmet vb.), unitPrice (KDV hariç net birim fiyat), vatRate (KDV oranı sayı, örn: 20, 10, 1, 0), subtotalAmount (satır KDV hariç tutar), vatAmount (satır KDV tutarı), totalAmount (satır KDV dahil tutar) alanlarını hesapla.',
        'Tüm sayısal alanlarda Türkçe binlik ayraçlarını kaldır ve ondalık nokta kullanan gerçek sayı döndür. Emin olmadığın metin alanlarını boş string "" bırak; uydurma veri yazma.',
      ].join('\n\n');

      const response = await generateGeminiWithRetry(ai, {
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: attachmentCheck.cleanMime,
                data: attachmentCheck.cleanBase64,
              },
            },
            { text: promptText },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'Sen Türkiye Gelir İdaresi Başkanlığı (GİB) e-Fatura, e-Arşiv Fatura, kamu hakediş faturası ve ticari faturaları çözümleyen uzman bir Türk ön muhasebe ve mali müşavirlik asistanısın. Satıcı ile Alıcıyı kesinlikle birbirine karıştırma; sayıları kuruşu kuruşuna doğru çıkar ve tarihleri YYYY-MM-DD biçimine dönüştür.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedDirection: {
                type: Type.STRING,
                description: 'alis_faturasi veya satis_faturasi',
              },
              invoiceNo: {
                type: Type.STRING,
                description: 'Fatura numarası (örn: ABC2026000000123)',
              },
              invoiceDate: {
                type: Type.STRING,
                description: 'YYYY-MM-DD formatında fatura düzenleme tarihi',
              },
              dueDate: {
                type: Type.STRING,
                description: 'YYYY-MM-DD formatında vade tarihi veya boş string',
              },
              currency: {
                type: Type.STRING,
                description: 'TRY, USD veya EUR',
              },
              paymentMethodHint: {
                type: Type.STRING,
                description: 'banka_havale, nakit, kredi_karti, cek_senet veya vadeli',
              },
              notes: {
                type: Type.STRING,
                description: 'ETTN, irsaliye no veya ödeme açıklaması özeti',
              },
              counterparty: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  taxOffice: { type: Type.STRING },
                  taxNumber: { type: Type.STRING },
                  contactPerson: { type: Type.STRING },
                  phone: { type: Type.STRING },
                  email: { type: Type.STRING },
                  address: { type: Type.STRING },
                  iban: { type: Type.STRING },
                },
                required: [
                  'name',
                  'taxOffice',
                  'taxNumber',
                  'contactPerson',
                  'phone',
                  'email',
                  'address',
                  'iban',
                ],
              },
              totals: {
                type: Type.OBJECT,
                properties: {
                  subtotalAmount: { type: Type.NUMBER },
                  vatAmount: { type: Type.NUMBER },
                  totalAmount: { type: Type.NUMBER },
                },
                required: ['subtotalAmount', 'vatAmount', 'totalAmount'],
              },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    materialName: { type: Type.STRING },
                    stockNumber: { type: Type.STRING },
                    partNumber: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    unitPrice: { type: Type.NUMBER },
                    vatRate: { type: Type.NUMBER },
                    subtotalAmount: { type: Type.NUMBER },
                    vatAmount: { type: Type.NUMBER },
                    totalAmount: { type: Type.NUMBER },
                  },
                  required: [
                    'materialName',
                    'stockNumber',
                    'partNumber',
                    'quantity',
                    'unit',
                    'unitPrice',
                    'vatRate',
                    'subtotalAmount',
                    'vatAmount',
                    'totalAmount',
                  ],
                },
              },
            },
            required: [
              'detectedDirection',
              'invoiceNo',
              'invoiceDate',
              'dueDate',
              'currency',
              'paymentMethodHint',
              'notes',
              'counterparty',
              'totals',
              'items',
            ],
          },
        },
      });

      const parsed = extractGeminiJson(response.text);

      const safeIsoDate = (val: unknown, fallback = ''): string => {
        const s = typeof val === 'string' ? val.trim() : '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const trMatch = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
        if (trMatch) return `${trMatch[3]}-${trMatch[2]}-${trMatch[1]}`;
        return fallback;
      };

      const safeNum = (val: unknown, fallback = 0): number => {
        const n = Number(val);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
      };

      const safeCurrency = (val: unknown): 'TRY' | 'USD' | 'EUR' => {
        const up = String(val ?? '').trim().toUpperCase();
        if (up === 'USD' || up === 'EUR' || up === 'TRY') return up;
        return 'TRY';
      };

      const safeMethod = (
        val: unknown
      ): 'banka_havale' | 'nakit' | 'kredi_karti' | 'cek_senet' | 'vadeli' => {
        const s = String(val ?? '').trim();
        if (
          s === 'banka_havale' ||
          s === 'nakit' ||
          s === 'kredi_karti' ||
          s === 'cek_senet' ||
          s === 'vadeli'
        ) {
          return s;
        }
        return 'banka_havale';
      };

      const rawDirection =
        preferredDirection === 'alis_faturasi' || preferredDirection === 'satis_faturasi'
          ? preferredDirection
          : parsed.detectedDirection === 'satis_faturasi'
          ? 'satis_faturasi'
          : 'alis_faturasi';

      const cp = (parsed.counterparty || {}) as Record<string, unknown>;
      const totalsObj = (parsed.totals || {}) as Record<string, unknown>;
      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];

      const todayIso = new Date().toISOString().slice(0, 10);

      const normalizedItems = rawItems
        .map((it) => {
          const item = (it || {}) as Record<string, unknown>;
          const quantity = safeNum(item.quantity, 1) || 1;
          const unitPrice = safeNum(item.unitPrice, 0);
          const vatRate = Math.min(100, safeNum(item.vatRate, 20));
          let subtotalAmount = safeNum(item.subtotalAmount, 0);
          if (subtotalAmount === 0 && unitPrice > 0) {
            subtotalAmount = Number((quantity * unitPrice).toFixed(2));
          }
          let vatAmount = safeNum(item.vatAmount, 0);
          if (vatAmount === 0 && subtotalAmount > 0 && vatRate > 0) {
            vatAmount = Number(((subtotalAmount * vatRate) / 100).toFixed(2));
          }
          let totalAmount = safeNum(item.totalAmount, 0);
          if (totalAmount === 0 && (subtotalAmount > 0 || vatAmount > 0)) {
            totalAmount = Number((subtotalAmount + vatAmount).toFixed(2));
          }
          return {
            materialName: String(item.materialName ?? '').trim(),
            stockNumber: String(item.stockNumber ?? '').trim(),
            partNumber: String(item.partNumber ?? '').trim(),
            quantity,
            unit: String(item.unit ?? 'Adet').trim() || 'Adet',
            unitPrice:
              unitPrice > 0
                ? unitPrice
                : quantity > 0 && subtotalAmount > 0
                ? Number((subtotalAmount / quantity).toFixed(4))
                : 0,
            vatRate,
            subtotalAmount,
            vatAmount,
            totalAmount,
          };
        })
        .filter((item) => item.materialName.length > 0);

      let subtotalAmount = safeNum(totalsObj.subtotalAmount, 0);
      let vatAmount = safeNum(totalsObj.vatAmount, 0);
      let totalAmount = safeNum(totalsObj.totalAmount, 0);

      if (subtotalAmount === 0 && normalizedItems.length > 0) {
        subtotalAmount = Number(
          normalizedItems.reduce((acc, i) => acc + i.subtotalAmount, 0).toFixed(2)
        );
      }
      if (vatAmount === 0 && normalizedItems.length > 0) {
        vatAmount = Number(
          normalizedItems.reduce((acc, i) => acc + i.vatAmount, 0).toFixed(2)
        );
      }
      if (totalAmount === 0) {
        totalAmount = Number((subtotalAmount + vatAmount).toFixed(2));
      }

      return res.json({
        detectedDirection: rawDirection,
        invoiceNo: String(parsed.invoiceNo ?? '').trim(),
        invoiceDate: safeIsoDate(parsed.invoiceDate, todayIso),
        dueDate: safeIsoDate(parsed.dueDate, ''),
        currency: safeCurrency(parsed.currency),
        paymentMethodHint: safeMethod(parsed.paymentMethodHint),
        notes: String(parsed.notes ?? '').trim(),
        counterparty: {
          name: String(cp.name ?? '').trim(),
          taxOffice: String(cp.taxOffice ?? '').trim(),
          taxNumber: String(cp.taxNumber ?? '').trim(),
          contactPerson: String(cp.contactPerson ?? '').trim(),
          phone: String(cp.phone ?? '').trim(),
          email: String(cp.email ?? '').trim(),
          address: String(cp.address ?? '').trim(),
          iban: String(cp.iban ?? '').trim(),
        },
        totals: {
          subtotalAmount,
          vatAmount,
          totalAmount,
        },
        items: normalizedItems,
      });
    } catch (err) {
      return handleGeminiRouteError(
        res,
        err,
        'Fatura PDF çözümlemesi sırasında bir hata oluştu. Lütfen dosyanın okunabilir olduğundan emin olup tekrar deneyin.'
      );
    }
  });

  function extractClientIp(req: express.Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    let raw = '';
    if (typeof forwarded === 'string' && forwarded.trim()) {
      raw = forwarded.split(',')[0]?.trim() || '';
    } else if (Array.isArray(forwarded) && forwarded.length > 0) {
      raw = String(forwarded[0] || '').split(',')[0]?.trim() || '';
    }
    if (!raw) {
      raw = (req.ip || req.socket?.remoteAddress || '').trim();
    }
    if (raw.startsWith('::ffff:')) {
      raw = raw.slice(7);
    }
    if (raw === '::1') {
      raw = '127.0.0.1';
    }
    const cleaned = raw.replace(/%[a-zA-Z0-9_.-]+$/, '');
    return /^[0-9a-fA-F:.]{2,45}$/.test(cleaned) ? cleaned : 'Bilinmiyor';
  }

  app.get('/api/session/client-ip', requireFirebaseAuth, (req: AuthenticatedRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      ip: extractClientIp(req),
    });
  });

  app.use('/api', (_req, res) => {
    return res.status(404).json({
      error: 'İstenen API uç noktası bulunamadı.',
    });
  });

  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (!err) return next();
      const errObj = err as { code?: string; type?: string; status?: number; message?: string };
      if (errObj.code === 'LIMIT_FILE_SIZE' || errObj.type === 'entity.too.large') {
        return res.status(413).json({
          error: 'Yüklenen dosya boyutu sunucu sınırını (10 MB) aşıyor.',
        });
      }
      if (errObj.type === 'entity.parse.failed') {
        return res.status(400).json({
          error: 'İstek gövdesi çözümlenemedi. Lütfen dosyayı tekrar seçin.',
        });
      }
      return res.status(errObj.status || 500).json({
        error: errObj.message || 'Sunucu isteği işlenirken beklenmeyen bir hata oluştu.',
      });
    }
  );

  if (!isProduction) {
    const vitePromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      })
    );

    vitePromise.catch((err) => {
      console.error('Vite geliştirme sunucusu başlatılamadı:', err);
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  

  } else {

const distDir = path.resolve(__dirname, 'dist');
app.use((req, res, next) => {
  console.log('GELEN İSTEK:', req.method, req.originalUrl, 'PATH:', req.path);
  next();
});

// URL /ihale/assets/... biçiminde gelirse:
app.use('/ihale', express.static(distDir));

// URL /assets/... biçiminde gelirse:
app.use(express.static(distDir));

app.get('*', (req, res) => {
  // Olmayan JS, CSS veya diğer dosyalara index.html gönderme.
  if (path.extname(req.path)) {
    return res.status(404).send('Dosya bulunamadı.');
  }

  const indexHtml = path.join(distDir, 'index.html');

  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(404).send('Uygulama derleme çıktısı bulunamadı.');
  }
});

  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`İhaleKasa sunucusu ${PORT} portunda çalışıyor.`);
  });
}

startServer();
