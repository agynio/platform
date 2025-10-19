import React, { useEffect, useMemo, useState } from 'react';

export interface TimeRange {
  from: string; // ISO
  to: string;   // ISO
}

function toISO(d: Date) { return d.toISOString(); }

export function defaultLast6h(): TimeRange {
  const now = new Date();
  const from = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  return { from: toISO(from), to: toISO(now) };
}

export function TimeRangeSelector({ value, onChange }: { value: TimeRange; onChange(v: TimeRange): void }) {
  // Apply-on-blur UX to avoid spamming queries while typing; preset buttons apply immediately.
  const [fromLocal, setFromLocal] = useState(toLocalInput(value.from));
  const [toLocal, setToLocal] = useState(toLocalInput(value.to));
  useEffect(() => { setFromLocal(toLocalInput(value.from)); }, [value.from]);
  useEffect(() => { setToLocal(toLocalInput(value.to)); }, [value.to]);
  function setPreset(hours: number) {
    const now = new Date();
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
    onChange({ from: toISO(from), to: toISO(now) });
  }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: '#555' }}>Range:</span>
      <button onClick={() => setPreset(1)} style={btnStyle}>1h</button>
      <button onClick={() => setPreset(6)} style={btnStyle}>6h</button>
      <button onClick={() => setPreset(24)} style={btnStyle}>24h</button>
      <input
        type="datetime-local"
        value={fromLocal}
        onChange={(e) => setFromLocal(e.target.value)}
        onBlur={() => onChange({ from: fromLocalInput(fromLocal), to: value.to })}
        style={inputStyle}
      />
      <span>→</span>
      <input
        type="datetime-local"
        value={toLocal}
        onChange={(e) => setToLocal(e.target.value)}
        onBlur={() => onChange({ from: value.from, to: fromLocalInput(toLocal) })}
        style={inputStyle}
      />
    </div>
  );
}

const btnStyle: React.CSSProperties = { fontSize: 12, padding: '4px 8px', cursor: 'pointer' };
const inputStyle: React.CSSProperties = { fontSize: 12 };

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${yyyy}-${MM}-${DD}T${hh}:${mm}`;
}
function fromLocalInput(v: string): string {
  const d = new Date(v);
  return d.toISOString();
}
