'use client';
import Link from 'next/link';

/** A player's name rendered as a link to their profile page. Inherits text
 *  color from the parent (pass `className` to style it); adds a hover cue. */
export default function PlayerLink({ name, className = '' }: { name: string; className?: string }) {
  return (
    <Link
      href={`/stats/player/${encodeURIComponent(name)}`}
      className={`hover:text-gold hover:underline underline-offset-2 ${className}`}
    >
      {name}
    </Link>
  );
}
