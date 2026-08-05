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
