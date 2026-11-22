import { BidProduct, CurrencyCode } from '../types/tender';

export interface BrandModelRecommendation {
  brand: string;
  model: string;
  partNumberHint: string;
  segment: string;
  compatibilityLevel: string;
  rationale: string;
  verificationChecklist: string;
}

export interface SpecProductItem {
  itemNo: string;
  productName: string;
  quantityAndUnit: string;
  requiredSpecs: string[];
  complianceRisks: string;
  recommendations: BrandModelRecommendation[];
}

export interface ProductAnalysisResult {
  overview: string;
  items: SpecProductItem[];
  generalRecommendations: string[];
}

export type PriceMatchType =
  | 'part_number'
  | 'brand_model'
  | 'model'
  | 'brand_product'
  | 'product_similarity';

export interface MatchedBidPrice {
  product: BidProduct;
  score: number;
  matchType: PriceMatchType;
  matchLabel: string;
  effectiveDate: string;
}

export interface CurrencyPriceRange {
  currency: CurrencyCode;
  min: number;
  max: number;
  latest: number;
  count: number;
}

export interface DatabasePriceLookupResult {
  lastFivePrices: MatchedBidPrice[];
  totalMatches: number;
  directMatchCount: number;
  currencySummaries: CurrencyPriceRange[];
}

const STOP_WORDS = new Set([
  've',
  'ile',
  'veya',
  'yahut',
  'tip',
  'tipi',
  'adet',
  'metre',
  'takim',
  'set',
  'seri',
  'serisi',
  'model',
  'modeli',
  'marka',
  'markasi',
  'urun',
  'urunu',
  'malzeme',
  'sistem',
  'sistemi',
  'ekipman',
  'cihaz',
  'cihazi',
  'icin',
  'gore',
  'uygun',
  'dengi',
  'muadil',
  'standart',
  'kalem',
  'ozellik',
  'yuksek',
  'dusuk',
  'orta',
  'yeni',
  'genel',
  'ozel',
  'komple',
  'dahil',
  'haric',
  'birim',
  'alimi',
  'isi',
  'temini',
  'montaj',
  'montaji',
  'hizmeti',
]);

export function normalizeTurkishText(value: string): string {
  return (value || '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .trim();
}

function normalizeCode(value: string): string {
  return normalizeTurkishText(value).replace(/[^a-z0-9]/g, '');
}

function tokenizeWords(value: string, minLength = 2): string[] {
  const normalized = normalizeTurkishText(value).replace(/[^a-z0-9]+/g, ' ');
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of normalized.split(' ')) {
    const token = raw.trim();
    if (token.length < minLength) continue;
    if (STOP_WORDS.has(token)) continue;
    if (!seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }
  return tokens;
}

function extractCodes(value: string): string[] {
  const normalized = normalizeTurkishText(value);
  const candidates = normalized.split(/[\s,;()/|]+/).filter(Boolean);
  const codes = new Set<string>();
  for (const c of candidates) {
    const clean = normalizeCode(c);
    if (clean.length >= 4 && /[0-9]/.test(clean) && /[a-z]/.test(clean)) {
      codes.add(clean);
    } else if (clean.length >= 5) {
      codes.add(clean);
    }
  }
  return Array.from(codes);
}

function getEffectivePriceDate(p: BidProduct): string {
  return p.priceDate || p.purchaseDate || p.quotedDate || '';
}

function getCreatedSeconds(p: BidProduct): number {
  const ts = p.createdAt as { seconds?: number } | undefined;
  return typeof ts?.seconds === 'number' ? ts.seconds : 0;
}

function compareByRecencyDesc(a: MatchedBidPrice, b: MatchedBidPrice): number {
  const dateCmp = b.effectiveDate.localeCompare(a.effectiveDate);
  if (dateCmp !== 0) return dateCmp;

  const purchaseCmp = (b.product.purchaseDate || '').localeCompare(
    a.product.purchaseDate || ''
  );
  if (purchaseCmp !== 0) return purchaseCmp;

  const quotedCmp = (b.product.quotedDate || '').localeCompare(
    a.product.quotedDate || ''
  );
  if (quotedCmp !== 0) return quotedCmp;

  const secCmp = getCreatedSeconds(b.product) - getCreatedSeconds(a.product);
  if (secCmp !== 0) return secCmp;

  return b.score - a.score;
}

function buildCurrencySummaries(matches: MatchedBidPrice[]): CurrencyPriceRange[] {
  const byCurrency = new Map<CurrencyCode, MatchedBidPrice[]>();
  for (const m of matches) {
    const list = byCurrency.get(m.product.currency) || [];
    list.push(m);
    byCurrency.set(m.product.currency, list);
  }
  const result: CurrencyPriceRange[] = [];
  for (const [currency, list] of byCurrency.entries()) {
    const sorted = [...list].sort(compareByRecencyDesc);
    const prices = sorted.map((item) => item.product.offeredSalePrice);
    result.push({
      currency,
      min: Math.min(...prices),
      max: Math.max(...prices),
      latest: sorted[0].product.offeredSalePrice,
      count: sorted.length,
    });
  }
  return result;
}

function scoreRecommendationMatch(
  rec: BrandModelRecommendation,
  productName: string,
  dbProduct: BidProduct
): MatchedBidPrice | null {
  const dbMaterialNorm = normalizeTurkishText(dbProduct.materialName);
  const dbPartNorm = normalizeTurkishText(dbProduct.partNumber);
  const dbStockNorm = normalizeTurkishText(dbProduct.stockNumber);
  const dbCombinedNorm = `${dbMaterialNorm} ${dbPartNorm} ${dbStockNorm}`.trim();

  const dbPartCode = normalizeCode(dbProduct.partNumber);
  const dbStockCode = normalizeCode(dbProduct.stockNumber);
  const dbMaterialCode = normalizeCode(dbProduct.materialName);
  const dbCombinedCode = `${dbPartCode}${dbStockCode}${dbMaterialCode}`;

  const hintCodes = [
    ...extractCodes(rec.partNumberHint),
    ...extractCodes(rec.model),
  ];

  // 1. Parça / Katalog / Stok Kodu Eşleşmesi
  for (const code of hintCodes) {
    if (
      (dbPartCode && (dbPartCode === code || dbPartCode.includes(code) || code.includes(dbPartCode))) ||
      (dbStockCode && dbStockCode.length >= 4 && (dbStockCode === code || dbStockCode.includes(code)))
    ) {
      return {
        product: dbProduct,
        score: 100,
        matchType: 'part_number',
        matchLabel: 'Parça / Stok No Eşleşmesi',
        effectiveDate: getEffectivePriceDate(dbProduct),
      };
    }
    if (code.length >= 5 && dbCombinedCode.includes(code)) {
      return {
        product: dbProduct,
        score: 92,
        matchType: 'part_number',
        matchLabel: 'Model / Katalog Kodu Eşleşmesi',
        effectiveDate: getEffectivePriceDate(dbProduct),
      };
    }
  }

  const brandTokens = tokenizeWords(rec.brand, 2);
  const modelTokens = tokenizeWords(rec.model, 2);
  const itemTokens = tokenizeWords(productName, 3);

  const hasBrand =
    brandTokens.length > 0 &&
    brandTokens.some((bt) => dbCombinedNorm.includes(bt));

  const matchedModelTokens = modelTokens.filter((mt) => dbCombinedNorm.includes(mt));
  const hasStrongModel =
    matchedModelTokens.length > 0 &&
    matchedModelTokens.some((mt) => mt.length >= 3 || /[0-9]/.test(mt));

  // 2. Marka + Model Eşleşmesi
  if (hasBrand && hasStrongModel) {
    return {
      product: dbProduct,
      score: 90,
      matchType: 'brand_model',
      matchLabel: 'Marka & Model Eşleşmesi',
      effectiveDate: getEffectivePriceDate(dbProduct),
    };
  }

  // 3. Spesifik Model Eşleşmesi (en az 1 alfanümerik model kodu)
  if (
    matchedModelTokens.some((mt) => mt.length >= 4 && /[0-9]/.test(mt))
  ) {
    return {
      product: dbProduct,
      score: 78,
      matchType: 'model',
      matchLabel: 'Model Kodu Eşleşmesi',
      effectiveDate: getEffectivePriceDate(dbProduct),
    };
  }

  // 4. Marka + Ürün Tipi Eşleşmesi
  const matchedItemTokens = itemTokens.filter((it) => dbMaterialNorm.includes(it));
  if (hasBrand && matchedItemTokens.length >= 1) {
    return {
      product: dbProduct,
      score: 65 + Math.min(matchedItemTokens.length * 4, 12),
      matchType: 'brand_product',
      matchLabel: 'Marka & Ürün Benzerliği',
      effectiveDate: getEffectivePriceDate(dbProduct),
    };
  }

  return null;
}

function scoreProductSimilarity(
  item: SpecProductItem,
  dbProduct: BidProduct
): MatchedBidPrice | null {
  const dbMaterialNorm = normalizeTurkishText(
    `${dbProduct.materialName} ${dbProduct.partNumber}`
  );
  const itemTokens = tokenizeWords(item.productName, 3);
  if (itemTokens.length === 0) return null;

  const matchedTokens = itemTokens.filter((tok) => dbMaterialNorm.includes(tok));
  const specificMatched = matchedTokens.filter(
    (tok) => tok.length >= 5 || /[0-9]/.test(tok)
  );

  // Require at least 2 meaningful tokens OR 1 strong multi-character domain noun + numeric overlap
  if (
    matchedTokens.length >= 2 ||
    (itemTokens.length <= 2 && specificMatched.length >= 1) ||
    (specificMatched.length >= 1 && matchedTokens.length >= 1 && itemTokens.length >= 1 && dbMaterialNorm.includes(specificMatched[0]))
  ) {
    // Prevent single generic word match unless the matched token is >= 6 chars
    if (matchedTokens.length === 1 && matchedTokens[0].length < 6) {
      return null;
    }
    const overlapRatio = matchedTokens.length / Math.max(1, itemTokens.length);
    return {
      product: dbProduct,
      score: Math.round(35 + overlapRatio * 25),
      matchType: 'product_similarity',
      matchLabel: 'Benzer Ürün Kaydı',
      effectiveDate: getEffectivePriceDate(dbProduct),
    };
  }

  return null;
}

export function lookupRecommendationPrices(
  rec: BrandModelRecommendation,
  item: SpecProductItem,
  dbProducts: BidProduct[]
): DatabasePriceLookupResult {
  const matches: MatchedBidPrice[] = [];
  for (const p of dbProducts) {
    const m = scoreRecommendationMatch(rec, item.productName, p);
    if (m) matches.push(m);
  }

  matches.sort(compareByRecencyDesc);
  const lastFivePrices = matches.slice(0, 5);

  return {
    lastFivePrices,
    totalMatches: matches.length,
    directMatchCount: matches.length,
    currencySummaries: buildCurrencySummaries(matches),
  };
}

export function lookupItemDatabasePrices(
  item: SpecProductItem,
  dbProducts: BidProduct[]
): DatabasePriceLookupResult {
  const bestById = new Map<string, MatchedBidPrice>();

  for (const p of dbProducts) {
    let best: MatchedBidPrice | null = null;
    for (const rec of item.recommendations) {
      const m = scoreRecommendationMatch(rec, item.productName, p);
      if (m && (!best || m.score > best.score)) {
        best = m;
      }
    }
    if (!best) {
      best = scoreProductSimilarity(item, p);
    }
    if (best) {
      bestById.set(p.id, best);
    }
  }

  const allMatches = Array.from(bestById.values());
  const directMatches = allMatches
    .filter((m) => m.matchType !== 'product_similarity')
    .sort(compareByRecencyDesc);
  const similarMatches = allMatches
    .filter((m) => m.matchType === 'product_similarity')
    .sort(compareByRecencyDesc);

  const ordered = [...directMatches, ...similarMatches];
  const lastFivePrices = ordered.slice(0, 5);

  return {
    lastFivePrices,
    totalMatches: ordered.length,
    directMatchCount: directMatches.length,
    currencySummaries: buildCurrencySummaries(ordered),
  };
}
