import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import {
  CompanyProfile,
  SalesQuote,
  SalesQuoteDocType,
} from '../types/tender';
import { formatCurrency, formatTurkishDate } from './trackingAndCalendar';
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
  return (raw || 'Belge')
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
    .slice(0, 72);
}

export async function downloadSalesQuotePdf(params: {
  quote: SalesQuote;
  companyProfile: CompanyProfile | null;
  mode?: SalesQuoteDocType;
}): Promise<void> {
  const { quote, companyProfile } = params;
  const docMode: SalesQuoteDocType = params.mode || quote.docType || 'teklif';
  const isProforma = docMode === 'proforma';

  const [pdfMake, logoDataUrl] = await Promise.all([
    getPdfMake(),
    getTiniatechLogoDataUrl(),
  ]);

  const sellerName = (companyProfile?.companyName || 'TINIATECH').trim();
  const sellerTax = [
    companyProfile?.taxOffice ? `${companyProfile.taxOffice} V.D.` : '',
    companyProfile?.taxNumber ? `VKN: ${companyProfile.taxNumber}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const sellerContact = [
    companyProfile?.authorizedPerson ? `Yetkili: ${companyProfile.authorizedPerson}` : '',
    companyProfile?.phone ? `Tel: ${companyProfile.phone}` : '',
    companyProfile?.email || '',
  ]
    .filter(Boolean)
    .join(' · ');

  const content: Content[] = [];

  // 1. Kurumsal Antet Başlık Bandı
  const headerCells: TableCell[] = [];
  if (logoDataUrl) {
    headerCells.push({
      image: logoDataUrl,
      width: 74,
      alignment: 'center',
      fillColor: '#FFFFFF',
      margin: [10, 10, 10, 10],
    });
  }
  headerCells.push({
    stack: [
      {
        text: sellerName.toUpperCase(),
        fontSize: 8.5,
        bold: true,
        color: '#7DD3FC',
        margin: [0, 0, 0, 3],
      },
      {
        text: isProforma ? 'PROFORMA FATURA' : 'TEKLİF MEKTUBU',
        fontSize: 16,
        bold: true,
        color: '#FFFFFF',
        margin: [0, 0, 0, 3],
      },
      {
        text: `Belge No: ${quote.quoteNumber}   ·   Tarih: ${formatTurkishDate(
          quote.issueDate
        )}   ·   Para Birimi: ${quote.currency}`,
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
    margin: [0, 0, 0, 12],
  });

  // 2. Satıcı & Müşteri Bilgileri İki Kolon Kutusu
  const buyerLines: string[] = [
    quote.customerName,
    [
      quote.customerTaxOffice ? `${quote.customerTaxOffice} V.D.` : '',
      quote.customerTaxNumber ? `VKN/TCKN: ${quote.customerTaxNumber}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    quote.customerAddress || '',
    [
      quote.customerContactPerson ? `İlgili: ${quote.customerContactPerson}` : '',
      quote.customerPhone ? `Tel: ${quote.customerPhone}` : '',
      quote.customerEmail || '',
    ]
      .filter(Boolean)
      .join(' · '),
  ].filter(Boolean);

  const sellerLines: string[] = [
    sellerName,
    sellerTax,
    sellerContact,
    `Düzenleme Tarihi: ${formatTurkishDate(quote.issueDate)}`,
    quote.validUntilDate
      ? `Geçerlilik Tarihi: ${formatTurkishDate(quote.validUntilDate)}`
      : '',
  ].filter(Boolean);

  content.push({
    table: {
      widths: ['*', '*'],
      body: [
        [
          {
            stack: [
              {
                text: isProforma ? 'SATICI / DÜZENLEYEN FİRMA' : 'TEKLİF VEREN FİRMA',
                fontSize: 7.5,
                bold: true,
                color: '#0066B3',
                margin: [0, 0, 0, 4],
              },
              ...sellerLines.map((line, i) => ({
                text: line,
                fontSize: i === 0 ? 9.5 : 8,
                bold: i === 0,
                color: i === 0 ? '#0B2239' : '#334155',
                margin: [0, 0, 0, 2] as [number, number, number, number],
              })),
            ],
            fillColor: '#F8FAFC',
            margin: [10, 8, 10, 8],
          },
          {
            stack: [
              {
                text: isProforma ? 'ALICI / MÜŞTERİ CARİ BİLGİLERİ' : 'SAYIN / MÜŞTERİ FİRMA',
                fontSize: 7.5,
                bold: true,
                color: '#007A53',
                margin: [0, 0, 0, 4],
              },
              ...buyerLines.map((line, i) => ({
                text: line,
                fontSize: i === 0 ? 9.5 : 8,
                bold: i === 0,
                color: i === 0 ? '#0B2239' : '#334155',
                margin: [0, 0, 0, 2] as [number, number, number, number],
              })),
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
    margin: [0, 0, 0, 12],
  });

  // 3. Teklif Konusu & Mektup Metni / Proforma Açıklaması
  content.push({
    text: `Konu: ${quote.title}`,
    fontSize: 10,
    bold: true,
    color: '#0B2239',
    margin: [0, 0, 0, 6],
  });

  if (isProforma) {
    content.push({
      text: `Sayın ${
        quote.customerContactPerson || quote.customerName
      }, aşağıda detayları belirtilen ürün ve/veya hizmet kalemlerine ilişkin proforma fatura bilgilerinize sunulmuştur.${
        quote.exchangeNote ? ` (${quote.exchangeNote})` : ''
      }`,
      fontSize: 8.5,
      color: '#334155',
      lineHeight: 1.35,
      margin: [0, 0, 0, 10],
    });
  } else {
    content.push({
      text: `Sayın ${
        quote.customerContactPerson || quote.customerName
      }, talebiniz üzerine hazırlanan fiyat teklifimiz aşağıda bilginize sunulmuştur. Teklifimizin olumlu değerlendirilmesini temenni eder, çalışmalarınızda başarılar dileriz.${
        quote.exchangeNote ? ` (${quote.exchangeNote})` : ''
      }`,
      fontSize: 8.5,
      color: '#334155',
      lineHeight: 1.35,
      margin: [0, 0, 0, 10],
    });
  }

  // 4. Kalemler Tablosu
  const itemHeader: TableCell[] = [
    { text: '#', style: 'tableHeader', alignment: 'center', margin: [4, 5, 4, 5] },
    { text: 'Stok / Parça No', style: 'tableHeader', alignment: 'left', margin: [5, 5, 5, 5] },
    { text: 'Ürün / Malzeme & Açıklama', style: 'tableHeader', alignment: 'left', margin: [5, 5, 5, 5] },
    { text: 'Miktar', style: 'tableHeader', alignment: 'right', margin: [5, 5, 5, 5] },
    { text: `Birim Fiyat (${quote.currency})`, style: 'tableHeader', alignment: 'right', margin: [5, 5, 5, 5] },
    { text: 'İsk. %', style: 'tableHeader', alignment: 'right', margin: [4, 5, 4, 5] },
    { text: 'KDV %', style: 'tableHeader', alignment: 'right', margin: [4, 5, 4, 5] },
    { text: `Tutar (KDV Hariç)`, style: 'tableHeader', alignment: 'right', margin: [5, 5, 5, 5] },
  ];

  const itemRows: TableCell[][] = quote.items.map((item, idx) => {
    const codeText = [item.stockNumber, item.partNumber].filter(Boolean).join(' / ') || '-';
    const descStack: Content[] = [
      { text: item.materialName, fontSize: 8, bold: true, color: '#0B2239' },
    ];
    if (item.description) {
      descStack.push({
        text: item.description,
        fontSize: 7.2,
        color: '#4E5D6C',
        margin: [0, 1.5, 0, 0],
      });
    }
    const rowBg = idx % 2 === 1 ? '#F8FAFC' : '#FFFFFF';
    return [
      { text: String(idx + 1), fontSize: 8, alignment: 'center', fillColor: rowBg, margin: [4, 5, 4, 5] },
      { text: codeText, fontSize: 7.5, color: '#334155', fillColor: rowBg, margin: [5, 5, 5, 5] },
      { stack: descStack, fillColor: rowBg, margin: [5, 5, 5, 5] },
      {
        text: `${item.quantity} ${item.unit}`,
        fontSize: 8,
        alignment: 'right',
        fillColor: rowBg,
        margin: [5, 5, 5, 5],
      },
      {
        text: formatCurrency(item.unitPrice, quote.currency),
        fontSize: 8,
        alignment: 'right',
        fillColor: rowBg,
        margin: [5, 5, 5, 5],
      },
      {
        text: item.discountRate > 0 ? `%${item.discountRate}` : '-',
        fontSize: 7.8,
        alignment: 'right',
        fillColor: rowBg,
        margin: [4, 5, 4, 5],
      },
      {
        text: `%${item.vatRate}`,
        fontSize: 7.8,
        alignment: 'right',
        fillColor: rowBg,
        margin: [4, 5, 4, 5],
      },
      {
        text: formatCurrency(item.subtotal, quote.currency),
        fontSize: 8,
        bold: true,
        alignment: 'right',
        fillColor: rowBg,
        margin: [5, 5, 5, 5],
      },
    ];
  });

  if (itemRows.length === 0) {
    itemRows.push([
      {
        text: 'Kalem detayı girilmedi.',
        colSpan: 8,
        alignment: 'center',
        fontSize: 8,
        color: '#4E5D6C',
        margin: [6, 10, 6, 10],
      },
      {},
      {},
      {},
      {},
      {},
      {},
      {},
    ]);
  }

  content.push({
    table: {
      headerRows: 1,
      widths: [18, 68, '*', 48, 68, 30, 30, 74],
      body: [itemHeader, ...itemRows],
    },
    layout: {
      hLineWidth: (i: number) => (i === 0 || i === 1 ? 1 : 0.5),
      vLineWidth: () => 0.4,
      hLineColor: () => '#DCE3EC',
      vLineColor: () => '#E5E7EB',
    },
    margin: [0, 0, 0, 12],
  });

  // 5. Toplamlar Kutusu + Ticari Şartlar
  const totalsRows: TableCell[][] = [
    [
      { text: 'Ara Toplam (KDV Hariç)', fontSize: 8, color: '#4E5D6C', margin: [8, 4, 8, 4] },
      {
        text: formatCurrency(quote.subtotalAmount, quote.currency),
        fontSize: 8.5,
        bold: true,
        alignment: 'right',
        margin: [8, 4, 8, 4],
      },
    ],
  ];

  if (quote.discountTotal > 0) {
    totalsRows.push([
      { text: 'Toplam İskonto', fontSize: 8, color: '#4E5D6C', margin: [8, 4, 8, 4] },
      {
        text: `-${formatCurrency(quote.discountTotal, quote.currency)}`,
        fontSize: 8.5,
        color: '#B91C1C',
        alignment: 'right',
        margin: [8, 4, 8, 4],
      },
    ]);
  }

  totalsRows.push([
    { text: 'Toplam KDV', fontSize: 8, color: '#4E5D6C', margin: [8, 4, 8, 4] },
    {
      text: formatCurrency(quote.vatTotal, quote.currency),
      fontSize: 8.5,
      bold: true,
      alignment: 'right',
      margin: [8, 4, 8, 4],
    },
  ]);

  totalsRows.push([
    {
      text: `GENEL TOPLAM (${quote.currency})`,
      fontSize: 9,
      bold: true,
      color: '#FFFFFF',
      fillColor: '#0B2239',
      margin: [8, 6, 8, 6],
    },
    {
      text: formatCurrency(quote.grandTotal, quote.currency),
      fontSize: 9.5,
      bold: true,
      color: '#FFFFFF',
      fillColor: '#0B2239',
      alignment: 'right',
      margin: [8, 6, 8, 6],
    },
  ]);

  const termsStack: Content[] = [
    {
      text: 'TİCARİ KOŞULLAR & BANKA BİLGİLERİ',
      fontSize: 8,
      bold: true,
      color: '#0B2239',
      margin: [0, 0, 0, 5],
    },
  ];
  const pushTerm = (label: string, val: string) => {
    if (!val.trim()) return;
    termsStack.push({
      text: [
        { text: `${label}: `, bold: true, color: '#0B2239' },
        { text: val.trim(), color: '#334155' },
      ],
      fontSize: 7.8,
      margin: [0, 0, 0, 3],
    });
  };
  pushTerm('Teslimat Süresi / Yeri', quote.deliveryTerms);
  pushTerm('Ödeme Koşulları', quote.paymentTerms);
  pushTerm('Garanti & Servis', quote.warrantyTerms);
  pushTerm('Geçerlilik Tarihi', quote.validUntilDate ? formatTurkishDate(quote.validUntilDate) : '');
  pushTerm('Banka & IBAN', quote.bankInfo);
  pushTerm('Özel Notlar', quote.notes);

  if (termsStack.length === 1) {
    termsStack.push({
      text: 'Standart satış ve teslimat koşulları geçerlidir.',
      fontSize: 7.8,
      color: '#4E5D6C',
    });
  }

  content.push({
    columns: [
      {
        width: '*',
        stack: termsStack,
        margin: [0, 0, 14, 0],
      },
      {
        width: 215,
        table: {
          widths: ['*', 'auto'],
          body: totalsRows,
        },
        layout: {
          hLineWidth: () => 0.6,
          vLineWidth: () => 0.6,
          hLineColor: () => '#DCE3EC',
          vLineColor: () => '#DCE3EC',
        },
      },
    ],
    margin: [0, 0, 0, 18],
  });

  // 6. Proforma Bilgilendirme Notu & İmza Bloğu
  if (isProforma) {
    content.push({
      text: 'BİLGİLENDİRME: İşbu Proforma Fatura bilgi ve sipariş teyidi amacıyla düzenlenmiş olup mali belge (resmi e-Fatura / e-Arşiv Fatura) yerine geçmez.',
      fontSize: 7.5,
      italics: true,
      color: '#4E5D6C',
      margin: [0, 0, 0, 16],
    });
  }

  content.push({
    columns: [
      {
        width: '*',
        stack: [
          { text: 'MÜŞTERİ SİPARİŞ ONAYI (KAŞE / İMZA)', fontSize: 7.5, bold: true, color: '#4E5D6C' },
          { text: quote.customerName, fontSize: 8, bold: true, color: '#0B2239', margin: [0, 2, 0, 22] },
          { text: 'Tarih: ____ / ____ / 20____', fontSize: 7.5, color: '#4E5D6C' },
        ],
      },
      {
        width: '*',
        alignment: 'right',
        stack: [
          { text: `${sellerName.toUpperCase()} YETKİLİ İMZA`, fontSize: 7.5, bold: true, color: '#4E5D6C' },
          {
            text: companyProfile?.authorizedPerson || 'Satış & Teklif Birimi',
            fontSize: 8,
            bold: true,
            color: '#0B2239',
            margin: [0, 2, 0, 22],
          },
          { text: `Belge Tarihi: ${formatTurkishDate(quote.issueDate)}`, fontSize: 7.5, color: '#4E5D6C' },
        ],
      },
    ],
  });

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [28, 28, 28, 36],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 8.5,
      color: '#0B2239',
    },
    styles: {
      tableHeader: {
        fontSize: 7.5,
        bold: true,
        color: '#FFFFFF',
        fillColor: '#0B2239',
      },
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: `${sellerName} · ${isProforma ? 'Proforma Fatura' : 'Teklif Mektubu'} (${quote.quoteNumber})`,
          fontSize: 7.5,
          color: '#4E5D6C',
          margin: [28, 10, 0, 0],
        },
        {
          text: `Sayfa ${currentPage} / ${pageCount}`,
          fontSize: 7.5,
          color: '#4E5D6C',
          alignment: 'right',
          margin: [0, 10, 28, 0],
        },
      ],
    }),
    content,
  };

  const createdPdf = pdfMake.createPdf(docDefinition);
  const blob = await createdPdf.getBlob();
  const prefix = isProforma ? 'Proforma' : 'Teklif_Mektubu';
  const filename = `${sanitizeFileName(`${prefix}_${quote.quoteNumber}_${quote.customerName}`)}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
