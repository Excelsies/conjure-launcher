// Selection movement for the results list and grid.

export const GRID_COLUMNS = 5;

/**
 * @param {number} index    current selection (-1 = none)
 * @param {'up'|'down'|'left'|'right'|'pageUp'|'pageDown'|'home'|'end'} move
 * @param {{count: number, grid: boolean, columns?: number, page?: number}} opts
 * @returns {number} the new index, clamped; -1 when there is nothing to select
 */
export function moveSelection(index, move, { count, grid, columns = GRID_COLUMNS, page = 8 }) {
    if (count <= 0)
        return -1;
    const cur = index < 0 ? 0 : Math.min(index, count - 1);
    const row = grid ? columns : 1;
    let next = cur;
    switch (move) {
    case 'up': next = cur - row; break;
    case 'down': next = cur + row; break;
    case 'left': next = grid ? cur - 1 : cur; break;
    case 'right': next = grid ? cur + 1 : cur; break;
    case 'pageUp': next = cur - Math.max(1, page) * row; break;
    case 'pageDown': next = cur + Math.max(1, page) * row; break;
    case 'home': next = 0; break;
    case 'end': next = count - 1; break;
    }
    if (next >= count) {
        const downward = move === 'down' || move === 'pageDown';
        if (grid && downward) {
            // No item directly below: go to the last item if it is on a later row, else stay.
            const lastRow = Math.floor((count - 1) / row);
            next = Math.floor(cur / row) < lastRow ? count - 1 : cur;
        } else {
            next = count - 1;
        }
    }
    if (next < 0)
        next = 0;
    return next;
}
