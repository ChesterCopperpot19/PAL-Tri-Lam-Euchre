'use client';
import { useEffect, useState } from 'react';

const KEY = 'euchre.playerId';

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Stable per-browser id, used as the reconnect handle for a seat. */
export function usePlayerId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let v = localStorage.getItem(KEY);
    if (!v) {
      v = uuid();
      localStorage.setItem(KEY, v);
    }
    setId(v);
  }, []);
  return id;
}

export function useDisplayName(): [string, (n: string) => void] {
  const [name, setName] = useState('');
  useEffect(() => {
    const saved = localStorage.getItem('euchre.name') || '';
    setName(saved);
  }, []);
  const update = (n: string) => {
    setName(n);
    localStorage.setItem('euchre.name', n);
  };
  return [name, update];
}
