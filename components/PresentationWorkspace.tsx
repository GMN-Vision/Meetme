'use client';

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

const MIN_WIDTH = 40;
const MAX_WIDTH = 85;
const MIN_HEIGHT = 320;
const MAX_HEIGHT = 1000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function PresentationWorkspace({ children, notes }: { children: ReactNode; notes?: ReactNode }) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const [presentationWidth, setPresentationWidth] = useState(80);
  const [height, setHeight] = useState(560);

  const resizeWidth = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const bounds = layoutRef.current?.getBoundingClientRect();
    if (bounds) setPresentationWidth(clamp((event.clientX - bounds.left) / bounds.width * 100, MIN_WIDTH, MAX_WIDTH));
  };

  const resizeHeight = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const top = layoutRef.current?.getBoundingClientRect().top;
    if (top !== undefined) setHeight(clamp(event.clientY - top, MIN_HEIGHT, MAX_HEIGHT));
  };

  const capture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const release = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <>
      <div
        ref={layoutRef}
        className={`presentation-workspace min-h-[20rem] w-full ${notes ? 'has-notes' : ''}`}
        style={{ '--presentation-width': `${presentationWidth}%`, height: `${height}px` } as CSSProperties}
      >
        <div className="presentation-workspace-stage min-h-0 min-w-0 overflow-hidden bg-white">{children}</div>
        {notes && <>
          <div
            role="separator"
            aria-label="Resize presentation and presenter notes width"
            aria-orientation="vertical"
            aria-valuemin={MIN_WIDTH}
            aria-valuemax={MAX_WIDTH}
            aria-valuenow={Math.round(presentationWidth)}
            tabIndex={0}
            className="presentation-workspace-width-handle"
            onPointerDown={capture}
            onPointerMove={resizeWidth}
            onPointerUp={release}
            onPointerCancel={release}
            onKeyDown={event => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              setPresentationWidth(value => clamp(value + (event.key === 'ArrowRight' ? 5 : -5), MIN_WIDTH, MAX_WIDTH));
            }}
          />
          <aside aria-label="Private presenter notes" className="presentation-workspace-notes min-h-0 min-w-0 overflow-auto bg-zinc-900/80">{notes}</aside>
        </>}
      </div>
      <div
        role="separator"
        aria-label="Resize presentation height"
        aria-orientation="horizontal"
        aria-valuemin={MIN_HEIGHT}
        aria-valuemax={MAX_HEIGHT}
        aria-valuenow={height}
        tabIndex={0}
        className="presentation-workspace-height-handle"
        onPointerDown={capture}
        onPointerMove={resizeHeight}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={event => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          setHeight(value => clamp(value + (event.key === 'ArrowDown' ? 40 : -40), MIN_HEIGHT, MAX_HEIGHT));
        }}
      />
    </>
  );
}
