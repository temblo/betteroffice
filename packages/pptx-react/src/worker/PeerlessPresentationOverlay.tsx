import { paintSlide, sizeCanvasForSlide } from '@betteroffice/pptx';
import type { CanvasImageResolver, SlideDisplayList } from '@betteroffice/pptx';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { PresentationShell, type PresentationShellProps } from '../components/PresentationShell';

type FrameSource = (index: number) => Promise<{ frame: SlideDisplayList; resolveImage: CanvasImageResolver; release(): void }>;

export function PeerlessPresentationOverlay({
  frameSource,
  subscribeRevision = idle,
  revision = none,
  onError,
  ...shell
}: PresentationShellProps & {
  frameSource: FrameSource;
  subscribeRevision?: (listener: () => void) => () => void;
  revision?: (index: number) => string | null;
  onError: (error: unknown) => void;
}) {
  return (
    <PresentationShell {...shell}>
      {(index, viewport) => (
        <PeerlessSlide
          frameSource={frameSource}
          subscribeRevision={subscribeRevision}
          revision={revision}
          index={index}
          viewport={viewport}
          slideCount={shell.slideCount}
          onExit={shell.onExit}
          onError={onError}
        />
      )}
    </PresentationShell>
  );
}

function PeerlessSlide({
  frameSource,
  subscribeRevision,
  revision,
  index,
  viewport,
  slideCount,
  onExit,
  onError,
}: {
  frameSource: FrameSource;
  subscribeRevision: (listener: () => void) => () => void;
  revision: (index: number) => string | null;
  index: number;
  viewport: { width: number; height: number };
  slideCount: number;
  onExit: () => void;
  onError: (error: unknown) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onExit, onError });
  callbacks.current = { onExit, onError };
  const slideRevision = useSyncExternalStore(subscribeRevision, () => revision(index), () => revision(index));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || slideCount === 0 || viewport.width <= 0 || viewport.height <= 0)
      return;
    let cancelled = false;
    const paint = async () => {
      const supplied = await frameSource(index);
      const frame = supplied.frame;
      try {
        if (cancelled) return;
        const buffer = document.createElement('canvas');
        const context = buffer.getContext('2d');
        if (!context) return;
        const scale = Math.min(
          viewport.width / frame.width,
          viewport.height / frame.height
        );
        const dpr = window.devicePixelRatio || 1;
        sizeCanvasForSlide(buffer, frame, dpr, scale);
        await paintSlide(context, frame, dpr, scale, { resolveImage: supplied.resolveImage });
        if (cancelled) return;
        sizeCanvasForSlide(canvas, frame, dpr, scale);
        canvas.getContext('2d')?.drawImage(buffer, 0, 0);
      } finally { supplied.release(); }
    };
    void paint().catch((error: unknown) => {
      if (!cancelled) {
        callbacks.current.onError(error);
        callbacks.current.onExit();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [frameSource, index, slideCount, viewport, slideRevision]);

  return <canvas ref={canvasRef} style={{ display: 'block', pointerEvents: 'none' }} />;
}

const idle = () => () => {};
const none = () => null;
