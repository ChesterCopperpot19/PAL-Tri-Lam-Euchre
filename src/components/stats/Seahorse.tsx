'use client';

/** A small seahorse icon (there is no seahorse emoji, so it's hand-drawn).
 *  Uses currentColor, so set the color via a parent/`className`. */
export default function Seahorse({
  size = 16,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* head → arched back → belly → lower body, one stroke */}
      <path d="M9.4 7.4c0-2 1.5-3.5 3.5-3.5 1.9 0 3.2 1.5 3 3.3-.15 1.4-1.1 2.1-2.2 2.8-1.5.9-2.3 1.9-2.3 3.5 0 1.6.9 2.7 2 3.4 1.1.7 1.7 1.6 1.5 2.8" />
      {/* snout */}
      <path d="M9.5 6.9c-1.3-.4-2.5 0-3.1 1" />
      {/* coronet on the head */}
      <path d="M12.3 4.1l.1-1.4M14.1 4.2l.5-1.3" />
      {/* dorsal fin ridges down the back */}
      <path d="M16 8.4c.9 0 1.3.7 1.1 1.5" />
      <path d="M14.9 11.3c.9.1 1.3.8.9 1.6" />
      {/* curled tail */}
      <path d="M14.9 19.7c.3 1.2-.6 2.2-1.8 2.1-.9-.07-1.5-.8-1.3-1.6.16-.7.9-1 1.5-.7" />
      {/* eye */}
      <circle cx="12.9" cy="6.1" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}
