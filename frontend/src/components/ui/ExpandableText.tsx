'use client';

import { useEffect, useRef, useState } from 'react';

interface ExpandableTextProps {
  text: string;
  collapsedLines?: number;
}

/**
 * Clamps long prose and only shows the toggle when the text genuinely overflows
 * — a "Show more" link that reveals nothing is worse than no link at all.
 */
export function ExpandableText({ text, collapsedLines = 5 }: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      // scrollHeight exceeds clientHeight only while the clamp is active.
      setOverflows(element.scrollHeight > element.clientHeight + 4);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, collapsedLines]);

  return (
    <div>
      <p
        ref={ref}
        className="whitespace-pre-line text-[14px] leading-relaxed text-ink-soft"
        style={
          expanded
            ? undefined
            : {
                display: '-webkit-box',
                WebkitLineClamp: collapsedLines,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }
        }
      >
        {text}
      </p>

      {overflows || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1.5 text-[13px] font-semibold text-brand-bright transition hover:text-brand"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  );
}
