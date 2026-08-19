'use client';

import { motion } from 'framer-motion';
import type { ScorecardData, ScorecardRow } from '@/lib/domain/scorecard';
import { formatCount, formatMoney } from '@/lib/format';

/** Conversion 色块三档(设计 §4):≥50 绿、20–49.9 黄、<20 红;无估价(null)灰 '—'。 */
function conversionClass(conversionPct: number | null): string {
  if (conversionPct === null) return 'bg-panel-2 text-muted';
  if (conversionPct >= 50) return 'bg-green-500/20 text-green-300';
  if (conversionPct >= 20) return 'bg-yellow-500/20 text-yellow-300';
  return 'bg-red-500/20 text-red-300';
}

function TotalBlock({ label, value, money }: { label: string; value: string; money?: boolean }) {
  return (
    <div className="flex flex-col justify-center rounded-xl bg-panel/70 px-8 backdrop-blur-sm">
      <p className="text-2xl text-muted">{label}</p>
      <p className={`mt-1 font-display text-5xl ${money ? 'text-money neon-text' : 'text-ink'}`}>
        {value}
      </p>
    </div>
  );
}

export default function ScorecardSlide({
  data,
  rows,
  heading,
  subheading,
}: {
  data: ScorecardData;   // 满表:totals 与绝对名次的基准(分页切片后 rank 仍正确)
  rows: ScorecardRow[];  // 当前页切片(TvApp pageSlice)
  heading: string;       // 'SALES SCORECARD'(MTD/YTD 共用,E2E 钉死)
  subheading: string;    // MTD:`periodLabel · MONTH TO DATE`;YTD:`fyLabel · YEAR TO DATE`
}) {
  // rank = 行在本 section 满表 data.rows 里的绝对名次(服务端已按 gciCents desc 排好序)。
  const rankOf = new Map(data.rows.map((r, i) => [r.agentId, i + 1]));
  return (
    <div className="flex h-full w-full flex-col px-16 py-12">
      <div className="flex items-baseline justify-between">
        <h1 className="font-display text-6xl text-neon neon-text">{heading}</h1>
        <span className="font-heading text-3xl text-muted">{subheading}</span>
      </div>
      {data.rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-4xl text-muted">No data yet</p>
        </div>
      ) : (
        <>
          {/* 汇总块 h-[120px] 与下方表头 h-[48px]、行 h-[56px]、两个 mt-8:
              TvApp 的 SCORECARD_RESERVED_PX(388)/SCORECARD_ITEM_PX(56)依赖这些定值,
              改任何一边必须同步另一边。 */}
          <div className="mt-8 grid h-[120px] grid-cols-4 gap-6">
            <TotalBlock label="TOTAL APPRAISALS" value={String(data.totals.appraisals)} />
            <TotalBlock label="TOTAL LISTINGS" value={formatCount(data.totals.listings)} />
            <TotalBlock label="TOTAL SALES" value={formatCount(data.totals.salesSplit)} />
            <TotalBlock label="TOTAL GROSS COMM" value={formatMoney(data.totals.gciCents)} money />
          </div>
          <div className="mt-8 flex-1 overflow-hidden rounded-xl bg-panel/60 px-6 backdrop-blur-sm">
            {/* Tailwind preflight 已设 border-collapse:collapse,行高恰为 56px;
                行间不加边框,避免像素累计漂移破坏分页容量计算。 */}
            <table className="w-full table-fixed text-left">
              <thead>
                <tr className="h-[48px] text-2xl text-muted">
                  <th className="w-24 font-medium">Rank</th>
                  <th className="font-medium">Name</th>
                  <th className="w-44 font-medium">Appraisals</th>
                  <th className="w-36 font-medium">Listings</th>
                  <th className="w-28 font-medium">Sales</th>
                  <th className="w-28 font-medium">Split</th>
                  <th className="w-52 font-medium">Gross Comm</th>
                  <th className="w-44 font-medium">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <motion.tr
                    key={row.agentId}
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.35 }}
                    className="h-[56px] text-3xl text-ink"
                  >
                    <td className="font-display text-muted">{rankOf.get(row.agentId)}</td>
                    <td className="truncate font-heading">{row.name}</td>
                    <td>{row.appraisals}</td>
                    <td>{formatCount(row.listings)}</td>
                    <td>{formatCount(row.sales)}</td>
                    <td>{formatCount(row.split)}</td>
                    <td className="font-display text-money">{formatMoney(row.gciCents)}</td>
                    <td>
                      <span
                        className={`inline-block rounded px-3 py-1 text-2xl ${conversionClass(row.conversionPct)}`}
                      >
                        {row.conversionPct === null ? '—' : `${row.conversionPct}%`}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
