'use client';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/shared-types';

export default function Chat({
  messages,
  onSend,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  // Track whether the reader is at (or near) the bottom — if they've scrolled
  // up to read history, new messages shouldn't yank them back down.
  const atBottomRef = useRef(true);

  useEffect(() => {
    if (atBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages.length]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }

  return (
    <div className="flex flex-col h-full bg-black/55 border border-white/10 rounded-xl overflow-hidden">
      <div className="px-3 py-2 text-xs uppercase tracking-wider text-white/70 border-b border-white/10 bg-white/5">
        Table chat
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 text-sm"
      >
        {messages.length === 0 && (
          <div className="text-white/40 italic">Say hi to your friends 👋</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="leading-snug">
            <span
              className={`font-medium ${m.fromSpectator ? 'text-violet-300' : 'text-gold'}`}
            >
              {m.fromSpectator ? `[👁 ${m.from}]` : m.from}:
            </span>{' '}
            <span className="text-white/90">{m.text}</span>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="p-2 border-t border-white/10 flex gap-2 bg-white/5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={240}
          className="flex-1 bg-black/40 border border-white/15 rounded-md px-2 py-1.5 text-sm outline-none focus:border-gold"
        />
        <button
          type="submit"
          className="bg-gold text-black px-3 py-1.5 rounded-md text-sm font-medium hover:brightness-110"
        >
          Send
        </button>
      </form>
    </div>
  );
}
