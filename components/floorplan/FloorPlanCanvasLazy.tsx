'use client';

/**
 * Client-only Konva canvas loader.
 * Uses next/dynamic with ssr:false so konva/react-konva never run during SSR.
 * Import this (or dynamically import this) from pages — never import FloorPlanCanvas directly.
 */
import dynamic from 'next/dynamic';
import type { FloorPlanCanvasProps } from './types';

const FloorPlanCanvas = dynamic(() => import('./FloorPlanCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-ink-dim">
      Loading canvas…
    </div>
  )
});

export type { FloorPlanCanvasProps };

export default function FloorPlanCanvasLazy(props: FloorPlanCanvasProps) {
  return <FloorPlanCanvas {...props} />;
}
