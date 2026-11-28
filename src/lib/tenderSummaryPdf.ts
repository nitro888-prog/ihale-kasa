import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { Tender } from '../types/tender';
import { formatCurrency, formatTurkishDate, getTodayDateStr } from './trackingAndCalendar';
import { getTiniatechLogoDataUrl } from './logoAsset';
import { escapeHtml, printHtmlDocument } from './printHtml';
import { getPdfMake, sanitizePdfFileName } from './productAnalysisPdf';

export interface TenderSummaryCriticalDate {
  label: string;
  dateText: string;
  isoDate?: string;
  importance: string;
  excerpt?: string;
}

export interface TenderSummaryRequirement {
  title: string;
  detail: string;
}

export interface TenderSummaryAnalysisData {
  summary: string;
  criticalDates: TenderSummaryCriticalDate[];
  keyRequirements: TenderSummaryRequirement[];
}

function formatImportanceLabel(importance: string): string {
  if (importance === 'kritik') return 'Kritik Tarih';
  if (importance === 'yuksek') return 'Yüksek Öncelik';
  return 'Bilgi';
}

export async function downloadTenderNotesAndSummaryPdf(params: {
  tender: Tender;
  companyName?: string;
  analysis?: TenderSummaryAnalysisData | null;
  includeNotes?: boolean;
  titleOverride?: string;
}): Promise<void> {
  const {
    tender,
    companyName,
    analysis,
    includeNotes = true,
    titleOverride,
  } = params;

  const [pdfMake, logoDataUrl] = await Promise.all([
    getPdfMake(),
    getTiniatechLogoDataUrl(),
  ]);

  const todayStr = getTodayDateStr();
  const orgTitle = (companyName || 'Tiniatech İhale Yönetim Sistemi').trim();
  const reportTitle =
    titleOverride ||
    (analysis && includeNotes && tender.notes
      ? 'İhale Notları ve Yapay Zeka Şartname Araştırması'
      : analysis
      ? 'Yapay Zeka İhale Özeti ve Kritik Tarihler Raporu'
      : 'İhale Notları ve Künye Raporu');

  const content: Content[] = [];

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
        text: reportTitle,
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

  content.push({
    table: {
      widths: [85, '*', 95, '*'],
      body: [
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
          { text: 'Yaklaşık Tutar', style: 'metaLabel' },
          {
            text: formatCurrency(tender.estimatedAmount, tender.currency),
            style: 'metaValue',
          },
          { text: 'Rapor Tarihi', style: 'metaLabel' },
          { text: formatTurkishDate(todayStr), style: 'metaValue' },
        ],
      ],
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

  if (includeNotes && tender.notes && tender.notes.trim()) {
    content.push({
      text: 'İhale Notları',
      style: 'sectionHeading',
      margin: [0, 0, 0, 6],
    });
    content.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              text: tender.notes.trim(),
              style: 'bodyText',
              fillColor: '#F8FAFC',
              margin: [10, 8, 10, 8],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0.6,
        vLineWidth: () => 0.6,
        hLineColor: () => '#DCE3EC',
        vLineColor: () => '#DCE3EC',
      },
      margin: [0, 0, 0, 14],
    });
  }

  if (analysis) {
    if (analysis.summary) {
      content.push({
        text: 'Yapay Zeka Doküman & Şartname Özeti',
        style: 'sectionHeading',
        margin: [0, 0, 0, 5],
      });
      content.push({
        text: analysis.summary,
        style: 'bodyText',
        margin: [0, 0, 0, 14],
      });
    }

    const dates = Array.isArray(analysis.criticalDates) ? analysis.criticalDates : [];
    content.push({
      text: `Tespit Edilen Önemli Tarihler (${dates.length})`,
      style: 'sectionHeading',
      margin: [0, 0, 0, 6],
    });

    if (dates.length === 0) {
      content.push({
        text: 'Metin içinde belirgin bir son tarih veya takvim ifadesi tespit edilmedi.',
        fontSize: 8.5,
        italics: true,
        color: '#4E5D6C',
        margin: [0, 0, 0, 12],
      });
    } else {
      const dateHeader: TableCell[] = [
        { text: 'Başlık / Madde', style: 'tableHeader' },
        { text: 'Öncelik', style: 'tableHeader' },
        { text: 'Tarih / Süre', style: 'tableHeader' },
        { text: 'Açıklama / Alıntı', style: 'tableHeader' },
      ];
      const dateRows: TableCell[][] = dates.map((cd) => {
        const importanceColor =
          cd.importance === 'kritik'
            ? '#B91C1C'
            : cd.importance === 'yuksek'
            ? '#B45309'
            : '#4E5D6C';
        return [
          { text: cd.label || '—', fontSize: 8.5, bold: true, color: '#0B2239' },
          {
            text: formatImportanceLabel(cd.importance),
            fontSize: 8,
            bold: true,
            color: importanceColor,
          },
          { text: cd.dateText || cd.isoDate || '—', fontSize: 8.5, bold: true, color: '#0B2239' },
          { text: cd.excerpt || '—', fontSize: 8, color: '#4E5D6C' },
        ];
      });

      content.push({
        table: {
          headerRows: 1,
          widths: [115, 70, 90, '*'],
          body: [dateHeader, ...dateRows],
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
    }

    const reqs = Array.isArray(analysis.keyRequirements) ? analysis.keyRequirements : [];
    if (reqs.length > 0) {
      content.push({
        text: `Öne Çıkan Şartname Koşulları (${reqs.length})`,
        style: 'sectionHeading',
        margin: [0, 0, 0, 6],
      });
      const reqHeader: TableCell[] = [
        { text: 'Koşul / Kriter', style: 'tableHeader' },
        { text: 'Detay', style: 'tableHeader' },
      ];
      const reqRows: TableCell[][] = reqs.map((req) => [
        { text: req.title || '—', fontSize: 8.5, bold: true, color: '#0B2239' },
        { text: req.detail || '—', fontSize: 8.5, color: '#0B2239' },
      ]);
      content.push({
        table: {
          headerRows: 1,
          widths: [155, '*'],
          body: [reqHeader, ...reqRows],
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
        margin: [0, 0, 0, 10],
      });
    }
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
        lineHeight: 1.4,
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
  const suffix = analysis && !includeNotes ? 'AI_Ozet_Tarihler' : 'Ihale_Notlari_AI_Analiz';
  const filename = `${safeCode}_${suffix}_${todayStr}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function printTenderNotesAndSummary(params: {
  tender: Tender;
  companyName?: string;
  analysis?: TenderSummaryAnalysisData | null;
  includeNotes?: boolean;
  titleOverride?: string;
}): Promise<void> {
  const {
    tender,
    companyName,
    analysis,
    includeNotes = true,
    titleOverride,
  } = params;
  const logoDataUrl = await getTiniatechLogoDataUrl();
  const validLogoDataUrl =
    logoDataUrl && logoDataUrl.startsWith('data:image/') ? logoDataUrl : null;
  const todayStr = getTodayDateStr();
  const orgTitle = (companyName || 'Tiniatech İhale Yönetim Sistemi').trim();
  const reportTitle =
    titleOverride ||
    (analysis && includeNotes && tender.notes
      ? 'İhale Notları ve Yapay Zeka Şartname Araştırması'
      : analysis
      ? 'Yapay Zeka İhale Özeti ve Kritik Tarihler Raporu'
      : 'İhale Notları ve Künye Raporu');

  const notesHtml =
    includeNotes && tender.notes && tender.notes.trim()
      ? `
      <section class="block">
        <h2>İhale Notları</h2>
        <div class="notes-box">${escapeHtml(tender.notes.trim())}</div>
      </section>`
      : '';

  const datesHtml =
    analysis && Array.isArray(analysis.criticalDates)
      ? analysis.criticalDates.length === 0
        ? `<p class="muted">Metin içinde belirgin bir son tarih veya takvim ifadesi tespit edilmedi.</p>`
        : `<table>
            <thead>
              <tr>
                <th>Başlık / Madde</th>
                <th>Öncelik</th>
                <th>Tarih / Süre</th>
                <th>Açıklama / Alıntı</th>
              </tr>
            </thead>
            <tbody>
              ${analysis.criticalDates
                .map((cd) => {
                  const badgeCls =
                    cd.importance === 'kritik'
                      ? 'badge-crit'
                      : cd.importance === 'yuksek'
                      ? 'badge-high'
                      : 'badge-info';
                  return `<tr>
                    <td><strong>${escapeHtml(cd.label || '—')}</strong></td>
                    <td><span class="badge ${badgeCls}">${escapeHtml(formatImportanceLabel(cd.importance))}</span></td>
                    <td><strong>${escapeHtml(cd.dateText || cd.isoDate || '—')}</strong></td>
                    <td>${escapeHtml(cd.excerpt || '—')}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>`
      : '';

  const reqsHtml =
    analysis && Array.isArray(analysis.keyRequirements) && analysis.keyRequirements.length > 0
      ? `
      <section class="block">
        <h2>Öne Çıkan Şartname Koşulları (${analysis.keyRequirements.length})</h2>
        <table>
          <thead>
            <tr>
              <th style="width:28%;">Koşul / Kriter</th>
              <th>Detay</th>
            </tr>
          </thead>
          <tbody>
            ${analysis.keyRequirements
              .map(
                (r) => `<tr>
                  <td><strong>${escapeHtml(r.title || '—')}</strong></td>
                  <td>${escapeHtml(r.detail || '—')}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </section>`
      : '';

  const analysisHtml = analysis
    ? `
      ${
        analysis.summary
          ? `<section class="block">
              <h2>Yapay Zeka Doküman &amp; Şartname Özeti</h2>
              <div class="summary-text">${escapeHtml(analysis.summary)}</div>
            </section>`
          : ''
      }
      <section class="block">
        <h2>Tespit Edilen Önemli Tarihler (${analysis.criticalDates?.length || 0})</h2>
        ${datesHtml}
      </section>
      ${reqsHtml}`
    : '';

  const html = `<!doctype html>
  <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(tender.trackingCode)} - ${escapeHtml(reportTitle)}</title>
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #0B2239; margin: 0; font-size: 11px; line-height: 1.45; }
        .header { display: flex; align-items: stretch; border: 1px solid #DCE3EC; border-bottom: 3px solid #007A53; margin-bottom: 14px; }
        .logo-box { background: #FFFFFF; padding: 10px 14px; display: flex; align-items: center; justify-content: center; border-right: 1px solid #DCE3EC; }
        .logo-box img { width: 76px; height: auto; object-fit: contain; }
        .title-box { background: #0B2239; color: #FFFFFF; padding: 12px 16px; flex: 1; }
        .org { font-size: 9px; font-weight: 700; color: #7DD3FC; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
        h1 { margin: 0 0 3px; font-size: 15px; color: #FFFFFF; }
        .sub { font-size: 10px; color: #E2E8F0; }
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        .meta-table td { border: 1px solid #DCE3EC; padding: 5px 8px; font-size: 10px; }
        .meta-label { background: #F8FAFC; color: #4E5D6C; font-weight: 700; width: 16%; }
        .block { margin-bottom: 14px; break-inside: avoid; }
        h2 { font-size: 12px; color: #0B2239; margin: 0 0 6px; border-left: 3px solid #0066B3; padding-left: 8px; }
        .notes-box { background: #F8FAFC; border: 1px solid #DCE3EC; padding: 10px 12px; white-space: pre-wrap; border-radius: 4px; }
        .summary-text { white-space: pre-wrap; }
        .muted { color: #4E5D6C; font-style: italic; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #DCE3EC; padding: 5px 7px; text-align: left; vertical-align: top; font-size: 10px; }
        th { background: #0B2239; color: #FFFFFF; font-weight: 700; }
        .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-weight: 700; font-size: 9px; }
        .badge-crit { background: #FEE2E2; color: #B91C1C; }
        .badge-high { background: #FEF3C7; color: #B45309; }
        .badge-info { background: #F1F5F9; color: #4E5D6C; }
      </style>
    </head>
    <body>
      <div class="header">
        ${validLogoDataUrl ? `<div class="logo-box"><img src="${validLogoDataUrl}" alt="Logo" /></div>` : ''}
        <div class="title-box">
          <div class="org">${escapeHtml(orgTitle)}</div>
          <h1>${escapeHtml(reportTitle)}</h1>
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
          <td class="meta-label">Yaklaşık Tutar</td>
          <td>${escapeHtml(formatCurrency(tender.estimatedAmount, tender.currency))}</td>
          <td class="meta-label">Rapor Tarihi</td>
          <td>${escapeHtml(formatTurkishDate(todayStr))}</td>
        </tr>
      </table>

      ${notesHtml}
      ${analysisHtml}
    </body>
  </html>`;

  printHtmlDocument(html);
}
