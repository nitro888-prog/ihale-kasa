import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Tender } from '../types/tender';
import { getTodayDateStr } from '../lib/trackingAndCalendar';

interface MonthlyTenderSummaryChartProps {
  tenders: Tender[];
}

interface MonthlyBucket {
  monthKey: string;
  label: string;
  devamEden: number;
  kazanilan: number;
  sonuclanan: number;
  iptal: number;
  toplam: number;
}

const TURKISH_MONTH_SHORT = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
];

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const name = TURKISH_MONTH_SHORT[(m || 1) - 1] || monthKey;
  return `${name} ${String(y).slice(-2)}`;
}

function getSixMonthWindowKeys(centerDateStr: string): string[] {
  const [y, m] = centerDateStr.split('-').map(Number);
  const base = new Date(y, (m || 1) - 1, 1);
  // Show 2 months before current month, current month, and 3 months ahead (6-month tender horizon)
  const keys: string[] = [];
  for (let offset = -2; offset <= 3; offset++) {
    const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    payload: MonthlyBucket;
  }>;
  label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;

  return (
    <div className="bg-white border border-[#DCE3EC] rounded-lg p-3 shadow-sm min-w-[180px] text-xs">
      <div className="font-semibold text-[#0B2239] pb-1.5 mb-1.5 border-b border-[#DCE3EC] flex items-center justify-between gap-4">
        <span>{label}</span>
        <span className="font-mono tabular-nums text-[#4E5D6C]">
          Toplam {row?.toplam ?? 0}
        </span>
      </div>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-[#4E5D6C]">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span>{entry.name}</span>
            </span>
            <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const MonthlyTenderSummaryChart: React.FC<MonthlyTenderSummaryChartProps> = ({
  tenders,
}) => {
  const [rangeMode, setRangeMode] = useState<'horizon' | 'all'>('horizon');
  const todayStr = getTodayDateStr();

  const { chartData, totals } = useMemo(() => {
    const bucketMap = new Map<string, MonthlyBucket>();

    if (rangeMode === 'horizon') {
      for (const mk of getSixMonthWindowKeys(todayStr)) {
        bucketMap.set(mk, {
          monthKey: mk,
          label: formatMonthLabel(mk),
          devamEden: 0,
          kazanilan: 0,
          sonuclanan: 0,
          iptal: 0,
          toplam: 0,
        });
      }
    }

    for (const t of tenders) {
      const mk = (t.tenderDate || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(mk)) continue;
      if (rangeMode === 'horizon' && !bucketMap.has(mk)) continue;

      let bucket = bucketMap.get(mk);
      if (!bucket) {
        bucket = {
          monthKey: mk,
          label: formatMonthLabel(mk),
          devamEden: 0,
          kazanilan: 0,
          sonuclanan: 0,
          iptal: 0,
          toplam: 0,
        };
        bucketMap.set(mk, bucket);
      }

      if (t.status === 'kazanildi') {
        bucket.kazanilan += 1;
      } else if (t.status === 'iptal') {
        bucket.iptal += 1;
      } else if (t.status === 'sonuclandi') {
        bucket.sonuclanan += 1;
      } else {
        // hazirlik, onay_bekliyor, teslim_edildi
        bucket.devamEden += 1;
      }
      bucket.toplam += 1;
    }

    const sorted = Array.from(bucketMap.values()).sort((a, b) =>
      a.monthKey.localeCompare(b.monthKey)
    );

    const summaryTotals = sorted.reduce(
      (acc, cur) => ({
        devamEden: acc.devamEden + cur.devamEden,
        kazanilan: acc.kazanilan + cur.kazanilan,
        sonuclanan: acc.sonuclanan + cur.sonuclanan,
        iptal: acc.iptal + cur.iptal,
      }),
      { devamEden: 0, kazanilan: 0, sonuclanan: 0, iptal: 0 }
    );

    return { chartData: sorted, totals: summaryTotals };
  }, [tenders, rangeMode, todayStr]);

  return (
    <section
      aria-label="Aylık İhale Özeti Grafiği"
      className="bg-white border border-[#DCE3EC] rounded-xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-[#DCE3EC] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-[#0B2239]">
            Aylık İhale Özeti ve Durum Dağılımı
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#4E5D6C]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#0066B3] inline-block" />
              <span>Devam Eden</span>
              <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
                {totals.devamEden}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#007A53] inline-block" />
              <span>Kazanılan</span>
              <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
                {totals.kazanilan}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#0B2239] inline-block" />
              <span>Sonuçlanan</span>
              <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
                {totals.sonuclanan}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#DC2626] inline-block" />
              <span>İptal / Kayıp</span>
              <span className="font-mono font-semibold text-[#0B2239] tabular-nums">
                {totals.iptal}
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#F3F6FA] rounded-lg self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setRangeMode('horizon')}
            className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              rangeMode === 'horizon'
                ? 'bg-white text-[#0B2239] shadow-xs'
                : 'text-[#4E5D6C] hover:text-[#0B2239]'
            }`}
          >
            6 Aylık Dönem
          </button>
          <button
            type="button"
            onClick={() => setRangeMode('all')}
            className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              rangeMode === 'all'
                ? 'bg-white text-[#0B2239] shadow-xs'
                : 'text-[#4E5D6C] hover:text-[#0B2239]'
            }`}
          >
            Tüm Aylar
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5 h-[260px] w-full">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-[#4E5D6C]">
            Grafik için görüntülenecek aylık ihale verisi bulunmuyor.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
              barSize={28}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#DCE3EC" />
              <XAxis
                dataKey="label"
                axisLine={{ stroke: '#DCE3EC' }}
                tickLine={false}
                tick={{ fill: '#4E5D6C', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#4E5D6C', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: 'rgba(243, 246, 250, 0.8)' }}
              />
              <Bar
                dataKey="devamEden"
                name="Devam Eden"
                stackId="tenders"
                fill="#0066B3"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="kazanilan"
                name="Kazanılan"
                stackId="tenders"
                fill="#007A53"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="sonuclanan"
                name="Sonuçlanan"
                stackId="tenders"
                fill="#0B2239"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="iptal"
                name="İptal / Kayıp"
                stackId="tenders"
                fill="#DC2626"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
};
