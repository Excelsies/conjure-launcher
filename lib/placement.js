// Where the panel goes on a monitor (bottom center by default).
//
// Horizontally the panel is centered on the monitor ("the screen"). Vertically it is anchored
// inside the work area (the monitor minus panels and docks), so a bottom dock never covers it.
// It is always clamped to fit inside the work area.

export const POSITIONS = Object.freeze(['bottom', 'center', 'top']);
export const DEFAULT_POSITION = 'bottom';
export const EDGE_GAP = 24;

/**
 * @param {{monitor: {x,y,width,height}, workArea: {x,y,width,height}, width: number,
 *          height: number, position?: string, gap?: number}} p
 * @returns {{x: number, y: number, width: number, height: number, position: string}}
 *   in stage coordinates; position is the one actually used (unknown values -> default)
 */
export function panelRect({ monitor, workArea, width, height, position = DEFAULT_POSITION, gap = EDGE_GAP }) {
    const pos = POSITIONS.includes(position) ? position : DEFAULT_POSITION;
    const area = workArea && workArea.width > 0 && workArea.height > 0 ? workArea : monitor;

    const w = Math.max(1, Math.min(width, area.width - 2 * gap));
    const h = Math.max(1, Math.min(height, area.height - 2 * gap));

    let x = Math.round(monitor.x + (monitor.width - w) / 2);
    x = Math.max(area.x + gap, Math.min(x, area.x + area.width - gap - w));

    let y;
    if (pos === 'bottom')
        y = area.y + area.height - gap - h;
    else if (pos === 'top')
        y = area.y + gap;
    else
        y = Math.round(area.y + (area.height - h) / 2);

    return { x, y: Math.round(y), width: w, height: h, position: pos };
}
