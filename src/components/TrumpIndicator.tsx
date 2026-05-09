'use client';
import { SuitGlyph } from './Card';
import type { Suit } from '@/server/engine/types';

export default function TrumpIndicator({ trump }: { trump: Suit | null }) {
  if (!trump) return null;
  return (
    <div className="flex items-center gap-2 bg-black/55 border border-gold/50 rounded-full px-3 py-1.5 shadow-lg">
      <span className="text-xs uppercase tracking-wider text-white/70">Trump</span>
      <SuitGlyph suit={trump} size={22} color="#FFB81C" />
    </div>
  );
}
