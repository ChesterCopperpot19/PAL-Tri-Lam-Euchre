'use client';
import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    // Skip anything hidden (display:none / detached) — it can't take focus.
    (el) => el.getClientRects().length > 0
  );
}

/**
 * Accessible-modal behaviour for a dialog container:
 *  - Escape calls `onClose`
 *  - Tab / Shift+Tab are trapped inside the container
 *  - focus moves into the container on mount (`opts.initialFocus`, else the
 *    first focusable element, else the container itself)
 *  - focus is restored to the previously focused element on unmount
 *
 * Returns the ref to attach to the dialog container. Don't combine with
 * `autoFocus` on a child — React runs autoFocus during commit, before this
 * effect, which would make the child look like the "previously focused"
 * element. Pass it as `initialFocus` instead.
 */
export function useModal<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  opts?: { initialFocus?: RefObject<HTMLElement> }
): RefObject<T> {
  const ref = useRef<T>(null);
  // Latest onClose without re-binding listeners every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const initialFocus = opts?.initialFocus;

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // The container must itself be focusable as a last resort.
    if (!container.hasAttribute('tabindex')) container.tabIndex = -1;

    const target = initialFocus?.current ?? focusableIn(container)[0] ?? container;
    target.focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !container) return;

      const items = focusableIn(container);
      if (items.length === 0) {
        e.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && container.contains(active);

      if (e.shiftKey) {
        if (!inside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [initialFocus]);

  return ref;
}
