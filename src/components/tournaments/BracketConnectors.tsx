"use client";
import { useEffect, useState, type RefObject } from "react";
type Edge = { from: string; to: string; side: 0 | 1; loser?: boolean };
export default function BracketConnectors({
  container,
  edges,
  layoutKey,
}: {
  container: RefObject<HTMLDivElement | null>;
  edges: Edge[];
  layoutKey: string;
}) {
  const [drawing, setDrawing] = useState<{
    width: number;
    height: number;
    paths: { d: string; loser?: boolean }[];
  }>({ width: 0, height: 0, paths: [] });
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = element.getBoundingClientRect();
        const cards = new Map(
          Array.from(
            element.querySelectorAll<HTMLElement>("[data-match-id]"),
          ).map((card) => [card.dataset.matchId!, card]),
        );
        const paths = edges.flatMap((edge) => {
          const source = cards.get(edge.from),
            target = cards.get(edge.to);
          if (!source || !target) return [];
          const from = source.getBoundingClientRect(),
            to = (
              target.querySelectorAll(".cw-team")[edge.side] || target
            ).getBoundingClientRect();
          const x1 = from.right - box.left + element.scrollLeft,
            y1 = from.top + from.height / 2 - box.top + element.scrollTop,
            x2 = to.left - box.left + element.scrollLeft,
            y2 = to.top + to.height / 2 - box.top + element.scrollTop;
          if (x2 <= x1) return [];
          const middle = x1 + (x2 - x1) / 2;
          return [
            {
              d: `M ${x1} ${y1} H ${middle} V ${y2} H ${x2}`,
              loser: edge.loser,
            },
          ];
        });
        setDrawing({
          width: element.scrollWidth,
          height: element.scrollHeight,
          paths,
        });
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element
      .querySelectorAll(".cw-match")
      .forEach((card) => observer.observe(card));
    update();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [container, edges, layoutKey]);
  return (
    <svg
      aria-hidden="true"
      width={drawing.width}
      height={drawing.height}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {drawing.paths.map((path, i) => (
        <path
          key={i}
          d={path.d}
          fill="none"
          stroke="hsl(var(--foreground) / 0.25)"
          strokeWidth="1.25"
          strokeDasharray={path.loser ? "4 3" : undefined}
        />
      ))}
    </svg>
  );
}
