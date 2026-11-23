import { paintSlide, sizeCanvasForSlide } from '@betteroffice/pptx';
import type { CanvasImageResolver, PresentationHandle } from '@betteroffice/pptx';
import { useEffect, useRef } from 'react';
import { PresentationShell, type PresentationShellProps } from './PresentationShell';

export function PresentationOverlay({
  handle,
  resolveImage,
  onError,
  ...shell
}: PresentationShellProps & {
  handle: PresentationHandle;
  resolveImage: CanvasImageResolver;
  onError: (error: unknown) => void;
}) {
  return (
    <PresentationShell {...shell}>
      {(index, viewport) => (
        <PresentationSlide
          handle={handle}
          index={index}
          viewport={viewport}
          slideCount={shell.slideCount}
          resolveImage={resolveImage}
          onExit={shell.onExit}
          onError={onError}
        />
      )}
    </PresentationShell>
  );
}

function PresentationSlide({
  handle,
  index,
  viewport,
  slideCount,
  resolveImage,
  onExit,
  onError,
}: {
  handle: PresentationHandle;
  index: number;
  viewport: { width: number; height: number };
  slideCount: number;
  resolveImage: CanvasImageResolver;
  onExit: () => void;
  onError: (error: unknown) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onExit, onError });
  callbacks.current = { onExit, onError };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || slideCount === 0 || viewport.width <= 0 || viewport.height <= 0)
      return;
    let cancelled = false;
    const paint = async () => {
      const frame = handle.layoutSlide(index);
      const buffer = document.createElement('canvas');
      const context = buffer.getContext('2d');
      if (!context) return;
      const scale = Math.min(
        viewport.width / frame.width,
        viewport.height / frame.height
      );
      const dpr = window.devicePixelRatio || 1;
      sizeCanvasForSlide(buffer, frame, dpr, scale);
      await paintSlide(context, frame, dpr, scale, { resolveImage });
      if (cancelled) return;
      sizeCanvasForSlide(canvas, frame, dpr, scale);
      canvas.getContext('2d')?.drawImage(buffer, 0, 0);
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
  }, [handle, index, slideCount, resolveImage, viewport]);

  return <canvas ref={canvasRef} style={{ display: 'block', pointerEvents: 'none' }} />;
}
