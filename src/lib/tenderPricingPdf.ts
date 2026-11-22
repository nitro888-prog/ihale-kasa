import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import {
  CurrencyCode,
  Tender,
  TenderPricingItem,
  VatFinancingBasis,
} from '../types/tender';
import { formatCurrency, formatTurkishDate, getTodayDateStr } from './trackingAndCalendar';
import { getTiniatechLogoDataUrl } from './logoAsset';
import { round2, summarizePricingItems } from './tenderPricing';

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
  return (raw || 'Fiyat_Calismasi')
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
    .slice(0, 70);
}

export async function downloadTenderPricingPdf(params: {
  tender: Tender;
  items: TenderPricingItem[];
  currency: CurrencyCode;
  vatFinancingBasis: VatFinancingBasis;
  annualFinancingRate: number;
  defaultDeliveryDays: number;
  notes?: string;
  companyName?: string;
}): Promise<void> {
  const {
    tender,
    items,
    currency,
    vatFinancingBasis,
    annualFinancingRate,
    defaultDeliveryDays,
    notes,
    companyName,
  } = params;

  const [pdfMake, logoDataUrl] = await Promise.all([
    getPdfMake(),
    getTiniatechLogoDataUrl(),
  ]);

  const totals = summarizePricingItems(items);
  const avgProfitPct =
    totals.totalCost > 0 ? round2((totals.totalProfit / totals.totalCost) * 100) : 0;
  const totalFinancingCombined = round2(
    totals.totalDeliveryFinancing + totals.totalVatFinancing
  );
  const todayStr = getTodayDateStr();
  const orgTitle = (companyName || 'TINIATECH').trim();

  const content: Content[] = [];

  // Kurumsal Antet Başlık Bandı
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
        text: 'İHALE MALİYET VE FİYAT ÇALIŞMA CETVELİ',
        fontSize: 15,
        bold: true,
        color: '#FFFFFF',
        margin: [0, 0, 0, 3],
      },
      {
        text: `${tender.trackingCode} · ${tender.title}${tender.authority ? ` (${tender.authority})` : ''}`,
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

  // Meta parametre satırı
  content.push({
    columns: [
      {
        text: `Para Birimi: ${currency}  ·  Yıllık Fin. Oranı: %${annualFinancingRate}  ·  Varsayılan Teslim: ${defaultDeliveryDays} Gün  ·  180G KDV Fin. Bazı: ${
          vatFinancingBasis === 'kdv_tutari' ? 'KDV Tutarı (%)' : 'Maliyet Tutarı (%)'
        }`,
        fontSize: 8,
        color: '#4E5D6C',
      },
      {
        text: `Düzenleme: ${formatTurkishDate(todayStr)}${
          tender.tenderDate ? ` · İhale: ${formatTurkishDate(tender.tenderDate)}` : ''
        }`,
        fontSize: 8,
        bold: true,
        color: '#0B2239',
        alignment: 'right',
        width: 200,
      },
    ],
    margin: [0, 0, 0, 10],
  });

  // 5 Sütunlu KPI Şeridi
  const estimatedDiff =
    tender.estimatedAmount > 0 ? round2(totals.totalBidNet - tender.estimatedAmount) : null;

  content.push({
    table: {
      widths: ['*', '*', '*', '*', '*'],
      body: [
        [
          {
            stack: [
              { text: 'Toplam Maliyet', fontSize: 7.5, color: '#4E5D6C', margin: [0, 0, 0, 2] },
              {
                text: formatCurrency(totals.totalCost, currency),
                fontSize: 9.5,
                bold: true,
                color: '#0B2239',
              },
              { text: `${items.length} kalem`, fontSize: 7, color: '#4E5D6C', margin: [0, 1, 0, 0] },
            ],
            fillColor: '#F8FAFC',
            margin: [7, 6, 7, 6],
          },
          {
            stack: [
              { text: 'Toplam Kâr', fontSize: 7.5, color: '#4E5D6C', margin: [0, 0, 0, 2] },
              {
                text: formatCurrency(totals.totalProfit, currency),
                fontSize: 9.5,
                bold: true,
                color: '#007A53',
              },
              {
                text: `Ort. Marj: %${avgProfitPct.toFixed(2)}`,
                fontSize: 7,
                color: '#4E5D6C',
                margin: [0, 1, 0, 0],
              },
            ],
            fillColor: '#F8FAFC',
            margin: [7, 6, 7, 6],
          },
          {
            stack: [
              {
                text: 'Finansman Yükü (Teslim + 180G)',
                fontSize: 7.5,
                color: '#4E5D6C',
                margin: [0, 0, 0, 2],
              },
              {
                text: formatCurrency(totalFinancingCombined, currency),
                fontSize: 9.5,
                bold: true,
                color: '#0B2239',
              },
              {
                text: `Teslim: ${formatCurrency(totals.totalDeliveryFinancing, currency)}`,
                fontSize: 7,
                color: '#4E5D6C',
                margin: [0, 1, 0, 0],
              },
            ],
            fillColor: '#F8FAFC',
            margin: [7, 6, 7, 6],
          },
          {
            stack: [
              {
                text: 'Vergiler + Nakliye / Kargo',
                fontSize: 7.5,
                color: '#4E5D6C',
                margin: [0, 0, 0, 2],
              },
              {
                text: formatCurrency(totals.totalTaxes + totals.totalShipping, currency),
                fontSize: 9.5,
                bold: true,
                color: '#0B2239',
              },
              {
                text: `Vergi: ${formatCurrency(totals.totalTaxes, currency)} · Nak: ${formatCurrency(
                  totals.totalShipping,
                  currency
                )}`,
                fontSize: 7,
                color: '#4E5D6C',
                margin: [0, 1, 0, 0],
              },
            ],
            fillColor: '#F8FAFC',
            margin: [7, 6, 7, 6],
          },
          {
            stack: [
              {
                text: 'Net Teklif Toplamı (KDV Hariç)',
                fontSize: 7.5,
                color: '#CBD5E1',
                margin: [0, 0, 0, 2],
              },
              {
                text: formatCurrency(totals.totalBidNet, currency),
                fontSize: 10,
                bold: true,
                color: '#34D399',
              },
              {
                text:
                  estimatedDiff !== null
                    ? `KDV Dahil: ${formatCurrency(totals.totalBidGross, currency)} · Fark: ${
                        estimatedDiff > 0 ? '+' : ''
                      }${formatCurrency(estimatedDiff, currency)}`
                    : `KDV Dahil: ${formatCurrency(totals.totalBidGross, currency)}`,
                fontSize: 7,
                color: '#CBD5E1',
                margin: [0, 1, 0, 0],
              },
            ],
            fillColor: '#0B2239',
            margin: [7, 6, 7, 6],
          },
        ],
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

  // Kalem Cetveli Tablosu
  const headers: TableCell[] = [
    { text: '#', style: 'tableHeader', alignment: 'center', margin: [3, 5, 3, 5] },
    { text: 'Ürün / Malzeme & Tedarikçi', style: 'tableHeader', margin: [4, 5, 4, 5] },
    { text: 'Miktar', style: 'tableHeader', alignment: 'right', margin: [4, 5, 4, 5] },
    { text: 'Maliyet', style: 'tableHeader', alignment: 'right', margin: [4, 5, 4, 5] },
    { text: 'Kâr (%)', style: 'tableHeader', alignment: 'right', margin: [4, 5, 4, 5] },
    { text: 'Teslim Fin. (%)', style: 'tableHeader', alignment: 'right', margin: [4, 5, 4, 5] },
    { text: 'Vergi (%)', style: 'tableHeader', alignment: 'right', margin: [4, 5, 4, 5] },
    { text: 'Nakliye', style: 'tableHeader', alignment: 'right', margin: [4, 5, 4, 5] },
    { text: '180G KDV Fin.', style: 'tableHeader', alignment: 'right', margin: [4, 5, 4, 5] },
    { text: 'Birim Teklif', style: 'tableHeader', alignment: 'right', margin: [4, 5, 4, 5] },
    { text: 'Kalem Teklif', style: 'tableHeader', alignment: 'right', margin: [4, 5, 4, 5] },
  ];

  const bodyRows: TableCell[][] = items.map((it, idx) => {
    const fill = idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
    const subParts = [
      it.stockNumber ? `Stok: ${it.stockNumber}` : '',
      it.partNumber ? `Parça: ${it.partNumber}` : '',
      it.supplierCompany || '',
    ]
      .filter(Boolean)
      .join(' · ');

    return [
      { text: String(idx + 1), fontSize: 7.5, alignment: 'center', fillColor: fill, margin: [3, 4, 3, 4] },
      {
        stack: [
          { text: it.materialName || '—', fontSize: 7.8, bold: true, color: '#0B2239' },
          ...(subParts ? [{ text: subParts, fontSize: 6.8, color: '#4E5D6C', margin: [0, 1, 0, 0] as [number, number, number, number] }] : []),
        ],
        fillColor: fill,
        margin: [4, 4, 4, 4],
      },
      {
        text: `${it.quantity} ${it.unit}`,
        fontSize: 7.5,
        alignment: 'right',
        fillColor: fill,
        margin: [4, 4, 4, 4],
      },
      {
        stack: [
          { text: formatCurrency(it.costTotal, currency), fontSize: 7.5, bold: true, alignment: 'right' },
          { text: `Brm: ${formatCurrency(it.unitCost, currency)}`, fontSize: 6.6, color: '#4E5D6C', alignment: 'right' },
        ],
        fillColor: fill,
        margin: [4, 4, 4, 4],
      },
      {
        stack: [
          { text: `%${it.profitRate.toFixed(2)}`, fontSize: 7.5, bold: true, color: '#007A53', alignment: 'right' },
          { text: formatCurrency(it.profitAmount, currency), fontSize: 6.6, color: '#4E5D6C', alignment: 'right' },
        ],
        fillColor: fill,
        margin: [4, 4, 4, 4],
      },
      {
        stack: [
          { text: `${it.deliveryDays}g · %${it.financingRate.toFixed(2)}`, fontSize: 7.3, alignment: 'right' },
          { text: formatCurrency(it.financingAmount, currency), fontSize: 6.6, color: '#4E5D6C', alignment: 'right' },
        ],
        fillColor: fill,
        margin: [4, 4, 4, 4],
      },
      {
        stack: [
          { text: `%${it.taxRate.toFixed(2)}`, fontSize: 7.5, alignment: 'right' },
          { text: formatCurrency(it.taxAmount, currency), fontSize: 6.6, color: '#4E5D6C', alignment: 'right' },
        ],
        fillColor: fill,
        margin: [4, 4, 4, 4],
      },
      {
        text: formatCurrency(it.shippingAmount, currency),
        fontSize: 7.5,
        alignment: 'right',
        fillColor: fill,
        margin: [4, 4, 4, 4],
      },
      {
        stack: [
          {
            text: it.vatFinancing180Enabled ? `%${it.vatFinancingRate.toFixed(2)}` : 'Pasif',
            fontSize: 7.3,
            alignment: 'right',
          },
          { text: formatCurrency(it.vatFinancingAmount, currency), fontSize: 6.6, color: '#4E5D6C', alignment: 'right' },
        ],
        fillColor: fill,
        margin: [4, 4, 4, 4],
      },
      {
        text: formatCurrency(it.netOfferUnitPrice, currency),
        fontSize: 7.6,
        bold: true,
        alignment: 'right',
        fillColor: fill,
        margin: [4, 4, 4, 4],
      },
      {
        stack: [
          { text: formatCurrency(it.netOfferTotal, currency), fontSize: 7.8, bold: true, color: '#0066B3', alignment: 'right' },
          { text: `+KDV(${it.vatRate}%): ${formatCurrency(it.grossOfferTotal, currency)}`, fontSize: 6.5, color: '#4E5D6C', alignment: 'right' },
        ],
        fillColor: fill,
        margin: [4, 4, 4, 4],
      },
    ];
  });

  const totalsRow: TableCell[] = [
    {
      text: `GENEL TOPLAM (${items.length} Kalem — KDV Hariç)`,
      colSpan: 3,
      fontSize: 8,
      bold: true,
      color: '#0B2239',
      fillColor: '#EEF2F7',
      margin: [4, 6, 4, 6],
    },
    {},
    {},
    {
      text: formatCurrency(totals.totalCost, currency),
      fontSize: 7.8,
      bold: true,
      alignment: 'right',
      fillColor: '#EEF2F7',
      margin: [4, 6, 4, 6],
    },
    {
      text: formatCurrency(totals.totalProfit, currency),
      fontSize: 7.8,
      bold: true,
      color: '#007A53',
      alignment: 'right',
      fillColor: '#EEF2F7',
      margin: [4, 6, 4, 6],
    },
    {
      text: formatCurrency(totals.totalDeliveryFinancing, currency),
      fontSize: 7.8,
      bold: true,
      alignment: 'right',
      fillColor: '#EEF2F7',
      margin: [4, 6, 4, 6],
    },
    {
      text: formatCurrency(totals.totalTaxes, currency),
      fontSize: 7.8,
      bold: true,
      alignment: 'right',
      fillColor: '#EEF2F7',
      margin: [4, 6, 4, 6],
    },
    {
      text: formatCurrency(totals.totalShipping, currency),
      fontSize: 7.8,
      bold: true,
      alignment: 'right',
      fillColor: '#EEF2F7',
      margin: [4, 6, 4, 6],
    },
    {
      text: formatCurrency(totals.totalVatFinancing, currency),
      fontSize: 7.8,
      bold: true,
      alignment: 'right',
      fillColor: '#EEF2F7',
      margin: [4, 6, 4, 6],
    },
    {
      text: '',
      fillColor: '#EEF2F7',
      margin: [4, 6, 4, 6],
    },
    {
      stack: [
        {
          text: formatCurrency(totals.totalBidNet, currency),
          fontSize: 8.2,
          bold: true,
          color: '#0066B3',
          alignment: 'right',
        },
        {
          text: `+KDV: ${formatCurrency(totals.totalBidGross, currency)}`,
          fontSize: 6.8,
          color: '#4E5D6C',
          alignment: 'right',
        },
      ],
      fillColor: '#EEF2F7',
      margin: [4, 6, 4, 6],
    },
  ];

  content.push({
    table: {
      headerRows: 1,
      widths: [18, '*', 46, 62, 54, 62, 50, 52, 58, 60, 74],
      body: [headers, ...bodyRows, totalsRow],
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === 0 || i === 1 || i === node.table.body.length - 1 || i === node.table.body.length
          ? 1
          : 0.45,
      vLineWidth: () => 0.4,
      hLineColor: (i: number, node: { table: { body: unknown[] } }) =>
        i === node.table.body.length - 1 ? '#0B2239' : '#DCE3EC',
      vLineColor: () => '#E5E7EB',
    },
  });

  if (notes && notes.trim()) {
    content.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                {
                  text: 'Varsayım ve Finansman Notları',
                  fontSize: 8.5,
                  bold: true,
                  color: '#0B2239',
                  margin: [0, 0, 0, 3],
                },
                {
                  text: notes.trim(),
                  fontSize: 8,
                  color: '#4E5D6C',
                  lineHeight: 1.3,
                },
              ],
              fillColor: '#F8FAFC',
              margin: [10, 8, 10, 8],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0.75,
        vLineWidth: () => 0.75,
        hLineColor: () => '#DCE3EC',
        vLineColor: () => '#DCE3EC',
      },
      margin: [0, 12, 0, 0],
    });
  }

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [22, 22, 22, 32],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 8.5,
      color: '#0B2239',
    },
    styles: {
      tableHeader: {
        fontSize: 7.4,
        bold: true,
        color: '#FFFFFF',
        fillColor: '#0B2239',
      },
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: `${orgTitle} · ${tender.trackingCode} İhale Fiyat Çalışması`,
          fontSize: 7.5,
          color: '#4E5D6C',
          margin: [22, 8, 0, 0],
        },
        {
          text: `Sayfa ${currentPage} / ${pageCount}`,
          fontSize: 7.5,
          color: '#4E5D6C',
          alignment: 'right',
          margin: [0, 8, 22, 0],
        },
      ],
    }),
    content,
  };

  const createdPdf = pdfMake.createPdf(docDefinition);
  const blob = await createdPdf.getBlob();
  const filename = `${sanitizeFileName(`Fiyat_Calismasi_${tender.trackingCode}`)}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
