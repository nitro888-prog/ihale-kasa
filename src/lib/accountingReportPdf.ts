import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatCurrency, formatTurkishDate, getTodayDateStr } from './trackingAndCalendar';
import { CurrencyCode } from '../types/tender';
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
  return (raw || 'Rapor')
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

export interface AccountingPdfSummaryItem {
  label: string;
  value: string;
  accentColor?: string;
}

export interface AccountingPdfColumn {
  header: string;
  width: string | number;
  align?: 'left' | 'right' | 'center';
}

export async function downloadAccountingReportPdf(params: {
  companyName?: string;
  reportTitle: string;
  reportSubtitle: string;
  filterSummary: string[];
  summaryItems: AccountingPdfSummaryItem[];
  columns: AccountingPdfColumn[];
  rows: (string | { text: string; bold?: boolean; color?: string })[][];
  filePrefix: string;
}): Promise<void> {
  const {
    companyName,
    reportTitle,
    reportSubtitle,
    filterSummary,
    summaryItems,
    columns,
    rows,
    filePrefix,
  } = params;

  const [pdfMake, logoDataUrl] = await Promise.all([
    getPdfMake(),
    getTiniatechLogoDataUrl(),
  ]);
  const todayStr = getTodayDateStr();
  const orgTitle = (companyName || 'Tiniatech İhale Yönetim Sistemi').trim();

  const content: Content[] = [];

  // Kurumsal Başlık Bandı (TINIATECH Logolu Antet)
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
        fontSize: 8.5,
        bold: true,
        color: '#7DD3FC',
        margin: [0, 0, 0, 2],
      },
      {
        text: reportTitle,
        fontSize: 15,
        bold: true,
        color: '#FFFFFF',
        margin: [0, 0, 0, 2],
      },
      {
        text: reportSubtitle,
        fontSize: 8.5,
        color: '#CBD5E1',
      },
    ],
    fillColor: '#0B2239',
    margin: [14, 10, 14, 10],
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
    margin: [0, 0, 0, 10],
  });

  // Filtre Bilgisi & Tarih
  content.push({
    columns: [
      {
        text:
          filterSummary.length > 0
            ? `Uygulanan Filtreler: ${filterSummary.join(' · ')}`
            : 'Uygulanan Filtreler: Tüm Kayıtlar',
        fontSize: 8,
        color: '#4E5D6C',
      },
      {
        text: `Rapor Tarihi: ${formatTurkishDate(todayStr)}`,
        fontSize: 8,
        bold: true,
        color: '#0B2239',
        alignment: 'right',
        width: 130,
      },
    ],
    margin: [0, 0, 0, 10],
  });

  // Özet Kart Şeridi
  if (summaryItems.length > 0) {
    content.push({
      table: {
        widths: summaryItems.map(() => '*'),
        body: [
          summaryItems.map((item) => ({
            stack: [
              { text: item.label, fontSize: 7.5, color: '#4E5D6C', margin: [0, 0, 0, 2] },
              {
                text: item.value,
                fontSize: 9.5,
                bold: true,
                color: item.accentColor || '#0B2239',
              },
            ],
            fillColor: '#F8FAFC',
            margin: [8, 6, 8, 6],
          })),
        ],
      },
      layout: {
        hLineWidth: () => 0.75,
        vLineWidth: () => 0.75,
        hLineColor: () => '#DCE3EC',
        vLineColor: () => '#DCE3EC',
      },
      margin: [0, 0, 0, 12],
    });
  }

  // Ana Tablo
  const headerRow: TableCell[] = columns.map((col) => ({
    text: col.header,
    style: 'tableHeader',
    alignment: col.align || 'left',
    margin: [5, 5, 5, 5],
  }));

  const bodyRows: TableCell[][] = rows.map((row, idx) =>
    row.map((cell, colIdx) => {
      const colAlign = columns[colIdx]?.align || 'left';
      const cellObj = typeof cell === 'string' ? { text: cell } : cell;
      return {
        text: cellObj.text,
        fontSize: 7.8,
        bold: Boolean(cellObj.bold),
        color: cellObj.color || '#0B2239',
        alignment: colAlign,
        fillColor: idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF',
        margin: [5, 4, 5, 4],
      };
    })
  );

  content.push({
    table: {
      headerRows: 1,
      widths: columns.map((c) => c.width),
      body: [headerRow, ...bodyRows],
    },
    layout: {
      hLineWidth: (i: number) => (i === 0 || i === 1 ? 1 : 0.5),
      vLineWidth: () => 0.4,
      hLineColor: () => '#DCE3EC',
      vLineColor: () => '#E5E7EB',
    },
  });

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [24, 24, 24, 34],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 8.5,
      color: '#0B2239',
    },
    styles: {
      tableHeader: {
        fontSize: 7.8,
        bold: true,
        color: '#FFFFFF',
        fillColor: '#0B2239',
      },
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: `${orgTitle} · Tiniatech Ön Muhasebe Raporu`,
          fontSize: 7.5,
          color: '#4E5D6C',
          margin: [24, 10, 0, 0],
        },
        {
          text: `Sayfa ${currentPage} / ${pageCount}`,
          fontSize: 7.5,
          color: '#4E5D6C',
          alignment: 'right',
          margin: [0, 10, 24, 0],
        },
      ],
    }),
    content,
  };

  const createdPdf = pdfMake.createPdf(docDefinition);
  const blob = await createdPdf.getBlob();
  const safePrefix = sanitizeFileName(filePrefix);
  const filename = `${safePrefix}_${todayStr}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatCurrencyBucketsCompact(
  buckets: Record<CurrencyCode, number>
): string {
  const curs: CurrencyCode[] = ['TRY', 'USD', 'EUR'];
  const active = curs.filter((c) => Math.abs(buckets[c]) > 0.001);
  if (active.length === 0) return formatCurrency(0, 'TRY');
  return active.map((c) => formatCurrency(buckets[c], c)).join(' | ');
}
