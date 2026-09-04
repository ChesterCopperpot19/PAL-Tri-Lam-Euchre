'use client';
// Date-range + source filter bar shared by the dashboard and the games archive.
// The pages own the state; this renders the controls and turns the raw input
// values into a `MatchFilter` (see `matchFilterFor`).

import type { MatchFilter } from '@/lib/stats-analytics';

export type SourceFilter = 'all' | 'app' | 'manual' | 'historical';

export type StatsFilterState = {
  dateFrom: string; // 'YYYY-MM-DD' from an <input type="date">, or ''
  dateTo: string;
  source: SourceFilter;
};

export const EMPTY_FILTERS: StatsFilterState = { dateFrom: '', dateTo: '', source: 'all' };

export function isFiltered(f: StatsFilterState): boolean {
  return Boolean(f.dateFrom || f.dateTo || f.source !== 'all');
}

/** Convert the input values to a `filterMatches` filter. The date strings are
 *  parsed in LOCAL time (match timestamps are local epoch); `Date.parse('YYYY-MM-DD')`
 *  would treat them as UTC and shift days. */
export function matchFilterFor(f: StatsFilterState): MatchFilter {
  return {
    from: f.dateFrom ? new Date(`${f.dateFrom}T00:00:00`).getTime() : undefined,
    to: f.dateTo ? new Date(`${f.dateTo}T23:59:59.999`).getTime() : undefined,
    source: f.source === 'all' ? undefined : f.source,
  };
}

const INPUT_CLASS =
  'bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 outline-none focus:border-gold text-white';

export default function StatsFilters({
  value,
  onChange,
  className = '',
  children,
}: {
  value: StatsFilterState;
  onChange: (next: StatsFilterState) => void;
  className?: string;
  /** Extra controls rendered at the right edge (e.g. Compare / CSV buttons). */
  children?: React.ReactNode;
}) {
  const set = (patch: Partial<StatsFilterState>) => onChange({ ...value, ...patch });
  return (
    <section
      className={`bg-black/30 border border-white/10 rounded-2xl p-4 flex flex-wrap items-end gap-3 ${className}`}
    >
      <label className="text-xs text-white/60">
        <span className="uppercase tracking-wider block mb-1">From</span>
        <input
          type="date"
          value={value.dateFrom}
          onChange={(e) => set({ dateFrom: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <label className="text-xs text-white/60">
        <span className="uppercase tracking-wider block mb-1">To</span>
        <input
          type="date"
          value={value.dateTo}
          onChange={(e) => set({ dateTo: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <label className="text-xs text-white/60">
        <span className="uppercase tracking-wider block mb-1">Games</span>
        <select
          value={value.source}
          onChange={(e) => set({ source: e.target.value as SourceFilter })}
          className={INPUT_CLASS}
        >
          <option value="all">All</option>
          <option value="app">Online</option>
          <option value="manual">In person</option>
          <option value="historical">Historical</option>
        </select>
      </label>
      {isFiltered(value) && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-xs text-white/60 hover:text-white border border-white/15 rounded-lg px-2.5 py-1.5"
        >
          Clear filters
        </button>
      )}
      {children && <div className="ml-auto flex gap-2">{children}</div>}
    </section>
  );
}
