import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { BidProduct, Tender } from '../types/tender';
import { formatCurrency, formatTurkishDate, getTodayDateStr } from './trackingAndCalendar';
import {
  lookupItemDatabasePrices,
  lookupRecommendationPrices,
  ProductAnalysisResult,
} from './productPriceMatcher';
import { getTiniatechLogoDataUrl } from './logoAsset';

interface PdfMakeModule {
  createPdf: (docDefinition: TDocumentDefinitions) => {
    getBlob: () => Promise<Blob>;
  };
  addVirtualFileSystem: (vfs: Record<string, string>) => void;
}

let pdfMakeReadyPromise: Promise<PdfMakeModule> | null = null;

async function getPdfMake(): Promise<PdfMakeModule> {
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

function sanitizeFileName(raw: string): string {
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
  const headerCells: TableCell[] = [];
  if (logoDataUrl) {
    headerCells.push({
      image: logoDataUrl,
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
      widths: logoDataUrl ? [96, '*'] : ['*'],
      body: [headerCells, accentRow],
    },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? 0.6 : 0),
      vLineWidth: (i: number) => (logoDataUrl && i === 0 ? 0.6 : 0),
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

  // Kalemler & Önerilen Ürünler + Veritabanı Son 5 Fiyat
  content.push({
    text: `Alıma Çıkılan Ürün Kalemleri ve Marka/Model Önerileri (${analysis.items.length} Kalem)`,
    style: 'sectionHeading',
    margin: [0, 0, 0, 8],
  });

  analysis.items.forEach((item, idx) => {
    const itemHeading = `${item.itemNo || `Kalem ${idx + 1}`} — ${item.productName}`;

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
    if (item.requiredSpecs.length > 0) {
      content.push({
        text: 'Şartnamedeki Kritik Teknik Özellikler',
        fontSize: 9,
        bold: true,
        color: '#4E5D6C',
        margin: [0, 2, 0, 3],
      });
      content.push({
        ul: item.requiredSpecs.map((s) => ({
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
    if (item.recommendations.length > 0) {
      const recHeader: TableCell[] = [
        { text: 'Marka & Model', style: 'tableHeader' },
        { text: 'Katalog / Seri', style: 'tableHeader' },
        { text: 'Segment & Uyum', style: 'tableHeader' },
        { text: 'Teknik Gerekçe & Datasheet Teyidi', style: 'tableHeader' },
      ];

      const recRows: TableCell[][] = item.recommendations.map((rec) => {
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
  if (analysis.generalRecommendations.length > 0) {
    content.push({
      text: 'Teklif & Muadil Sunum Tavsiyeleri',
      style: 'sectionHeading',
      margin: [0, 8, 0, 5],
    });
    content.push({
      ul: analysis.generalRecommendations.map((tip) => ({
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
  const safeCode = sanitizeFileName(tender.trackingCode || tender.title || 'Ihale');
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
