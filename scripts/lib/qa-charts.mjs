/** Generadores SVG para el informe QA PDF */

function colorForScore(n) {
  if (n >= 80) return '#27ae60';
  if (n >= 65) return '#f39c12';
  return '#e74c3c';
}

function escSvg(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncateLabel(s, max) {
  const t = String(s || '');
  return t.length <= max ? t : t.slice(0, max - 1) + '…';
}

/** Gauge circular 0–100 */
export function scoreGaugeSvg(score, opts = {}) {
  const size = opts.size || 160;
  const r = size * 0.36;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  const dash = (pct / 100) * circ;
  const col = colorForScore(pct);
  const track = opts.track || '#e8ecf4';
  const label = opts.label || '';
  return `<svg class="chart-svg gauge" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Puntaje ${pct}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${track}" stroke-width="${size * 0.09}"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${size * 0.09}"
      stroke-dasharray="${dash} ${circ - dash}" stroke-linecap="round"
      transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="${size * 0.22}" font-weight="800" fill="#0f3460">${pct}</text>
    <text x="${cx}" y="${cy + size * 0.12}" text-anchor="middle" font-size="${size * 0.09}" fill="#666">/ 100</text>
    ${label ? `<text x="${cx}" y="${size - 8}" text-anchor="middle" font-size="${size * 0.07}" fill="#555">${escSvg(label)}</text>` : ''}
  </svg>`;
}

/** Barras horizontales */
export function horizontalBarChartSvg(items, opts = {}) {
  const w = opts.width || 520;
  const rowH = opts.rowHeight || 28;
  const padL = opts.padLeft || 168;
  const padR = 44;
  const padT = opts.title ? 28 : 8;
  const padB = 8;
  const barMaxW = w - padL - padR;
  const max = opts.max || 100;
  const h = padT + items.length * rowH + padB;
  const title = opts.title ? `<text x="${w / 2}" y="18" text-anchor="middle" font-size="11" font-weight="700" fill="#0f3460">${escSvg(opts.title)}</text>` : '';

  const rows = items
    .map((it, i) => {
      const y = padT + i * rowH + rowH * 0.62;
      const val = Math.max(0, Math.min(max, Number(it.value) || 0));
      const bw = (val / max) * barMaxW;
      const col = it.color || colorForScore(val);
      const label = truncateLabel(it.label, 22);
      return `<g>
        <text x="4" y="${y}" font-size="9" fill="#334155">${escSvg(label)}</text>
        <rect x="${padL}" y="${y - 12}" width="${barMaxW}" height="14" rx="3" fill="#eef1f6"/>
        <rect x="${padL}" y="${y - 12}" width="${bw}" height="14" rx="3" fill="${col}"/>
        <text x="${padL + barMaxW + 6}" y="${y}" font-size="9" font-weight="700" fill="#334155">${val}</text>
      </g>`;
    })
    .join('');

  return `<svg class="chart-svg hbar" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${title}${rows}</svg>`;
}

/** Donut de segmentos [{ label, value, color }] */
export function donutChartSvg(segments, opts = {}) {
  const size = opts.size || 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const ir = size * 0.24;
  const total = segments.reduce((s, x) => s + (Number(x.value) || 0), 0) || 1;
  let angle = -Math.PI / 2;
  const defaultColors = ['#e74c3c', '#f39c12', '#3498db', '#27ae60', '#9b59b6', '#95a5a6'];

  const paths = segments
    .map((seg, i) => {
      const v = Number(seg.value) || 0;
      if (v <= 0) return '';
      const sweep = (v / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      angle += sweep;
      const x2 = cx + r * Math.cos(angle);
      const y2 = cy + r * Math.sin(angle);
      const xi1 = cx + ir * Math.cos(angle - sweep);
      const yi1 = cy + ir * Math.sin(angle - sweep);
      const xi2 = cx + ir * Math.cos(angle);
      const yi2 = cy + ir * Math.sin(angle);
      const large = sweep > Math.PI ? 1 : 0;
      const col = seg.color || defaultColors[i % defaultColors.length];
      return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${ir} ${ir} 0 ${large} 0 ${xi1} ${yi1} Z" fill="${col}"/>`;
    })
    .join('');

  const legendY = size + 4;
  const legend = segments
    .map((seg, i) => {
      const col = seg.color || defaultColors[i % defaultColors.length];
      const v = Number(seg.value) || 0;
      const pct = Math.round((v / total) * 100);
      return `<g transform="translate(0, ${i * 16})">
        <rect x="0" y="0" width="10" height="10" rx="2" fill="${col}"/>
        <text x="14" y="9" font-size="9" fill="#334155">${escSvg(seg.label)} (${v} · ${pct}%)</text>
      </g>`;
    })
    .join('');

  const legendH = segments.length * 16 + 8;
  const totalH = size + legendH;
  const centerLabel = opts.centerLabel || '';
  const centerSub = opts.centerSub || '';

  return `<svg class="chart-svg donut" viewBox="0 0 ${size} ${totalH}" width="${size}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    ${paths}
    ${centerLabel ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="16" font-weight="800" fill="#0f3460">${escSvg(centerLabel)}</text>` : ''}
    ${centerSub ? `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="8" fill="#666">${escSvg(centerSub)}</text>` : ''}
    <g transform="translate(8, ${size})">${legend}</g>
  </svg>`;
}

/** Radar / araña */
export function radarChartSvg(items, opts = {}) {
  const size = opts.size || 280;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.34;
  const max = opts.max || 100;
  const n = items.length;
  if (!n) return '';

  const pt = (i, val) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const rr = (Math.max(0, Math.min(max, val)) / max) * maxR;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  };

  const grids = [0.25, 0.5, 0.75, 1]
    .map((g) => {
      const pts = items.map((_, i) => pt(i, max * g).join(',')).join(' ');
      return `<polygon points="${pts}" fill="none" stroke="#dde3ed" stroke-width="1"/>`;
    })
    .join('');

  const axes = items
    .map((_, i) => {
      const [x, y] = pt(i, max);
      const [lx, ly] = pt(i, max * 1.18);
      const label = truncateLabel(items[i].label, 14);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#dde3ed" stroke-width="1"/>
        <text x="${lx}" y="${ly}" text-anchor="middle" font-size="7.5" fill="#475569">${escSvg(label)}</text>`;
    })
    .join('');

  const dataPts = items.map((it, i) => pt(i, it.value).join(',')).join(' ');
  const avg = Math.round(items.reduce((s, it) => s + (Number(it.value) || 0), 0) / n);

  return `<svg class="chart-svg radar" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    ${grids}
    ${axes}
    <polygon points="${dataPts}" fill="rgba(15,52,96,0.15)" stroke="#0f3460" stroke-width="2"/>
    ${items
      .map((it, i) => {
        const [x, y] = pt(i, it.value);
        return `<circle cx="${x}" cy="${y}" r="3.5" fill="${colorForScore(it.value)}"/>`;
      })
      .join('')}
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#0f3460">Ø ${avg}</text>
  </svg>`;
}

/** Proyección escalonada */
export function projectionLadderSvg(steps, opts = {}) {
  const w = opts.width || 480;
  const h = 100;
  const n = steps.length;
  const stepW = (w - 40) / Math.max(n, 1);
  const bars = steps
    .map((s, i) => {
      const x = 20 + i * stepW;
      const val = typeof s.value === 'number' ? s.value : 72;
      const bh = (val / 100) * 56;
      const y = 72 - bh;
      const col = colorForScore(val);
      return `<g>
        <rect x="${x + 8}" y="${y}" width="${stepW - 16}" height="${bh}" rx="4" fill="${col}"/>
        <text x="${x + stepW / 2}" y="${y - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="#0f3460">${escSvg(String(s.score || val))}</text>
        <text x="${x + stepW / 2}" y="88" text-anchor="middle" font-size="7.5" fill="#475569">${escSvg(truncateLabel(s.label, 18))}</text>
      </g>`;
    })
    .join('');
  return `<svg class="chart-svg ladder" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

/** Barras verticales scripts timing */
export function scriptTimingSvg(runs, opts = {}) {
  const items = (runs || []).filter((r) => r.ms > 0);
  const w = opts.width || 520;
  const h = 140;
  const padL = 36;
  const padB = 52;
  const padT = 24;
  const barArea = w - padL - 16;
  const barW = Math.min(48, barArea / Math.max(items.length, 1) - 6);
  const maxMs = Math.max(...items.map((r) => r.ms), 1);

  const bars = items
    .map((r, i) => {
      const x = padL + i * (barW + 8);
      const bh = ((r.ms / maxMs) * (h - padB - padT)) | 0;
      const y = h - padB - bh;
      const col = r.ok ? '#27ae60' : '#e74c3c';
      return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="3" fill="${col}"/>
        <text x="${x + barW / 2}" y="${h - 6}" text-anchor="middle" font-size="7" fill="#475569" transform="rotate(-35 ${x + barW / 2} ${h - 6})">${escSvg(truncateLabel(r.id, 10))}</text>`;
    })
    .join('');

  return `<svg class="chart-svg vbar" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <text x="${w / 2}" y="14" text-anchor="middle" font-size="10" font-weight="700" fill="#0f3460">Tiempo scripts QA (ms)</text>
    ${bars}
    <text x="8" y="${padT + 8}" font-size="8" fill="#888">${maxMs}ms</text>
  </svg>`;
}

/** Heatmap matriz sync */
export function syncHeatmapSvg(matrix, opts = {}) {
  const cols = ['Web', 'Tauri', 'APK', 'iOS'];
  const keys = ['web', 'tauri', 'apk', 'ios'];
  const cell = 28;
  const padL = 200;
  const padT = 28;
  const w = padL + cols.length * cell + 16;
  const h = padT + matrix.length * cell + 8;

  const header = cols
    .map((c, i) => `<text x="${padL + i * cell + cell / 2}" y="18" text-anchor="middle" font-size="8" font-weight="700" fill="#0f3460">${c}</text>`)
    .join('');

  const rows = matrix
    .map((row, ri) => {
      const y = padT + ri * cell;
      const label = truncateLabel(row.caso, 28);
      const cells = keys
        .map((k, ci) => {
          const on = !!row[k];
          const fill = on ? '#dbeafe' : '#f1f5f9';
          const stroke = on ? '#3b82f6' : '#cbd5e1';
          const mark = on ? '☐' : '—';
          const x = padL + ci * cell;
          return `<rect x="${x}" y="${y}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="${fill}" stroke="${stroke}"/>
            <text x="${x + (cell - 2) / 2}" y="${y + 18}" text-anchor="middle" font-size="10" fill="#334155">${mark}</text>`;
        })
        .join('');
      return `<text x="4" y="${y + 18}" font-size="8" fill="#334155">${escSvg(label)}</text>${cells}`;
    })
    .join('');

  return `<svg class="chart-svg heatmap" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <text x="${w / 2}" y="10" text-anchor="middle" font-size="10" font-weight="700" fill="#0f3460">Matriz entorno — casos a probar</text>
    ${header}${rows}
  </svg>`;
}
