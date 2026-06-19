'use client';
import { useState } from 'react';
import { ROSTER } from '@/lib/roster';

const OTHER = '__other__';

/**
 * Name picker backed by the club roster, with an "Other (guest)" escape hatch
 * that reveals a free-text field. Keeps recorded names consistent so each
 * player's stats stay under one identity.
 */
export default function PlayerNameSelect({
  value,
  onChange,
  placeholder = 'Select player…',
  className = '',
}: {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  className?: string;
}) {
  // "Other" mode if there's a value that isn't a roster name (e.g. a guest).
  const [other, setOther] = useState<boolean>(() => !!value && !ROSTER.includes(value));
  const selectValue = other ? OTHER : ROSTER.includes(value) ? value : '';

  return (
    <div className={className}>
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER) {
            setOther(true);
            onChange('');
          } else {
            setOther(false);
            onChange(v);
          }
        }}
        className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2.5 outline-none focus:border-gold text-white"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {ROSTER.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value={OTHER}>Other (guest)…</option>
      </select>
      {other && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={24}
          placeholder="Guest name"
          className="mt-2 w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2.5 outline-none focus:border-gold"
        />
      )}
    </div>
  );
}
