import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/** What controls drawn while presenting show and do; `current` is 1-based. */
export interface PresentationControls {
  current: number;
  total: number;
  previous(): void;
  next(): void;
  exit(): void;
}

export type RenderPresentationControls = (controls: PresentationControls) => ReactNode;

export interface PresentationShellProps {
  slideCount: number;
  startIndex: number;
  label: string;
  counterLabel: (current: number, total: number) => string;
  exitLabel: string;
  previousLabel: string;
  nextLabel: string;
  controls?: RenderPresentationControls;
  onExit: () => void;
}

const IDLE_MS = 2500;
const SWIPE_PX = 50;

export function PresentationShell({
  slideCount,
  startIndex,
  label,
  counterLabel,
  exitLabel,
  previousLabel,
  nextLabel,
  controls,
  onExit,
  children,
}: PresentationShellProps & {
  children: (index: number, viewport: { width: number; height: number }) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const [requestedIndex, setIndex] = useState(startIndex);
  const index = Math.max(0, Math.min(requestedIndex, slideCount - 1));
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [shown, setShown] = useState(true);
  const shownRef = useRef(true);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const press = useRef<{ x: number; y: number; touch: boolean; hidden: boolean; swiped: boolean } | null>(null);
  const step = (delta: number) =>
    setIndex(Math.max(0, Math.min(index + delta, slideCount - 1)));
  const show = (hold: boolean) => {
    clearTimeout(idle.current);
    shownRef.current = true;
    setShown(true);
    if (!hold)
      idle.current = setTimeout(() => {
        shownRef.current = false;
        setShown(false);
      }, IDLE_MS);
  };

  useEffect(() => {
    show(false);
    return () => clearTimeout(idle.current);
  }, []);

  useEffect(() => {
    setIndex((current) => Math.max(0, Math.min(current, slideCount - 1)));
    if (slideCount === 0) exitRef.current();
  }, [slideCount]);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const container = containerRef.current!;
    const previousFocus = document.activeElement;
    let active = true;
    dialog.showModal();
    dialog.focus();
    void container
      .requestFullscreen?.()
      .then(() => {
        if (active) {
          dialog.close();
          dialog.showModal();
          dialog.focus();
        } else if (document.fullscreenElement === container) {
          void document.exitFullscreen().catch(() => undefined);
        }
      })
      .catch(() => undefined);
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) exitRef.current();
    };
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      active = false;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (document.fullscreenElement === container) {
        void document.exitFullscreen().catch(() => undefined);
      }
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);

  const state: PresentationControls = {
    current: index + 1,
    total: slideCount,
    previous: () => step(-1),
    next: () => step(1),
    exit: onExit,
  };

  return (
    <div ref={containerRef}>
      <dialog
        ref={dialogRef}
        aria-label={label}
        tabIndex={-1}
        style={styles.presentationOverlay}
        onCancel={(event) => {
          event.preventDefault();
          onExit();
        }}
        onPointerMove={(event) => {
          if (event.pointerType !== 'mouse') return;
          show(Boolean(layerRef.current?.contains(event.target as Node)));
        }}
        onPointerDown={(event) => {
          const touch = event.pointerType !== 'mouse';
          press.current = { x: event.clientX, y: event.clientY, touch, hidden: !shownRef.current, swiped: false };
        }}
        onPointerUp={(event) => {
          const start = press.current;
          if (!start?.touch) return;
          const dx = event.clientX - start.x;
          if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(event.clientY - start.y)) {
            show(false);
            return;
          }
          start.swiped = true;
          step(dx < 0 ? 1 : -1);
        }}
        onClick={(event) => {
          if (event.target !== dialogRef.current) return;
          const start = press.current;
          press.current = null;
          if (start?.swiped || (start?.touch && start.hidden)) return;
          step(1);
        }}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          switch (event.key) {
            case ' ':
              if (event.target instanceof HTMLElement && event.target.closest('button'))
                return;
              step(1);
              break;
            case 'ArrowRight':
            case 'ArrowDown':
            case 'PageDown':
              step(1);
              break;
            case 'ArrowLeft':
            case 'ArrowUp':
            case 'PageUp':
              step(-1);
              break;
            case 'Home':
              setIndex(0);
              break;
            case 'End':
              setIndex(Math.max(0, slideCount - 1));
              break;
            case 'Escape':
              onExit();
              break;
            default:
              return;
          }
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children(index, viewport)}
        <div
          ref={layerRef}
          style={{
            ...styles.presentationLayer,
            opacity: shown ? 1 : 0,
            visibility: shown ? 'visible' : 'hidden',
          }}
        >
          {controls ? controls(state) : (
            <DefaultControls
              controls={state}
              counterLabel={counterLabel}
              exitLabel={exitLabel}
              previousLabel={previousLabel}
              nextLabel={nextLabel}
            />
          )}
        </div>
      </dialog>
    </div>
  );
}

function DefaultControls({
  controls,
  counterLabel,
  exitLabel,
  previousLabel,
  nextLabel,
}: {
  controls: PresentationControls;
  counterLabel: (current: number, total: number) => string;
  exitLabel: string;
  previousLabel: string;
  nextLabel: string;
}) {
  return (
    <>
      <button
        type="button"
        onClick={controls.exit}
        aria-label={exitLabel}
        title={exitLabel}
        style={styles.presentationExit}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 6 18 18M18 6 6 18" />
        </svg>
      </button>
      <div style={styles.presentationControls}>
        <button
          type="button"
          onClick={controls.previous}
          disabled={controls.current === 1}
          aria-label={previousLabel}
          style={styles.presentationNavButton}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            aria-hidden="true"
          >
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
        <span style={styles.presentationCounter} aria-live="polite">
          {counterLabel(controls.current, controls.total)}
        </span>
        <button
          type="button"
          onClick={controls.next}
          disabled={controls.current >= controls.total}
          aria-label={nextLabel}
          style={styles.presentationNavButton}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            aria-hidden="true"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </button>
      </div>
    </>
  );
}

const styles = {
  presentationOverlay: {
    position: 'fixed',
    margin: 0,
    padding: 0,
    border: 0,
    width: '100vw',
    height: '100vh',
    maxWidth: 'none',
    maxHeight: 'none',
    inset: 0,
    zIndex: 2147483000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#000000',
    cursor: 'pointer',
  },
  presentationLayer: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    cursor: 'default',
    transition: 'opacity 250ms ease, visibility 250ms',
  },
  presentationExit: {
    position: 'absolute',
    top: 16,
    right: 16,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    border: 0,
    borderRadius: 999,
    background: 'rgba(255, 255, 255, 0.14)',
    color: '#ffffff',
    cursor: 'pointer',
    pointerEvents: 'auto',
  },
  presentationControls: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '6px 14px',
    borderRadius: 999,
    background: 'rgba(255, 255, 255, 0.12)',
    pointerEvents: 'auto',
  },
  presentationNavButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    border: 0,
    borderRadius: 999,
    background: 'rgba(255, 255, 255, 0.14)',
    color: '#ffffff',
    cursor: 'pointer',
  },
  presentationCounter: {
    minWidth: 64,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 600,
    textAlign: 'center',
  },
} satisfies Record<string, CSSProperties>;
