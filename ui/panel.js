// The launcher panel: a full-monitor transparent backdrop (catches clicks outside) holding the
// centred panel with the search toolbar and the results list. It owns no state beyond what is
// on screen; the controller (shell/launcher.js) drives it.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ensureActorVisibleInScrollView } from 'resource:///org/gnome/shell/misc/animationUtils.js';

export const PANEL_HEIGHT = 620;
const ICON_SIZE = 40;
const OPEN_MS = 200;
const PAGE_FALLBACK = 8;

const ENTER_KEYS = new Set([Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_ISO_Enter]);

class Row {
    constructor(result, index, panel) {
        this.result = result;
        this.index = index;
        this._panel = panel;
        this.actor = new St.BoxLayout({ reactive: true, track_hover: true, x_expand: true, style: 'spacing: 12px;' });
        const icon = panel.createIcon(result, ICON_SIZE);
        this._iconBin = new St.Bin({ width: ICON_SIZE, height: ICON_SIZE, child: icon ?? null });
        this.actor.add_child(this._iconBin);

        const labels = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER });
        this._title = new St.Label({ text: result.title ?? '' });
        this._title.clutter_text.ellipsize = 3; // Pango.EllipsizeMode.END
        labels.add_child(this._title);
        this._subtitle = new St.Label({ text: result.subtitle ?? '', visible: Boolean(result.subtitle) });
        this._subtitle.clutter_text.ellipsize = 3;
        labels.add_child(this._subtitle);
        this.actor.add_child(labels);

        this.actor.connect('notify::hover', () => this.restyle());
        this.actor.connect('button-release-event', (_a, event) => {
            const button = event.get_button();
            if (button !== Clutter.BUTTON_PRIMARY && button !== Clutter.BUTTON_MIDDLE)
                return Clutter.EVENT_PROPAGATE;
            const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;
            panel.activateIndex(index, { newWindow: ctrl || button === Clutter.BUTTON_MIDDLE });
            return Clutter.EVENT_STOP;
        });
    }

    restyle() {
        const s = this._panel.styles;
        const state = this._panel.selectedIndex === this.index ? 'Selected' : this.actor.hover ? 'Hover' : '';
        this.actor.set_style(s[`row${state}`] + ' spacing: 12px;');
        this._title.set_style(s[`title${state}`]);
        this._subtitle.set_style(s[`subtitle${state}`]);
    }
}

export class LauncherPanel {
    /**
     * @param {{styles: object, createIcon: (result, size) => Clutter.Actor | null,
     *          onQuery: (text: string) => void,
     *          onActivate: (result, opts: {newWindow: boolean}) => void,
     *          onCancel: (reason: string) => void}} opts
     */
    constructor(opts) {
        this._opts = opts;
        this.styles = opts.styles;
        this.selectedIndex = -1;
        this._rows = [];
        this.backdrop = null;
    }

    createIcon(result, size) {
        try {
            return this._opts.createIcon(result, size);
        } catch {
            return null;
        }
    }

    /**
     * Build the actors and add them above everything else.
     * @param monitor  the monitor the backdrop covers (stage coordinates)
     * @param rect     the panel's rectangle in stage coordinates (lib/placement.js)
     */
    build(monitor, rect) {
        const backdrop = new St.Widget({
            reactive: true, x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height,
            name: 'conjure-launcher-backdrop',
        });
        backdrop.connect('button-press-event', (actor, event) => {
            // Only a press that lands on the backdrop itself (not the panel) is "outside".
            // Shell 50: event.get_source() is not the picked actor; ask the stage.
            if (global.stage.get_event_actor(event) === actor)
                this._opts.onCancel('click-outside');
            return Clutter.EVENT_STOP;
        });

        // The panel is a child of the backdrop, so its position is relative to the monitor.
        this._panel = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, width: rect.width, height: rect.height, reactive: true,
            x: rect.x - monitor.x, y: rect.y - monitor.y,
            name: 'conjure-launcher-panel',
        });

        this._toolbar = new St.BoxLayout({ x_expand: true });
        this._entry = new St.Entry({ hint_text: 'Search apps, or type / for providers', can_focus: true, x_expand: true });
        this._entry.clutter_text.connect('text-changed', () => this._opts.onQuery(this._entry.get_text()));
        this._entry.clutter_text.connect('key-press-event', (_a, event) => this._onKey(event));
        this._toolbar.add_child(this._entry);
        this._panel.add_child(this._toolbar);

        this._scroll = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true, y_expand: true, overlay_scrollbars: true,
        });
        this._list = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
        this._scroll.set_child(this._list);
        this._panel.add_child(this._scroll);

        this._empty = new St.Label({ text: '', visible: false, x_align: Clutter.ActorAlign.CENTER });
        this._panel.add_child(this._empty);

        backdrop.add_child(this._panel);
        Main.uiGroup.add_child(backdrop);
        Main.uiGroup.set_child_above_sibling(backdrop, null);
        this.backdrop = backdrop;
        this.applyStyles(this.styles);
    }

    /** Called once the modal grab is held. */
    present() {
        this._entry.grab_key_focus();
        this._panel.opacity = 0;
        this._panel.ease({ opacity: 255, duration: OPEN_MS, mode: Clutter.AnimationMode.EASE_OUT_CUBIC });
    }

    destroy() {
        this._rows = [];
        this.backdrop?.destroy();
        this.backdrop = null;
    }

    get text() {
        return this._entry?.get_text() ?? '';
    }

    applyStyles(styles) {
        this.styles = styles;
        if (!this.backdrop)
            return;
        this._panel.set_style(styles.panel);
        this._toolbar.set_style(styles.toolbar);
        this._entry.set_style(styles.entry);
        this._entry.clutter_text.set_style?.(styles.entry);
        this._entry.hint_actor?.set_style(styles.entryHint);
        this._list.set_style('spacing: 4px; padding-top: 8px;');
        this._empty.set_style(styles.empty);
        for (const row of this._rows)
            row.restyle();
    }

    /**
     * @param {object[]} results  ranked
     * @param {{kind: string, pending: number}} info
     */
    setResults(results, info) {
        if (!this.backdrop)
            return;
        this._list.destroy_all_children();
        this._rows = results.map((r, i) => new Row(r, i, this));
        for (const row of this._rows)
            this._list.add_child(row.actor);
        this.selectedIndex = this._rows.length ? 0 : -1;
        for (const row of this._rows)
            row.restyle();
        this._scroll.vadjustment.value = 0;

        const empty = !this._rows.length;
        this._empty.visible = empty;
        this._scroll.visible = !empty;
        if (empty) {
            this._empty.text = info.kind === 'overview' ? 'No providers match'
                : info.pending ? 'Searching…' : 'No results';
        }
    }

    activateIndex(index, opts) {
        const row = this._rows[index];
        if (row)
            this._opts.onActivate(row.result, opts);
    }

    _select(index) {
        if (!this._rows.length)
            return;
        const clamped = Math.max(0, Math.min(this._rows.length - 1, index));
        const prev = this._rows[this.selectedIndex];
        this.selectedIndex = clamped;
        prev?.restyle();
        const row = this._rows[clamped];
        row.restyle();
        ensureActorVisibleInScrollView(this._scroll, row.actor);
    }

    _pageStride() {
        const rowHeight = this._rows[0]?.actor.height;
        const viewHeight = this._scroll.height;
        return rowHeight > 0 && viewHeight > 0 ? Math.max(1, Math.floor(viewHeight / rowHeight) - 1) : PAGE_FALLBACK;
    }

    _onKey(event) {
        const sym = event.get_key_symbol();
        const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;

        if (sym === Clutter.KEY_Escape) {
            this._opts.onCancel('escape');
            return Clutter.EVENT_STOP;
        }
        if (ENTER_KEYS.has(sym)) {
            this.activateIndex(this.selectedIndex, { newWindow: ctrl });
            return Clutter.EVENT_STOP;
        }
        let delta = 0;
        if (sym === Clutter.KEY_Down || sym === Clutter.KEY_Tab || (ctrl && sym === Clutter.KEY_n))
            delta = 1;
        else if (sym === Clutter.KEY_Up || sym === Clutter.KEY_ISO_Left_Tab || (ctrl && sym === Clutter.KEY_p))
            delta = -1;
        else if (sym === Clutter.KEY_Page_Down)
            delta = this._pageStride();
        else if (sym === Clutter.KEY_Page_Up)
            delta = -this._pageStride();
        if (delta) {
            this._select(this.selectedIndex + delta);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    /** Test hook: type into the entry as a user would. */
    setText(text) {
        this._entry.set_text(text);
    }

    /** Test hook: feed a key symbol through the same handler as real key presses. */
    handleKeySymbol(sym, { ctrl = false } = {}) {
        return this._onKey({
            get_key_symbol: () => sym,
            get_state: () => (ctrl ? Clutter.ModifierType.CONTROL_MASK : 0),
        });
    }

    /** Test hook: the panel actor (geometry checks). */
    get panelActor() {
        return this._panel;
    }

    get rows() {
        return this._rows;
    }
}
