import { useEffect } from 'react';

/**
 * D-pad navigation for TV remotes. Any element with [data-focusable] can receive focus.
 * Arrow keys move focus to the nearest focusable element in that direction.
 * Enter/Select activates the focused element via its native click.
 */
type Dir = 'left' | 'right' | 'up' | 'down';

const KEY_TO_DIR: Record<string, Dir> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
};

function candidates(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-focusable]'))
    .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
}

export function focusFirst(scope?: string) {
  const root: ParentNode = scope ? (document.querySelector(scope) ?? document) : document;
  const el = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>('[data-focusable]');
  el?.focus({ preventScroll: false });
}

export function moveFocus(dir: Dir): boolean {
  const all = candidates();
  const current = document.activeElement as HTMLElement | null;
  if (!current || !all.includes(current)) { all[0]?.focus(); return all.length > 0; }
  const a = current.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const el of all) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = cx - ax, dy = cy - ay;
    const inDir = dir === 'left' ? dx < -4 && Math.abs(dx) >= Math.abs(dy) * 0.4
      : dir === 'right' ? dx > 4 && Math.abs(dx) >= Math.abs(dy) * 0.4
      : dir === 'up' ? dy < -4 && Math.abs(dy) >= Math.abs(dx) * 0.4
      : dy > 4 && Math.abs(dy) >= Math.abs(dx) * 0.4;
    if (!inDir) continue;
    const primary = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
    const secondary = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = primary + secondary * 2.2; // favour staying in the same row/column
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); return true; }
  return false;
}

/** onBack is called for the remote Back button (Escape / Backspace / GoBack / keyCode 4). */
export function useSpatialNav(onBack: () => boolean) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const dir = KEY_TO_DIR[e.key];
      if (dir) { e.preventDefault(); moveFocus(dir); return; }
      const isBack = e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.keyCode === 4 || (e.key === 'Backspace' && !(e.target instanceof HTMLInputElement));
      if (isBack && onBack()) e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onBack]);
}
