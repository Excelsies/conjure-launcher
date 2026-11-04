// Auto-paste decisions (design brief section 19, invariant 5). Pure, so the rule that decides
// where keystrokes may go is tested without a shell.

// WM_CLASS / app-id fragments of terminals, which paste with Ctrl+Shift+V.
const TERMINALS = ['gnome-terminal', 'org.gnome.ptyxis', 'ptyxis', 'org.gnome.console', 'kgx', 'kitty',
    'alacritty', 'foot', 'wezterm', 'konsole', 'xterm', 'tilix', 'terminator', 'blackbox', 'contour', 'ghostty'];

export function isTerminal(wmClass) {
    const c = String(wmClass ?? '').toLowerCase();
    return c !== '' && TERMINALS.some(t => c === t || c.startsWith(`${t}.`) || c.endsWith(`.${t}`) || c.includes(t));
}

/** The key chord to paste into a window of this class. */
export function pasteChord(wmClass) {
    return isTerminal(wmClass) ? ['Control_L', 'Shift_L', 'v'] : ['Control_L', 'v'];
}

/**
 * Invariant 5: paste only when enabled, the result copied something, and focus is back on the
 * exact window that was focused before the launcher opened.
 */
export function shouldPaste({ enabled, copied, previous, current }) {
    return Boolean(enabled && copied && previous && current && previous === current);
}
