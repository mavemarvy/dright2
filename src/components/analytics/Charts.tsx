// ─────────────────────────────────────────────────────────────────────────────
// DRIGHT Chart Components — SVG-based, no external chart library
// Lightweight, interactive, Tailwind-styled
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';

interface DataPoint {
  label: string;
  value: number;
  [key: string]: string | number;
}

// ─── Line Chart ───────────────────────────────────────────────────────────────

export function LineChart({
  data,
  dataKey = 'value',
  color = '#6366f1',
  height = 200,
  showDots = true,
  formatValue,
}: {
  data: DataPoint[];
  dataKey?: string;
  color?: string;
  height?: number;
  showDots?: boolean;
  formatValue?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 800;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const { points } = useMemo(() => {
    if (!data.length) return { points: [] };
    const vals = data.map((d) => Number(d[dataKey]) || 0);
    const max = Math.max(...vals, 1);
    const min = Math.min(...vals, 0);
    const range = max - min || 1;
    const pts = data.map((d, i) => ({
      x: padding.left + (i / Math.max(data.length - 1, 1)) * innerW,
      y: padding.top + innerH - ((Number(d[dataKey]) || 0) - min) / range * innerH,
      value: Number(d[dataKey]) || 0,
      label: d.label,
    }));
    return { points: pts };
  }, [data, dataKey, innerW, innerH]);

  if (!data.length) return <NoData height={height} />;

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + innerH} L ${points[0].x} ${padding.top + innerH} Z`;

  return (
    <div className="relative w-full" style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={padding.left} y1={padding.top + t * innerH} x2={padding.left + innerW} y2={padding.top + t * innerH} stroke="currentColor" strokeOpacity={0.1} strokeWidth={1} />
        ))}
        {/* Area */}
        <path d={areaD} fill={`url(#grad-${color.replace('#', '')})`} />
        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Dots */}
        {showDots && points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 5 : 3} fill={color} stroke="white" strokeWidth={1.5} className="transition-all cursor-pointer" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
        {/* Hover tooltip */}
        {hover !== null && points[hover] && (
          <g>
            <line x1={points[hover].x} y1={padding.top} x2={points[hover].x} y2={padding.top + innerH} stroke={color} strokeOpacity={0.3} strokeDasharray="4 4" />
          </g>
        )}
      </svg>
      {hover !== null && points[hover] && (
        <div className="absolute pointer-events-none rounded-lg bg-gray-900 dark:bg-gray-800 text-white text-xs px-2 py-1 shadow-lg whitespace-nowrap z-10" style={{ left: `${(points[hover].x / width) * 100}%`, top: 0, transform: 'translateX(-50%)' }}>
          <div className="font-medium">{points[hover].label}</div>
          <div className="text-gray-300">{formatValue ? formatValue(points[hover].value) : points[hover].value}</div>
        </div>
      )}
    </div>
  );
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

export function BarChart({
  data,
  dataKey = 'value',
  color = '#6366f1',
  height = 200,
  formatValue,
}: {
  data: DataPoint[];
  dataKey?: string;
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 800;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const { bars } = useMemo(() => {
    if (!data.length) return { bars: [] };
    const vals = data.map((d) => Number(d[dataKey]) || 0);
    const max = Math.max(...vals, 1);
    const barW = innerW / data.length * 0.7;
    const gap = innerW / data.length * 0.3;
    const bs = data.map((d, i) => ({
      x: padding.left + i * (barW + gap) + gap / 2,
      y: padding.top + innerH - (Number(d[dataKey]) || 0) / max * innerH,
      w: barW,
      h: (Number(d[dataKey]) || 0) / max * innerH,
      value: Number(d[dataKey]) || 0,
      label: d.label,
    }));
    return { bars: bs };
  }, [data, dataKey, innerW, innerH]);

  if (!data.length) return <NoData height={height} />;

  return (
    <div className="relative w-full" style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={padding.left} y1={padding.top + t * innerH} x2={padding.left + innerW} y2={padding.top + t * innerH} stroke="currentColor" strokeOpacity={0.1} strokeWidth={1} />
        ))}
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={Math.max(b.h, 0)} rx={4} fill={color} fillOpacity={hover === i ? 1 : 0.8} className="transition-all cursor-pointer" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      {hover !== null && bars[hover] && (
        <div className="absolute pointer-events-none rounded-lg bg-gray-900 dark:bg-gray-800 text-white text-xs px-2 py-1 shadow-lg whitespace-nowrap z-10" style={{ left: `${(bars[hover].x / width) * 100}%`, top: 0, transform: 'translateX(-50%)' }}>
          <div className="font-medium">{bars[hover].label}</div>
          <div className="text-gray-300">{formatValue ? formatValue(bars[hover].value) : bars[hover].value}</div>
        </div>
      )}
    </div>
  );
}

// ─── Area Chart (same as Line but with more emphasis on fill) ───────────────────

export function AreaChart(props: React.ComponentProps<typeof LineChart>) {
  return <LineChart {...props} showDots={false} />;
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────

export function DonutChart({
  data,
  size = 180,
  thickness = 30,
}: {
  data: { label: string; value: number; color?: string }[];
  size?: number;
  thickness?: number;
}) {
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#ef4444', '#84cc16', '#f97316'];
  const total = data.reduce((sum, d) => sum + (d.value || 0), 0);
  const [hover, setHover] = useState<number | null>(null);
  const radius = size / 2;
  const innerR = radius - thickness;

  if (!total) return <NoData height={size} />;

  let cumulativeAngle = -Math.PI / 2;
  const segments = data.map((d, i) => {
    const fraction = (d.value || 0) / total;
    const angle = fraction * Math.PI * 2;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;
    const x1 = radius + radius * Math.cos(startAngle);
    const y1 = radius + radius * Math.sin(startAngle);
    const x2 = radius + radius * Math.cos(endAngle);
    const y2 = radius + radius * Math.sin(endAngle);
    const x3 = radius + innerR * Math.cos(endAngle);
    const y3 = radius + innerR * Math.sin(endAngle);
    const x4 = radius + innerR * Math.cos(startAngle);
    const y4 = radius + innerR * Math.sin(startAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z`;
    return { path, color: d.color || colors[i % colors.length], label: d.label, value: d.value, fraction };
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} fillOpacity={hover === i ? 1 : 0.85} stroke="white" strokeWidth={2} className="transition-all cursor-pointer" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
        <text x={radius} y={radius} textAnchor="middle" dominantBaseline="middle" className="fill-current text-gray-900 dark:text-white font-bold text-lg">
          {hover !== null ? `${(segments[hover].fraction * 100).toFixed(0)}%` : total.toLocaleString()}
        </text>
      </svg>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color || colors[i % colors.length] }} />
            <span className="text-gray-600 dark:text-gray-400">{d.label}</span>
            <span className="font-medium text-gray-900 dark:text-white">{(d.value || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Funnel Chart ──────────────────────────────────────────────────────────────

export function FunnelChart({
  steps,
  formatValue,
}: {
  steps: { step: string; count: number }[];
  formatValue?: (v: number) => string;
}) {
  if (!steps.length || steps[0].count === 0) return <NoData height={200} />;

  const maxCount = steps[0].count;
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const widthPct = (s.count / maxCount) * 100;
        const dropoff = i > 0 ? ((steps[i - 1].count - s.count) / steps[i - 1].count * 100) : 0;
        const conversion = (s.count / maxCount * 100);
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">{s.step}</span>
              <span className="text-gray-500 dark:text-gray-400">
                {formatValue ? formatValue(s.count) : s.count.toLocaleString()}
                {i > 0 && <span className="ml-2 text-red-400">-{dropoff.toFixed(1)}%</span>}
                <span className="ml-2 text-green-500">{conversion.toFixed(1)}%</span>
              </span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden h-8">
              <div className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2 text-white text-xs font-medium" style={{ width: `${widthPct}%`, backgroundColor: `hsl(${240 - i * 25}, 70%, 55%)` }}>
                {widthPct > 15 && (formatValue ? formatValue(s.count) : s.count.toLocaleString())}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── No Data Placeholder ──────────────────────────────────────────────────────

function NoData({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm" style={{ height }}>
      No data yet
    </div>
  );
}

// ─── Time Period Selector ──────────────────────────────────────────────────────

export type TimePeriod = 'today' | 'yesterday' | '7d' | '30d' | '90d' | '1y' | 'lifetime';

export const TIME_PERIODS: { label: string; value: TimePeriod; days: number }[] = [
  { label: 'Today', value: 'today', days: 1 },
  { label: 'Yesterday', value: 'yesterday', days: 1 },
  { label: '7 Days', value: '7d', days: 7 },
  { label: '30 Days', value: '30d', days: 30 },
  { label: '90 Days', value: '90d', days: 90 },
  { label: '1 Year', value: '1y', days: 365 },
  { label: 'Lifetime', value: 'lifetime', days: 9999 },
];

export function TimePeriodSelector({ value, onChange }: { value: TimePeriod; onChange: (v: TimePeriod) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TIME_PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            value === p.value
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ─── Stat Card with Live Indicator ─────────────────────────────────────────────

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = 'text-indigo-500',
  bg = 'bg-indigo-50',
  live = false,
  loading = false,
  formatValue,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  color?: string;
  bg?: string;
  live?: boolean;
  loading?: boolean;
  formatValue?: (v: number | string) => string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1.5">
            {live && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span>}
            {label}
          </p>
          {loading ? (
            <div className="h-7 w-20 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 dark:text-white truncate">
              {formatValue ? formatValue(value) : typeof value === 'number' ? value.toLocaleString() : value}
            </p>
          )}
          {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
        </div>
        {Icon && (
          <div className={`p-2 rounded-lg ${bg} ${color} shrink-0`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}
