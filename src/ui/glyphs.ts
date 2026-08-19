const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Drawn marks shared across screens.
 *
 * These are SVG rather than emoji on purpose: an emoji arrives in whatever
 * style the operating system feels like, in colours nothing else here uses,
 * and it cannot take the colour of the thing it stands for. A drawn cup can
 * be bronze on one row and diamond on the next.
 */
export function trophyIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ticon');
  svg.setAttribute('aria-hidden', 'true');
  const add = (tag: string, attrs: Record<string, string>): void => {
    const part = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, value);
    svg.append(part);
  };
  // Bowl, handles, stem and base — a cup at a glance even at 15px.
  add('path', { d: 'M7 3h10v6a5 5 0 0 1-10 0Z', fill: 'currentColor' });
  add('path', {
    d: 'M7 4.5H4.6v2A3.4 3.4 0 0 0 7.6 10M17 4.5h2.4v2A3.4 3.4 0 0 1 16.4 10',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
  });
  add('rect', { x: '10.9', y: '13.4', width: '2.2', height: '4', fill: 'currentColor' });
  add('rect', { x: '7.6', y: '17.4', width: '8.8', height: '2.4', rx: '0.8', fill: 'currentColor' });
  return svg;
}

/**
 * A judo belt: a band, a knot, and two tails.
 *
 * The fill comes from a per-belt custom property and the outline from a
 * per-theme one, because belt colours are fixed by judo rather than chosen by
 * us — and two of the six are the colours of our own backgrounds. A white belt
 * on Newsprint by day and a black belt on Newsprint by night are each
 * invisible without a contrasting edge, so every belt carries one and they
 * stay one family.
 */
export function beltMark(level: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 44 30');
  svg.setAttribute('class', `beltmark belt-${level}`);
  svg.setAttribute('aria-hidden', 'true');
  const add = (tag: string, attrs: Record<string, string>): void => {
    const part = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) part.setAttribute(key, value);
    svg.append(part);
  };
  const cloth = {
    fill: 'var(--belt-fill)',
    stroke: 'var(--belt-line)',
    'stroke-width': '1.4',
    'stroke-linejoin': 'round',
  };
  add('rect', { x: '1', y: '9', width: '42', height: '9', rx: '2.5', ...cloth });
  add('path', { d: 'M17 18h4l-1.5 10h-4z', ...cloth });
  add('path', { d: 'M23 18h4l1.5 10h-4z', ...cloth });
  add('rect', { x: '16', y: '6.5', width: '12', height: '14', rx: '2.5', ...cloth });
  // A dan grade is not a kyū, and a black belt needs something of its own to
  // read by on a dark table.
  if (level >= 6) {
    add('rect', { x: '3', y: '12', width: '38', height: '2', fill: 'var(--belt-stripe)' });
    add('rect', { x: '17.5', y: '12', width: '9', height: '2', fill: 'var(--belt-stripe)' });
  }
  return svg;
}
