"use client";

import { useEffect, useId, useRef, useState } from "react";

type MermaidProps = {
  chart: string;
};

export function Mermaid({ chart }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rawId = useId();
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        });

        const { svg: rendered } = await mermaid.render(id, chart);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setSvg(null);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (error) {
    return (
      <div className="mermaid mermaid--error" role="img" aria-label="Diagram failed to render">
        <p>Diagram failed to render: {error}</p>
        <pre>{chart}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="mermaid mermaid--loading" ref={containerRef} aria-busy="true">
        <pre>{chart}</pre>
      </div>
    );
  }

  return (
    <div
      className="mermaid"
      role="img"
      ref={containerRef}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
