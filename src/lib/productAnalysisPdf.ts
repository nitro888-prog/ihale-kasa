import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { BidProduct, Tender } from '../types/tender';
import { formatCurrency, formatTurkishDate, getTodayDateStr } from './trackingAndCalendar';
import {
  lookupItemDatabasePrices,
  lookupRecommendationPrices,
  ProductAnalysisResult,
} from './productPriceMatcher';
import { getTiniatechLogoDataUrl } from './logoAsset';
import { escapeHtml, printHtmlDocument } from './printHtml';

interface PdfMakeModule {
  createPdf: (docDefinition: TDocumentDefinitions) => {
    getBlob: () => Promise<Blob>;
  };
  addVirtualFileSystem: (vfs: Record<string, string>) => void;
}

let pdfMakeReadyPromise: Promise<PdfMakeModule> | null = null;

export async function getPdfMake(): Promise<PdfMakeModule> {
  if (!pdfMakeReadyPromise) {
    pdfMakeReadyPromise = (async () => {
      const [pdfMakeMod, vfsFontsMod] = await Promise.all([
        import('pdfmake/build/pdfmake'),
        import('pdfmake/build/vfs_fonts'),
      ]);

      let pdfMakeCandidate: unknown =
        (pdfMakeMod as unknown as { default?: unknown }).default ?? pdfMakeMod;
      if (
        pdfMakeCandidate &&
        typeof (pdfMakeCandidate as PdfMakeModule).createPdf !== 'function' &&
        (pdfMakeCandidate as { default?: unknown }).default
      ) {
        pdfMakeCandidate = (pdfMakeCandidate as { default?: unknown }).default;
      }

      const pdfMakeInstance = pdfMakeCandidate as PdfMakeModule;
      if (!pdfMakeInstance || typeof pdfMakeInstance.createPdf !== 'function') {
        throw new Error('PDF oluşturma motoru başlatılamadı.');
      }

      let vfsCandidate: unknown =
        (vfsFontsMod as unknown as { default?: unknown }).default ?? vfsFontsMod;
      if (
        vfsCandidate &&
        typeof vfsCandidate === 'object' &&
        !('Roboto-Regular.ttf' in (vfsCandidate as Record<string, unknown>))
      ) {
        const nested = vfsCandidate as {
          default?: unknown;
          vfs?: unknown;
          pdfMake?: { vfs?: unknown };
        };
        vfsCandidate = nested.default ?? nested.vfs ?? nested.pdfMake?.vfs ?? vfsCandidate;
      }

      const vfsData = vfsCandidate as Record<string, string> | undefined;
      if (typeof pdfMakeInstance.addVirtualFileSystem === 'function' && vfsData) {
        pdfMakeInstance.addVirtualFileSystem(vfsData);
      }

      return pdfMakeInstance;
    })().catch((err) => {
      pdfMakeReadyPromise = null;
      throw err;
    });
  }
  return pdfMakeReadyPromise;
}

export function sanitizePdfFileName(raw: string): string {
  return (raw || 'Ihale')
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export async function downloadProductAnalysisPdf(params: {
  tender: Tender;
  companyName?: string;
  preferenceNote?: string;
  analysis: ProductAnalysisResult;
  dbProducts: BidProduct[];
}): Promise<void> {
  const { tender, companyName, preferenceNote, analysis, dbProducts } = params;
  const [pdfMake, logoDataUrl] = await Promise.all([
    getPdfMake(),
    getTiniatechLogoDataUrl(),
  ]);
  const todayStr = getTodayDateStr();
  const orgTitle = (companyName || 'Tiniatech İhale Yönetim Sistemi').trim();

  const content: Content[] = [];

  // Kurumsal Üst Başlık Bandı (TINIATECH Logolu Antet)
  const validLogoDataUrl =
    logoDataUrl && logoDataUrl.startsWith('data:image/') ? logoDataUrl : null;
  const headerCells: TableCell[] = [];
  if (validLogoDataUrl) {
    headerCells.push({
      image: validLogoDataUrl,
      width: 72,
      alignment: 'center',
      fillColor: '#FFFFFF',
      margin: [10, 8, 10, 8],
    });
  }
  headerCells.push({
    stack: [
      {
        text: orgTitle.toUpperCase(),
        fontSize: 9,
        bold: true,
        color: '#7DD3FC',
        margin: [0, 0, 0, 3],
      },
      {
        text: 'Önerilen Ürün Listesi ve Teknik Şartname Analizi',
        fontSize: 15,
        bold: true,
        color: '#FFFFFF',
        margin: [0, 0, 0, 3],
      },
      {
        text: `${tender.trackingCode} · ${tender.title}`,
        fontSize: 10,
        color: '#E2E8F0',
      },
    ],
    fillColor: '#0B2239',
    margin: [14, 12, 14, 12],
  });

  const accentRow: TableCell[] =
    headerCells.length === 2
      ? [
          { text: '', fillColor: '#00AEEF', margin: [0, 0, 0, 0] },
          { text: '', fillColor: '#007A53', margin: [0, 0, 0, 0] },
        ]
      : [{ text: '', fillColor: '#007A53', margin: [0, 0, 0, 0] }];

  content.push({
    table: {
      widths: validLogoDataUrl ? [96, '*'] : ['*'],
      body: [headerCells, accentRow],
    },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? 0.6 : 0),
      vLineWidth: (i: number) => (validLogoDataUrl && i === 0 ? 0.6 : 0),
      hLineColor: () => '#DCE3EC',
      vLineColor: () => '#DCE3EC',
      paddingTop: (i: number) => (i === 1 ? 1.5 : 0),
      paddingBottom: (i: number) => (i === 1 ? 1.5 : 0),
      paddingLeft: () => 0,
      paddingRight: () => 0,
    },
    margin: [0, 0, 0, 14],
  });

  // İhale Künye Tablosu
  const metaRows: TableCell[][] = [
    [
      { text: 'Takip Kodu', style: 'metaLabel' },
      { text: tender.trackingCode || '—', style: 'metaValue', bold: true },
      { text: 'Resmi İKN', style: 'metaLabel' },
      { text: tender.ikn || 'Belirtilmedi', style: 'metaValue' },
    ],
    [
      { text: 'İhale Kurumu', style: 'metaLabel' },
      { text: tender.authority || '—', style: 'metaValue' },
      { text: 'İhale Tarih & Saati', style: 'metaLabel' },
      {
        text: `${formatTurkishDate(tender.tenderDate)} · ${tender.tenderTime}`,
        style: 'metaValue',
      },
    ],
    [
      { text: 'Rapor Tarihi', style: 'metaLabel' },
      { text: formatTurkishDate(todayStr), style: 'metaValue' },
      { text: 'Tercih / Kısıt Notu', style: 'metaLabel' },
      { text: preferenceNote?.trim() || 'Standart Analiz', style: 'metaValue' },
    ],
  ];

  content.push({
    table: {
      widths: [85, '*', 95, '*'],
      body: metaRows,
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#DCE3EC',
      vLineColor: () => '#DCE3EC',
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    margin: [0, 0, 0, 14],
  });

  // Genel Teknik Kapsam Değerlendirmesi
  if (analysis.overview) {
    content.push({
      text: 'Teknik Alım Kapsamı Değerlendirmesi',
      style: 'sectionHeading',
      margin: [0, 0, 0, 5],
    });
    content.push({
      text: analysis.overview,
      style: 'bodyText',
      margin: [0, 0, 0, 14],
    });
  }

  const items = Array.isArray(analysis.items) ? analysis.items : [];
  const generalRecommendations = Array.isArray(analysis.generalRecommendations)
    ? analysis.generalRecommendations
    : [];

  // Kalemler & Önerilen Ürünler + Veritabanı Son 5 Fiyat
  content.push({
    text: `Alıma Çıkılan Ürün Kalemleri ve Marka/Model Önerileri (${items.length} Kalem)`,
    style: 'sectionHeading',
    margin: [0, 0, 0, 8],
  });

  items.forEach((item, idx) => {
    const specs = Array.isArray(item.requiredSpecs) ? item.requiredSpecs : [];
    const recs = Array.isArray(item.recommendations) ? item.recommendations : [];
    const itemHeading = `${item.itemNo || `Kalem ${idx + 1}`} — ${item.productName || `Ürün Kalemi ${idx + 1}`}`;

    // Kalem Başlığı Bandı
    content.push({
      table: {
        widths: ['*', 'auto'],
        body: [
          [
            {
              text: itemHeading,
              fontSize: 10.5,
              bold: true,
              color: '#0B2239',
            },
            {
              text: item.quantityAndUnit || 'Miktar Belirtilmedi',
              fontSize: 9,
              bold: true,
              color: '#0066B3',
              alignment: 'right',
            },
          ],
        ],
      },
      layout: {
        fillColor: () => '#F3F6FA',
        hLineWidth: () => 0.75,
        vLineWidth: () => 0.75,
        hLineColor: () => '#DCE3EC',
        vLineColor: () => '#DCE3EC',
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 6,
      },
      margin: [0, idx === 0 ? 0 : 10, 0, 6],
    });

    // Teknik Özellikler
    if (specs.length > 0) {
      content.push({
        text: 'Şartnamedeki Kritik Teknik Özellikler',
        fontSize: 9,
        bold: true,
        color: '#4E5D6C',
        margin: [0, 2, 0, 3],
      });
      content.push({
        ul: specs.map((s) => ({
          text: s,
          fontSize: 8.5,
          color: '#0B2239',
          margin: [0, 1, 0, 1],
        })),
        margin: [8, 0, 0, 6],
      });
    }

    // Teknik Risk Notu
    if (item.complianceRisks) {
      content.push({
        table: {
          widths: ['*'],
          body: [
            [
              {
                text: [
                  { text: 'Teknik Risk / Dikkat: ', bold: true, color: '#92400E' },
                  { text: item.complianceRisks, color: '#78350F' },
                ],
                fontSize: 8.5,
                fillColor: '#FFFBEB',
                margin: [6, 5, 6, 5],
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#FCD34D',
          vLineColor: () => '#FCD34D',
        },
        margin: [0, 0, 0, 8],
      });
    }

    // Önerilen Marka / Model Tablosu
    if (recs.length > 0) {
      const recHeader: TableCell[] = [
        { text: 'Marka & Model', style: 'tableHeader' },
        { text: 'Katalog / Seri', style: 'tableHeader' },
        { text: 'Segment & Uyum', style: 'tableHeader' },
        { text: 'Teknik Gerekçe & Datasheet Teyidi', style: 'tableHeader' },
      ];

      const recRows: TableCell[][] = recs.map((rec) => {
        const directDb = lookupRecommendationPrices(rec, item, dbProducts);
        const directSummary =
          directDb.lastFivePrices.length > 0
            ? `\nVeritabanı Eşleşmesi: ${directDb.totalMatches} kayıt (Son: ${formatCurrency(
                directDb.lastFivePrices[0].product.offeredSalePrice,
                directDb.lastFivePrices[0].product.currency
              )})`
            : '';

        return [
          {
            stack: [
              { text: rec.brand, fontSize: 9, bold: true, color: '#0B2239' },
              { text: rec.model, fontSize: 8.5, bold: true, color: '#0066B3' },
            ],
          },
          {
            text: rec.partNumberHint || '—',
            fontSize: 8,
            color: '#0B2239',
          },
          {
            stack: [
              { text: rec.segment || '—', fontSize: 8, bold: true, color: '#0B2239' },
              {
                text: rec.compatibilityLevel || '—',
                fontSize: 8,
                color: '#007A53',
                margin: [0, 2, 0, 0],
              },
            ],
          },
          {
            stack: [
              { text: rec.rationale, fontSize: 8, color: '#0B2239' },
              ...(rec.verificationChecklist
                ? [
                    {
                      text: [
                        { text: 'Datasheet Teyidi: ', bold: true, color: '#0B2239' },
                        { text: rec.verificationChecklist, color: '#4E5D6C' },
                      ],
                      fontSize: 7.5,
                      margin: [0, 3, 0, 0] as [number, number, number, number],
                    },
                  ]
                : []),
              ...(directSummary
                ? [
                    {
                      text: directSummary.trim(),
                      fontSize: 7.5,
                      bold: true,
                      color: '#0066B3',
                      margin: [0, 3, 0, 0] as [number, number, number, number],
                    },
                  ]
                : []),
            ],
          },
        ];
      });

      content.push({
        table: {
          headerRows: 1,
          widths: [95, 72, 80, '*'],
          body: [recHeader, ...recRows],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#DCE3EC',
          vLineColor: () => '#DCE3EC',
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
        margin: [0, 0, 0, 8],
      });
    }

    // Veritabanında Alınan Son 5 Fiyat Tablosu (Kalem ve Öneriler Bazında)
    const itemDbLookup = lookupItemDatabasePrices(item, dbProducts);
    if (itemDbLookup.lastFivePrices.length > 0) {
      content.push({
        text: `Veritabanı Fiyat Geçmişi — Alınan Son ${itemDbLookup.lastFivePrices.length} Fiyat (Toplam ${itemDbLookup.totalMatches} eşleşen kayıt)`,
        fontSize: 8.5,
        bold: true,
        color: '#0066B3',
        margin: [0, 2, 0, 4],
      });

      const priceHeader: TableCell[] = [
        { text: 'Kayıtlı Malzeme / Parça No', style: 'dbTableHeader' },
        { text: 'Fiyat Alınan Firma', style: 'dbTableHeader' },
        { text: 'Fiyat / Alım Tarihi', style: 'dbTableHeader' },
        { text: 'Teklif Fiyatı', style: 'dbTableHeader', alignment: 'right' },
        { text: 'Eşleşme / İhale', style: 'dbTableHeader' },
      ];

      const priceRows: TableCell[][] = itemDbLookup.lastFivePrices.map((m) => {
        const p = m.product;
        const codeParts = [p.partNumber, p.stockNumber].filter(Boolean).join(' · ');
        return [
          {
            stack: [
              { text: p.materialName, fontSize: 8, bold: true, color: '#0B2239' },
              ...(codeParts
                ? [{ text: codeParts, fontSize: 7.5, color: '#4E5D6C' }]
                : []),
            ],
          },
          {
            text: p.supplierCompany || '—',
            fontSize: 8,
            color: '#0B2239',
          },
          {
            stack: [
              {
                text: `Fiyat: ${p.priceDate ? formatTurkishDate(p.priceDate) : '—'}`,
                fontSize: 7.5,
                color: '#0B2239',
              },
              {
                text: `Alım: ${p.purchaseDate ? formatTurkishDate(p.purchaseDate) : '—'}`,
                fontSize: 7.5,
                color: '#4E5D6C',
              },
            ],
          },
          {
            text: formatCurrency(p.offeredSalePrice, p.currency),
            fontSize: 8.5,
            bold: true,
            color: '#0066B3',
            alignment: 'right',
          },
          {
            stack: [
              { text: m.matchLabel, fontSize: 7.5, bold: true, color: '#007A53' },
              {
                text: p.tenderTrackingCode || 'Genel Kayıt',
                fontSize: 7.5,
                color: '#4E5D6C',
              },
            ],
          },
        ];
      });

      content.push({
        table: {
          headerRows: 1,
          widths: ['*', 95, 78, 72, 82],
          body: [priceHeader, ...priceRows],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#DCE3EC',
          vLineColor: () => '#DCE3EC',
          paddingLeft: () => 5,
          paddingRight: () => 5,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        margin: [0, 0, 0, 10],
      });
    } else {
      content.push({
        text: 'Veritabanında bu kalem veya önerilen modeller için geçmiş fiyat kaydı bulunamadı.',
        fontSize: 8,
        italics: true,
        color: '#4E5D6C',
        margin: [0, 0, 0, 8],
      });
    }
  });

  // Genel Teklif & Muadil Sunum Tavsiyeleri
  if (generalRecommendations.length > 0) {
    content.push({
      text: 'Teklif & Muadil Sunum Tavsiyeleri',
      style: 'sectionHeading',
      margin: [0, 8, 0, 5],
    });
    content.push({
      ul: generalRecommendations.map((tip) => ({
        text: tip,
        fontSize: 8.5,
        color: '#0B2239',
        margin: [0, 1.5, 0, 1.5],
      })),
      margin: [8, 0, 0, 10],
    });
  }

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [32, 32, 32, 42],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 9,
      color: '#0B2239',
    },
    styles: {
      sectionHeading: {
        fontSize: 11,
        bold: true,
        color: '#0B2239',
      },
      bodyText: {
        fontSize: 9,
        lineHeight: 1.35,
        color: '#0B2239',
      },
      metaLabel: {
        fontSize: 8,
        bold: true,
        color: '#4E5D6C',
        fillColor: '#F8FAFC',
      },
      metaValue: {
        fontSize: 8.5,
        color: '#0B2239',
      },
      tableHeader: {
        fontSize: 8,
        bold: true,
        color: '#FFFFFF',
        fillColor: '#0B2239',
      },
      dbTableHeader: {
        fontSize: 7.5,
        bold: true,
        color: '#FFFFFF',
        fillColor: '#0066B3',
      },
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: `${orgTitle} · ${tender.trackingCode}`,
          fontSize: 7.5,
          color: '#4E5D6C',
          margin: [32, 12, 0, 0],
        },
        {
          text: `Sayfa ${currentPage} / ${pageCount}`,
          fontSize: 7.5,
          color: '#4E5D6C',
          alignment: 'right',
          margin: [0, 12, 32, 0],
        },
      ],
    }),
    content,
  };

  const createdPdf = pdfMake.createPdf(docDefinition);
  const blob = await createdPdf.getBlob();
  const safeCode = sanitizePdfFileName(tender.trackingCode || tender.title || 'Ihale');
  const filename = `${safeCode}_Urun_Marka_Analizi_${todayStr}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function printProductAnalysis(params: {
  tender: Tender;
  companyName?: string;
  preferenceNote?: string;
  analysis: ProductAnalysisResult;
  dbProducts: BidProduct[];
}): Promise<void> {
  const { tender, companyName, preferenceNote, analysis, dbProducts } = params;
  const logoDataUrl = await getTiniatechLogoDataUrl();
  const validLogoDataUrl =
    logoDataUrl && logoDataUrl.startsWith('data:image/') ? logoDataUrl : null;
  const todayStr = getTodayDateStr();
  const orgTitle = (companyName || 'Tiniatech İhale Yönetim Sistemi').trim();
  const items = Array.isArray(analysis.items) ? analysis.items : [];
  const generalRecommendations = Array.isArray(analysis.generalRecommendations)
    ? analysis.generalRecommendations
    : [];

  const itemsHtml = items
    .map((item, idx) => {
      const specs = Array.isArray(item.requiredSpecs) ? item.requiredSpecs : [];
      const recs = Array.isArray(item.recommendations) ? item.recommendations : [];
      const itemDbLookup = lookupItemDatabasePrices(item, dbProducts);

      const recsHtml =
        recs.length > 0
          ? `<table>
              <thead>
                <tr>
                  <th style="width:18%;">Marka &amp; Model</th>
                  <th style="width:15%;">Katalog / Seri</th>
                  <th style="width:16%;">Segment &amp; Uyum</th>
                  <th>Teknik Gerekçe &amp; Datasheet Teyidi</th>
                </tr>
              </thead>
              <tbody>
                ${recs
                  .map((rec) => {
                    const directDb = lookupRecommendationPrices(rec, item, dbProducts);
                    const dbLine =
                      directDb.lastFivePrices.length > 0
                        ? `<div class="db-note">Veritabanı Eşleşmesi: ${directDb.totalMatches} kayıt (Son: ${escapeHtml(
                            formatCurrency(
                              directDb.lastFivePrices[0].product.offeredSalePrice,
                              directDb.lastFivePrices[0].product.currency
                            )
                          )})</div>`
                        : '';
                    return `<tr>
                      <td><strong>${escapeHtml(rec.brand)}</strong><br/><span class="accent">${escapeHtml(rec.model)}</span></td>
                      <td>${escapeHtml(rec.partNumberHint || '—')}</td>
                      <td><strong>${escapeHtml(rec.segment || '—')}</strong><br/><span class="green">${escapeHtml(rec.compatibilityLevel || '—')}</span></td>
                      <td>
                        ${escapeHtml(rec.rationale)}
                        ${
                          rec.verificationChecklist
                            ? `<div class="check-note"><strong>Datasheet Teyidi:</strong> ${escapeHtml(rec.verificationChecklist)}</div>`
                            : ''
                        }
                        ${dbLine}
                      </td>
                    </tr>`;
                  })
                  .join('')}
              </tbody>
            </table>`
          : '';

      const dbPricesHtml =
        itemDbLookup.lastFivePrices.length > 0
          ? `<div class="db-block">
              <div class="db-title">Veritabanı Fiyat Geçmişi — Alınan Son ${itemDbLookup.lastFivePrices.length} Fiyat (Toplam ${itemDbLookup.totalMatches} eşleşen kayıt)</div>
              <table>
                <thead>
                  <tr>
                    <th>Kayıtlı Malzeme / Parça No</th>
                    <th>Fiyat Alınan Firma</th>
                    <th>Fiyat / Alım Tarihi</th>
                    <th style="text-align:right;">Teklif Fiyatı</th>
                    <th>Eşleşme / İhale</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemDbLookup.lastFivePrices
                    .map((m) => {
                      const p = m.product;
                      const codes = [p.partNumber, p.stockNumber].filter(Boolean).join(' · ');
                      return `<tr>
                        <td><strong>${escapeHtml(p.materialName)}</strong>${
                          codes ? `<br/><span class="muted">${escapeHtml(codes)}</span>` : ''
                        }</td>
                        <td>${escapeHtml(p.supplierCompany || '—')}</td>
                        <td>Fiyat: ${escapeHtml(p.priceDate ? formatTurkishDate(p.priceDate) : '—')}<br/><span class="muted">Alım: ${escapeHtml(
                          p.purchaseDate ? formatTurkishDate(p.purchaseDate) : '—'
                        )}</span></td>
                        <td style="text-align:right;font-family:monospace;"><strong>${escapeHtml(
                          formatCurrency(p.offeredSalePrice, p.currency)
                        )}</strong></td>
                        <td><span class="green">${escapeHtml(m.matchLabel)}</span><br/><span class="muted">${escapeHtml(
                          p.tenderTrackingCode || 'Genel Kayıt'
                        )}</span></td>
                      </tr>`;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>`
          : `<p class="muted" style="margin:4px 0 0;">Veritabanında bu kalem veya önerilen modeller için geçmiş fiyat kaydı bulunamadı.</p>`;

      return `<section class="item-card">
        <div class="item-head">
          <strong>${escapeHtml(item.itemNo || `Kalem ${idx + 1}`)} — ${escapeHtml(item.productName || `Ürün Kalemi ${idx + 1}`)}</strong>
          <span class="qty">${escapeHtml(item.quantityAndUnit || 'Miktar Belirtilmedi')}</span>
        </div>
        ${
          specs.length > 0
            ? `<div class="specs-block">
                <div class="sub-label">Şartnamedeki Kritik Teknik Özellikler</div>
                <ul>${specs.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
              </div>`
            : ''
        }
        ${
          item.complianceRisks
            ? `<div class="risk-box"><strong>Teknik Risk / Dikkat:</strong> ${escapeHtml(item.complianceRisks)}</div>`
            : ''
        }
        ${recsHtml}
        ${dbPricesHtml}
      </section>`;
    })
    .join('');

  const html = `<!doctype html>
  <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(tender.trackingCode)} - Ürün &amp; Marka/Model Analizi</title>
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #0B2239; margin: 0; font-size: 10.5px; line-height: 1.4; }
        .header { display: flex; align-items: stretch; border: 1px solid #DCE3EC; border-bottom: 3px solid #007A53; margin-bottom: 12px; }
        .logo-box { background: #FFFFFF; padding: 8px 12px; display: flex; align-items: center; justify-content: center; border-right: 1px solid #DCE3EC; }
        .logo-box img { width: 72px; height: auto; object-fit: contain; }
        .title-box { background: #0B2239; color: #FFFFFF; padding: 10px 14px; flex: 1; }
        .org { font-size: 9px; font-weight: 700; color: #7DD3FC; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
        h1 { margin: 0 0 2px; font-size: 14px; color: #FFFFFF; }
        .sub { font-size: 10px; color: #E2E8F0; }
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        .meta-table td { border: 1px solid #DCE3EC; padding: 4px 7px; font-size: 9.5px; }
        .meta-label { background: #F8FAFC; color: #4E5D6C; font-weight: 700; width: 16%; }
        h2 { font-size: 11.5px; color: #0B2239; margin: 10px 0 6px; border-left: 3px solid #0066B3; padding-left: 7px; }
        .overview { margin-bottom: 12px; white-space: pre-wrap; }
        .item-card { border: 1px solid #DCE3EC; border-radius: 4px; padding: 8px; margin-bottom: 10px; break-inside: avoid; }
        .item-head { display: flex; justify-content: space-between; align-items: center; background: #F3F6FA; padding: 6px 8px; border: 1px solid #DCE3EC; margin-bottom: 6px; font-size: 10.5px; }
        .qty { color: #0066B3; font-weight: 700; font-size: 9.5px; }
        .sub-label { font-size: 9.5px; font-weight: 700; color: #4E5D6C; margin-bottom: 2px; }
        ul { margin: 2px 0 6px 16px; padding: 0; }
        li { margin-bottom: 2px; }
        .risk-box { background: #FFFBEB; border: 1px solid #FCD34D; color: #78350F; padding: 5px 7px; margin-bottom: 6px; font-size: 9.5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        th, td { border: 1px solid #DCE3EC; padding: 4px 6px; text-align: left; vertical-align: top; font-size: 9px; }
        th { background: #0B2239; color: #FFFFFF; font-weight: 700; }
        .db-block { margin-top: 6px; }
        .db-block th { background: #0066B3; }
        .db-title { font-size: 9.5px; font-weight: 700; color: #0066B3; margin-bottom: 3px; }
        .accent { color: #0066B3; font-weight: 700; }
        .green { color: #007A53; font-weight: 700; }
        .muted { color: #4E5D6C; }
        .check-note { margin-top: 3px; color: #4E5D6C; font-size: 8.5px; }
        .db-note { margin-top: 3px; color: #0066B3; font-weight: 700; font-size: 8.5px; }
      </style>
    </head>
    <body>
      <div class="header">
        ${validLogoDataUrl ? `<div class="logo-box"><img src="${validLogoDataUrl}" alt="Logo" /></div>` : ''}
        <div class="title-box">
          <div class="org">${escapeHtml(orgTitle)}</div>
          <h1>Önerilen Ürün Listesi ve Teknik Şartname Analizi</h1>
          <div class="sub">${escapeHtml(tender.trackingCode)} · ${escapeHtml(tender.title)}</div>
        </div>
      </div>

      <table class="meta-table">
        <tr>
          <td class="meta-label">Takip Kodu</td>
          <td><strong>${escapeHtml(tender.trackingCode || '—')}</strong></td>
          <td class="meta-label">Resmi İKN</td>
          <td>${escapeHtml(tender.ikn || 'Belirtilmedi')}</td>
        </tr>
        <tr>
          <td class="meta-label">İhale Kurumu</td>
          <td>${escapeHtml(tender.authority || '—')}</td>
          <td class="meta-label">İhale Tarih &amp; Saati</td>
          <td>${escapeHtml(formatTurkishDate(tender.tenderDate))} · ${escapeHtml(tender.tenderTime)}</td>
        </tr>
        <tr>
          <td class="meta-label">Rapor Tarihi</td>
          <td>${escapeHtml(formatTurkishDate(todayStr))}</td>
          <td class="meta-label">Tercih / Kısıt Notu</td>
          <td>${escapeHtml(preferenceNote?.trim() || 'Standart Analiz')}</td>
        </tr>
      </table>

      ${
        analysis.overview
          ? `<h2>Teknik Alım Kapsamı Değerlendirmesi</h2>
             <div class="overview">${escapeHtml(analysis.overview)}</div>`
          : ''
      }

      <h2>Alıma Çıkılan Ürün Kalemleri ve Marka/Model Önerileri (${items.length} Kalem)</h2>
      ${itemsHtml}

      ${
        generalRecommendations.length > 0
          ? `<h2>Teklif &amp; Muadil Sunum Tavsiyeleri</h2>
             <ul>${generalRecommendations.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')}</ul>`
          : ''
      }
    </body>
  </html>`;

  printHtmlDocument(html);
}
