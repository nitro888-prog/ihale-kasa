import {
  BidProduct,
  CurrencyCode,
  Tender,
  TenderPricingItem,
  VatFinancingBasis,
} from '../types/tender';
import { formatCurrency } from './trackingAndCalendar';

export function round2(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export function calcDeliveryFinancingPct(annualRate: number, deliveryDays: number): number {
  const safeAnnual = Math.max(0, Number(annualRate) || 0);
  const safeDays = Math.max(0, Number(deliveryDays) || 0);
  return round2((safeAnnual * safeDays) / 365);
}

export function calcVat180FinancingPct(
  annualRate: number,
  vatRate: number,
  basis: VatFinancingBasis
): number {
  const safeAnnual = Math.max(0, Number(annualRate) || 0);
  const safeVat = Math.max(0, Number(vatRate) || 0);
  const halfYearRatio = 180 / 365;
  if (basis === 'kdv_tutari') {
    return round2(safeAnnual * halfYearRatio);
  }
  return round2(safeAnnual * halfYearRatio * (safeVat / 100));
}

export function computeTenderPricingItem(
  raw: Omit<
    TenderPricingItem,
    | 'costTotal'
    | 'profitAmount'
    | 'financingAmount'
    | 'taxAmount'
    | 'vatFinancingAmount'
    | 'netOfferTotal'
    | 'netOfferUnitPrice'
    | 'vatAmount'
    | 'grossOfferTotal'
  >,
  vatFinancingBasis: VatFinancingBasis
): TenderPricingItem {
  const quantity = Math.max(0, Number(raw.quantity) || 0);
  const unitCost = Math.max(0, Number(raw.unitCost) || 0);
  const profitRate = Math.max(0, Math.min(1000, Number(raw.profitRate) || 0));
  const deliveryDays = Math.max(0, Math.min(3650, Math.round(Number(raw.deliveryDays) || 0)));
  const financingRate = Math.max(0, Math.min(500, Number(raw.financingRate) || 0));
  const taxRate = Math.max(0, Math.min(500, Number(raw.taxRate) || 0));
  const shippingAmount = Math.max(0, Number(raw.shippingAmount) || 0);
  const vatRate = Math.max(0, Math.min(100, Number(raw.vatRate) || 0));
  const vatFinancing180Enabled = Boolean(raw.vatFinancing180Enabled);
  const vatFinancingRate = Math.max(0, Math.min(500, Number(raw.vatFinancingRate) || 0));

  const costTotal = round2(quantity * unitCost);
  const profitAmount = round2(costTotal * (profitRate / 100));
  const financingAmount = round2(costTotal * (financingRate / 100));
  const taxAmount = round2(costTotal * (taxRate / 100));
  const shipping = round2(shippingAmount);

  const subtotalBeforeVatFin = costTotal + profitAmount + financingAmount + taxAmount + shipping;

  let vatFinancingAmount = 0;
  if (vatFinancing180Enabled && vatFinancingRate > 0) {
    if (vatFinancingBasis === 'kdv_tutari') {
      const baseVat = subtotalBeforeVatFin * (vatRate / 100);
      vatFinancingAmount = round2(baseVat * (vatFinancingRate / 100));
    } else {
      vatFinancingAmount = round2(costTotal * (vatFinancingRate / 100));
    }
  }

  const netOfferTotal = round2(subtotalBeforeVatFin + vatFinancingAmount);
  const netOfferUnitPrice = quantity > 0 ? round2(netOfferTotal / quantity) : netOfferTotal;
  const vatAmount = round2(netOfferTotal * (vatRate / 100));
  const grossOfferTotal = round2(netOfferTotal + vatAmount);

  return {
    ...raw,
    quantity,
    unitCost,
    profitRate,
    deliveryDays,
    financingRate,
    taxRate,
    shippingAmount: shipping,
    vatRate,
    vatFinancing180Enabled,
    vatFinancingRate,
    costTotal,
    profitAmount,
    financingAmount,
    taxAmount,
    vatFinancingAmount,
    netOfferTotal,
    netOfferUnitPrice,
    vatAmount,
    grossOfferTotal,
  };
}

export function createPricingItemFromBidProduct(
  product: BidProduct,
  defaults: {
    annualFinancingRate: number;
    defaultDeliveryDays: number;
    vatFinancingBasis: VatFinancingBasis;
    defaultVatRate?: number;
  }
): TenderPricingItem {
  const defaultVatRate = defaults.defaultVatRate ?? 20;
  const deliveryDays = Math.max(0, defaults.defaultDeliveryDays || 60);
  const financingRate = calcDeliveryFinancingPct(defaults.annualFinancingRate, deliveryDays);
  const vatFinancingRate = calcVat180FinancingPct(
    defaults.annualFinancingRate,
    defaultVatRate,
    defaults.vatFinancingBasis
  );

  return computeTenderPricingItem(
    {
      id: `pi_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      productId: product.id,
      stockNumber: product.stockNumber || '',
      partNumber: product.partNumber || '',
      materialName: product.materialName || 'İhale Ürünü',
      supplierCompany: product.supplierCompany || '',
      quantity: 1,
      unit: 'Adet',
      unitCost: Math.max(0, Number(product.offeredSalePrice) || 0),
      profitRate: 15,
      deliveryDays,
      financingRate,
      taxRate: 2.5,
      shippingAmount: 0,
      vatRate: defaultVatRate,
      vatFinancing180Enabled: true,
      vatFinancingRate,
      notes: '',
    },
    defaults.vatFinancingBasis
  );
}

export function createEmptyPricingItem(defaults: {
  annualFinancingRate: number;
  defaultDeliveryDays: number;
  vatFinancingBasis: VatFinancingBasis;
}): TenderPricingItem {
  const deliveryDays = Math.max(0, defaults.defaultDeliveryDays || 60);
  const defaultVatRate = 20;
  const financingRate = calcDeliveryFinancingPct(defaults.annualFinancingRate, deliveryDays);
  const vatFinancingRate = calcVat180FinancingPct(
    defaults.annualFinancingRate,
    defaultVatRate,
    defaults.vatFinancingBasis
  );

  return computeTenderPricingItem(
    {
      id: `pi_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      productId: '',
      stockNumber: '',
      partNumber: '',
      materialName: 'Yeni Teklif Kalemi',
      supplierCompany: '',
      quantity: 1,
      unit: 'Adet',
      unitCost: 0,
      profitRate: 15,
      deliveryDays,
      financingRate,
      taxRate: 2.5,
      shippingAmount: 0,
      vatRate: defaultVatRate,
      vatFinancing180Enabled: true,
      vatFinancingRate,
      notes: '',
    },
    defaults.vatFinancingBasis
  );
}

export function summarizePricingItems(items: TenderPricingItem[]) {
  return items.reduce(
    (acc, it) => ({
      totalCost: round2(acc.totalCost + it.costTotal),
      totalProfit: round2(acc.totalProfit + it.profitAmount),
      totalDeliveryFinancing: round2(acc.totalDeliveryFinancing + it.financingAmount),
      totalTaxes: round2(acc.totalTaxes + it.taxAmount),
      totalShipping: round2(acc.totalShipping + it.shippingAmount),
      totalVatFinancing: round2(acc.totalVatFinancing + it.vatFinancingAmount),
      totalBidNet: round2(acc.totalBidNet + it.netOfferTotal),
      totalVat: round2(acc.totalVat + it.vatAmount),
      totalBidGross: round2(acc.totalBidGross + it.grossOfferTotal),
    }),
    {
      totalCost: 0,
      totalProfit: 0,
      totalDeliveryFinancing: 0,
      totalTaxes: 0,
      totalShipping: 0,
      totalVatFinancing: 0,
      totalBidNet: 0,
      totalVat: 0,
      totalBidGross: 0,
    }
  );
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[;"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadTenderPricingCsv(
  tender: Tender,
  items: TenderPricingItem[],
  currency: CurrencyCode,
  vatFinancingBasis: VatFinancingBasis
): void {
  const headers = [
    'Kalem No',
    'Stok No',
    'Parca No',
    'Malzeme / Urun Adi',
    'Tedarikci',
    'Miktar',
    'Birim',
    `Birim Maliyet (${currency})`,
    `Toplam Maliyet (${currency})`,
    'Kar (%)',
    `Kar Tutari (${currency})`,
    'Teslim Suresi (Gun)',
    'Finansman (%)',
    `Finansman Tutari (${currency})`,
    'Vergiler (%)',
    `Vergi Tutari (${currency})`,
    `Nakliye ve Kargo (${currency})`,
    'KDV Finansmani 180 Gun Aktif',
    `KDV Finansmani Baz (${vatFinancingBasis === 'kdv_tutari' ? 'KDV Tutari' : 'Maliyet'})`,
    'KDV Finansmani (%)',
    `KDV Finansman Tutari (${currency})`,
    'KDV (%)',
    `Birim Teklif Fiyat KDV Haric (${currency})`,
    `Toplam Teklif KDV Haric (${currency})`,
    `KDV Tutari (${currency})`,
    `Toplam Teklif KDV Dahil (${currency})`,
  ];

  const rows = items.map((it, idx) => [
    idx + 1,
    it.stockNumber,
    it.partNumber,
    it.materialName,
    it.supplierCompany,
    it.quantity,
    it.unit,
    it.unitCost.toFixed(2),
    it.costTotal.toFixed(2),
    it.profitRate.toFixed(2),
    it.profitAmount.toFixed(2),
    it.deliveryDays,
    it.financingRate.toFixed(2),
    it.financingAmount.toFixed(2),
    it.taxRate.toFixed(2),
    it.taxAmount.toFixed(2),
    it.shippingAmount.toFixed(2),
    it.vatFinancing180Enabled ? 'Evet' : 'Hayir',
    vatFinancingBasis === 'kdv_tutari' ? 'KDV Tutari' : 'Maliyet',
    it.vatFinancingRate.toFixed(2),
    it.vatFinancingAmount.toFixed(2),
    it.vatRate.toFixed(2),
    it.netOfferUnitPrice.toFixed(2),
    it.netOfferTotal.toFixed(2),
    it.vatAmount.toFixed(2),
    it.grossOfferTotal.toFixed(2),
  ]);

  const totals = summarizePricingItems(items);
  rows.push([
    'TOPLAM',
    '',
    '',
    `${tender.trackingCode} - ${tender.title}`,
    '',
    '',
    '',
    '',
    totals.totalCost.toFixed(2),
    '',
    totals.totalProfit.toFixed(2),
    '',
    '',
    totals.totalDeliveryFinancing.toFixed(2),
    '',
    totals.totalTaxes.toFixed(2),
    totals.totalShipping.toFixed(2),
    '',
    '',
    '',
    totals.totalVatFinancing.toFixed(2),
    '',
    '',
    totals.totalBidNet.toFixed(2),
    totals.totalVat.toFixed(2),
    totals.totalBidGross.toFixed(2),
  ]);

  const csvContent =
    '\uFEFF' +
    [headers, ...rows]
      .map((line) => line.map((c) => escapeCsvCell(c)).join(';'))
      .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Fiyat_Calismasi_${tender.trackingCode.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function printTenderPricingReport(
  tender: Tender,
  items: TenderPricingItem[],
  currency: CurrencyCode,
  vatFinancingBasis: VatFinancingBasis,
  companyName?: string
): void {
  const totals = summarizePricingItems(items);
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rowsHtml = items
    .map(
      (it, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>
          <strong>${esc(it.materialName)}</strong>
          <div style="font-size:10px;color:#4E5D6C;">
            ${it.stockNumber ? `Stok: ${esc(it.stockNumber)} · ` : ''}${
        it.partNumber ? `Parça: ${esc(it.partNumber)} · ` : ''
      }${esc(it.supplierCompany || '—')}
          </div>
        </td>
        <td style="text-align:right;font-family:monospace;">${it.quantity} ${esc(it.unit)}</td>
        <td style="text-align:right;font-family:monospace;">${esc(formatCurrency(it.costTotal, currency))}</td>
        <td style="text-align:right;font-family:monospace;">%${it.profitRate.toFixed(2)}<br/><span style="font-size:10px;color:#4E5D6C;">${esc(formatCurrency(it.profitAmount, currency))}</span></td>
        <td style="text-align:right;font-family:monospace;">${it.deliveryDays}g · %${it.financingRate.toFixed(2)}<br/><span style="font-size:10px;color:#4E5D6C;">${esc(formatCurrency(it.financingAmount, currency))}</span></td>
        <td style="text-align:right;font-family:monospace;">%${it.taxRate.toFixed(2)}<br/><span style="font-size:10px;color:#4E5D6C;">${esc(formatCurrency(it.taxAmount, currency))}</span></td>
        <td style="text-align:right;font-family:monospace;">${esc(formatCurrency(it.shippingAmount, currency))}</td>
        <td style="text-align:right;font-family:monospace;">${
          it.vatFinancing180Enabled ? `%${it.vatFinancingRate.toFixed(2)}` : 'Pasif'
        }<br/><span style="font-size:10px;color:#4E5D6C;">${esc(formatCurrency(it.vatFinancingAmount, currency))}</span></td>
        <td style="text-align:right;font-family:monospace;"><strong>${esc(formatCurrency(it.netOfferUnitPrice, currency))}</strong></td>
        <td style="text-align:right;font-family:monospace;"><strong>${esc(formatCurrency(it.netOfferTotal, currency))}</strong></td>
      </tr>
    `
    )
    .join('');

  const html = `<!DOCTYPE html>
  <html lang="tr">
    <head>
      <meta charset="utf-8" />
      <title>İhale Fiyat Çalışması - ${esc(tender.trackingCode)}</title>
      <style>
        body { font-family: Arial, Helvetica, sans-serif; color: #0B2239; margin: 24px; font-size: 12px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0B2239; padding-bottom: 12px; margin-bottom: 16px; }
        .title { font-size: 18px; font-weight: 700; margin: 0 0 4px 0; }
        .sub { font-size: 11px; color: #4E5D6C; margin: 0; }
        .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }
        .kpi { border: 1px solid #DCE3EC; border-radius: 6px; padding: 8px 10px; }
        .kpi-label { font-size: 10px; color: #4E5D6C; }
        .kpi-val { font-size: 13px; font-weight: 700; font-family: monospace; margin-top: 3px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: #0B2239; color: #fff; text-align: left; padding: 7px 6px; font-size: 10px; }
        td { border-bottom: 1px solid #DCE3EC; padding: 7px 6px; vertical-align: top; }
        tfoot td { background: #F3F6FA; font-weight: 700; border-top: 2px solid #0B2239; }
        @media print { body { margin: 12px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="title">İhale Maliyet ve Fiyat Çalışma Cetveli</h1>
          <p class="sub">${esc(companyName || 'TINIATECH')} · İhale: <strong>${esc(tender.trackingCode)}</strong> — ${esc(tender.title)} (${esc(tender.authority)})</p>
        </div>
        <div style="text-align:right;font-size:11px;">
          <div>KDV Finansman Bazı (180 Gün): <strong>${vatFinancingBasis === 'kdv_tutari' ? 'KDV Tutarı (%)' : 'Maliyet Tutarı (%)'}</strong></div>
          <div>Para Birimi: <strong>${esc(currency)}</strong></div>
        </div>
      </div>

      <div class="summary">
        <div class="kpi"><div class="kpi-label">Toplam Maliyet</div><div class="kpi-val">${esc(formatCurrency(totals.totalCost, currency))}</div></div>
        <div class="kpi"><div class="kpi-label">Toplam Kâr</div><div class="kpi-val">${esc(formatCurrency(totals.totalProfit, currency))}</div></div>
        <div class="kpi"><div class="kpi-label">Finansman + 180G KDV Fin.</div><div class="kpi-val">${esc(formatCurrency(totals.totalDeliveryFinancing + totals.totalVatFinancing, currency))}</div></div>
        <div class="kpi"><div class="kpi-label">Vergi + Nakliye</div><div class="kpi-val">${esc(formatCurrency(totals.totalTaxes + totals.totalShipping, currency))}</div></div>
        <div class="kpi"><div class="kpi-label">Toplam Teklif (KDV Hariç)</div><div class="kpi-val">${esc(formatCurrency(totals.totalBidNet, currency))}</div></div>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Ürün / Malzeme</th>
            <th style="text-align:right;">Miktar</th>
            <th style="text-align:right;">Maliyet</th>
            <th style="text-align:right;">Kâr (%)</th>
            <th style="text-align:right;">Teslim Fin. (%)</th>
            <th style="text-align:right;">Vergiler (%)</th>
            <th style="text-align:right;">Nakliye</th>
            <th style="text-align:right;">180G KDV Fin. (%)</th>
            <th style="text-align:right;">Birim Teklif</th>
            <th style="text-align:right;">Kalem Teklif</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="3">GENEL TOPLAM (KDV Hariç)</td>
            <td style="text-align:right;font-family:monospace;">${esc(formatCurrency(totals.totalCost, currency))}</td>
            <td style="text-align:right;font-family:monospace;">${esc(formatCurrency(totals.totalProfit, currency))}</td>
            <td style="text-align:right;font-family:monospace;">${esc(formatCurrency(totals.totalDeliveryFinancing, currency))}</td>
            <td style="text-align:right;font-family:monospace;">${esc(formatCurrency(totals.totalTaxes, currency))}</td>
            <td style="text-align:right;font-family:monospace;">${esc(formatCurrency(totals.totalShipping, currency))}</td>
            <td style="text-align:right;font-family:monospace;">${esc(formatCurrency(totals.totalVatFinancing, currency))}</td>
            <td></td>
            <td style="text-align:right;font-family:monospace;">${esc(formatCurrency(totals.totalBidNet, currency))}</td>
          </tr>
        </tfoot>
      </table>
      </body>
  </html>`;

  // Gizli iframe ile yazdır: pop-up engelleyicilere takılmaz ve
  // window.open + 'noopener' kaynaklı null dönüş sorununu önler.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 1000);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.addEventListener('afterprint', cleanup);
    win.focus();
    win.print();
    // afterprint tetiklenmezse (bazı tarayıcılar) yine de temizle
    window.setTimeout(cleanup, 60000);
  };

  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
