const SVG = 'http://www.w3.org/2000/svg';

/**
 * Difficulty as colour: green at one star, sliding through yellow and orange
 * to red at six. Hue alone carries the scale, so the two facets keep the same
 * relationship at every level and the stars still read as one set.
 */
function hueFor(count: number): number {
  const t = (Math.min(Math.max(count, 1), 6) - 1) / 5;
  return Math.round(132 - t * 132);
}

/** Faceted five-point star, drawn rather than shipped as an image. */
function star(size: number, hue: number): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));

  const cx = 10;
  const cy = 10.2;
  const outer = 9.4;
  const inner = 3.9;
  const point = (r: number, deg: number): [number, number] => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };

  // Two triangles per arm, alternately lit, which reads as a 3D star.
  for (let k = 0; k < 5; k++) {
    const tip = point(outer, k * 72);
    const left = point(inner, k * 72 - 36);
    const right = point(inner, k * 72 + 36);
    for (const [a, b, light] of [
      [left, tip, true],
      [tip, right, false],
    ] as const) {
      const tri = document.createElementNS(SVG, 'polygon');
      tri.setAttribute('points', `${cx},${cy} ${a[0]},${a[1]} ${b[0]},${b[1]}`);
      tri.setAttribute(
        'fill',
        light ? `hsl(${hue} 72% 58%)` : `hsl(${hue} 66% 33%)`,
      );
      svg.append(tri);
    }
  }
  return svg;
}

export function stars(count: number, size = 20): HTMLSpanElement {
  const wrap = document.createElement('span');
  wrap.className = 'stars';
  const hue = hueFor(count);
  for (let i = 0; i < count; i++) wrap.append(star(size, hue));
  return wrap;
}
