// The launcher panel: a full-monitor transparent backdrop (catches clicks outside) holding the
// panel. Layout, bottom search (default):  [tabs] [category chips] [results | actions] [search]
//         top search:                       [search] [tabs] [category chips] [results | actions]
// The panel owns only what is on screen (view, category, selection, actions menu); the
// controller (shell/launcher.js) owns queries, providers, pins and history.

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ensureActorVisibleInScrollView } from 'resource:///org/gnome/shell/misc/animationUtils.js';

import { applyView, availableCategories, tabOrder, VIEW_LABELS } from '../lib/views.js';
import { moveSelection, GRID_COLUMNS } from '../lib/navigation.js';

export const PANEL_HEIGHT = 620;
const ICON_SIZE = 40;
const GRID_ICON_SIZE = 48;
const ANIM_MS = 200;
const OPEN_SLIDE = 16;
const COMPACT_NAV_WIDTH = 680;
const PAGE_FALLBACK = 8;
const ELLIPSIZE_END = 3; // Pango.EllipsizeMode.END

/**
 * Run fn on a primary-button release on the actor itself. Under the launcher's modal grab, St.Button's
 * "clicked" does not fire (the backdrop takes the press), so every clickable part uses this.
 */
function onPrimaryClick(actor, fn) {
    actor.connect('button-release-event', (_a, event) => {
        if (event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;
        fn();
        return Clutter.EVENT_STOP;
    });
}

/** Add or remove an accessible state (SELECTED, CHECKED) to match what is drawn. */
function setAccessibleState(widget, state, on) {
    if (on)
        widget.add_accessible_state(state);
    else
        widget.remove_accessible_state(state);
}
const WRAP_WORD_CHAR = 2; // Pango.WrapMode.WORD_CHAR

const VIEW_ICONS = Object.freeze({
    recent: 'document-open-recent-symbolic',
    pinned: 'view-pin-symbolic',
    all: 'view-app-grid-symbolic',
    categories: 'tag-symbolic',
});

const ENTER_KEYS = new Set([Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_ISO_Enter]);

/** One selectable item: a result row, a grid cell, or an action row. */
class Item {
    constructor(panel, index, { result = null, action = null, layout }) {
        this.panel = panel;
        this.index = index;
        this.result = result;
        this.action = action;
        this.layout = layout;
        const grid = layout === 'grid';
        this.actor = new St.BoxLayout({
            reactive: true, track_hover: true, x_expand: !grid,
            orientation: grid ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL,
            accessible_role: action ? Atk.Role.MENU_ITEM : Atk.Role.LIST_ITEM,
        });

        let icon = null;
        if (result)
            icon = panel.createIcon(result, grid ? GRID_ICON_SIZE : ICON_SIZE);
        else if (action?.icon)
            icon = new St.Icon({ icon_name: action.icon, icon_size: 16 });
        // Symbolic icons (actions, calculator, session...) are recolored with the row's text
        // color so they stay visible on the selected and hovered fills.
        if (action?.icon || result?.iconName)
            this._symbolicIcon = icon;
        const iconSize = grid ? GRID_ICON_SIZE : action ? 24 : ICON_SIZE;
        // Rows with no icon at all (dmenu candidates) drop the slot instead of leaving a gap.
        this._iconBin = new St.Bin({ width: iconSize, height: iconSize, child: icon, x_align: Clutter.ActorAlign.CENTER,
            visible: Boolean(icon) || grid });
        this.actor.add_child(this._iconBin);

        const labels = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, x_expand: true,
            y_align: Clutter.ActorAlign.CENTER, x_align: grid ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.FILL,
        });
        this._title = new St.Label({ text: (result?.title ?? action?.label) || '' });
        this._title.clutter_text.ellipsize = ELLIPSIZE_END;
        if (grid) {
            // Noctalia's grid caption: up to two lines, centered.
            this._title.clutter_text.line_wrap = true;
            this._title.clutter_text.line_wrap_mode = WRAP_WORD_CHAR;
            this._title.clutter_text.line_alignment = 1; // Pango.Alignment.CENTER
            this._title.set_height(36);
            this._title.clip_to_allocation = true;
        }
        labels.add_child(this._title);
        // What a screen reader announces for the row: its title (as a label relation and as the name).
        this.actor.label_actor = this._title;
        this.actor.accessible_name = this._title.text;
        const subtitle = !grid && result?.subtitle;
        this._subtitle = new St.Label({ text: subtitle || '', visible: Boolean(subtitle) });
        this._subtitle.clutter_text.ellipsize = ELLIPSIZE_END;
        labels.add_child(this._subtitle);
        this.actor.add_child(labels);

        if (result?.pinned && !grid) {
            this._pin = new St.Icon({ icon_name: 'view-pin-symbolic', icon_size: 14, y_align: Clutter.ActorAlign.CENTER });
            this.actor.add_child(this._pin);
        }

        this.actor.connect('notify::hover', () => this.restyle());
        this.actor.connect('button-release-event', (_a, event) => panel.onItemClicked(this, event));
    }

    restyle() {
        const s = this.panel.styles;
        const selected = this.panel.selectedIndex === this.index;
        const state = selected ? 'Selected' : this.actor.hover ? 'Hover' : '';
        setAccessibleState(this.actor, Atk.StateType.SELECTED, selected);
        const grid = this.layout === 'grid';
        this.actor.set_style(`${s[`row${state}`]} spacing: ${grid ? 6 : 12}px;${grid ? ' padding: 10px 4px;' : ''}`);
        this._title.set_style(`${s[`title${state}`]}${grid ? ' font-size: 13px; text-align: center;' : ''}`);
        this._subtitle.set_style(s[`subtitle${state}`]);
        this._pin?.set_style(s[`subtitle${state}`]);
        this._symbolicIcon?.set_style(s[`title${state}`]);
    }
}

export class LauncherPanel {
    /**
     * @param {{styles: object, createIcon: (result, size) => Clutter.Actor | null,
     *          searchPosition: 'bottom'|'top', defaultView: string, grid: boolean,
     *          pinned: () => string[],
     *          onQuery: (text: string) => void,
     *          onActivate: (result, opts: {alternate: boolean}) => void,   alternate = Ctrl or middle-click held
     *          onActions: (result) => {id: string, label: string, icon?: string}[],
     *          onRunAction: (result, actionId: string) => void,
     *          onTogglePin: (result) => void, onMovePin?: (result, delta: number) => void,
     *          onToggleGrid: () => void,
     *          onCancel: (reason: string) => void,
     *          onGone?: (panel: LauncherPanel) => void,
     *          scoped?: boolean, prompt?: string, onOpenSettings?: () => void}} opts   scoped = dmenu mode
     */
    constructor(opts) {
        this._opts = opts;
        this.styles = opts.styles;
        this.grid = opts.grid;
        this.tabs = tabOrder(opts.defaultView);
        this.view = this.tabs[0];
        this.category = null;
        this.menu = null;            // {result, actions} while the actions menu is shown
        this.selectedIndex = -1;
        this._items = [];
        this._ranked = [];
        this._info = { kind: 'global', pending: 0 };
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
            x: rect.x - monitor.x, y: rect.y - monitor.y, name: 'conjure-launcher-panel',
            accessible_role: Atk.Role.DIALOG, accessible_name: this._opts.scoped ? (this._opts.prompt || 'Choose') : 'Launcher',
        });
        this._compact = rect.width < COMPACT_NAV_WIDTH;

        this._toolbar = new St.BoxLayout({ x_expand: true });
        this._entry = new St.Entry({
            hint_text: this._opts.scoped ? (this._opts.prompt || 'Choose') : 'Search apps, or type / for providers',
            can_focus: true, x_expand: true, accessible_name: 'Search',
        });
        this._entry.clutter_text.connect('text-changed', () => this._onTextChanged());
        this._entry.clutter_text.connect('key-press-event', (_a, event) => this._onKey(event));
        // A small gear at the end of the search field opens Settings. Not in dmenu mode.
        if (!this._opts.scoped && this._opts.onOpenSettings) {
            this._gear = new St.Icon({
                icon_name: 'emblem-system-symbolic', icon_size: 16, reactive: true, track_hover: true,
                accessible_role: Atk.Role.PUSH_BUTTON, accessible_name: 'Settings',
            });
            this._gear.connect('notify::hover', () => this._restyleChrome());
            this._entry.set_secondary_icon(this._gear);
            // Handled on the icon itself: St.Entry's secondary-icon-clicked does not fire under the modal grab.
            this._gear.connect('button-release-event', (_a, event) => {
                if (event.get_button() !== Clutter.BUTTON_PRIMARY)
                    return Clutter.EVENT_PROPAGATE;
                this._opts.onOpenSettings();
                return Clutter.EVENT_STOP;
            });
        }
        this._toolbar.add_child(this._entry);

        // dmenu mode shows only the candidates: no tabs, no categories.
        this._nav = new St.BoxLayout({ x_expand: true, visible: !this._opts.scoped });
        this._nav.layout_manager.homogeneous = true;  // equal-width tabs, whatever their labels
        this._tabButtons = new Map();
        for (const view of this.tabs) {
            const box = new St.BoxLayout({ x_align: Clutter.ActorAlign.CENTER });
            const icon = new St.Icon({ icon_name: VIEW_ICONS[view], icon_size: 16 });
            box.add_child(icon);
            const label = new St.Label({ text: VIEW_LABELS[view], y_align: Clutter.ActorAlign.CENTER, visible: !this._compact });
            box.add_child(label);
            const button = new St.Button({
                child: box, x_expand: true, can_focus: false, reactive: true,
                accessible_role: Atk.Role.PAGE_TAB, accessible_name: VIEW_LABELS[view],  // the label hides when narrow
            });
            onPrimaryClick(button, () => this.setView(view));
            this._tabButtons.set(view, { button, icon, label });
            this._nav.add_child(button);
        }

        this._chips = new St.BoxLayout({ x_expand: true, visible: false });

        this._scroll = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true, y_expand: true, overlay_scrollbars: true,
        });
        this._list = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true, accessible_role: Atk.Role.LIST });
        this._scroll.set_child(this._list);

        this._empty = new St.Label({ text: '', visible: false, x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER, y_expand: true });

        const order = this._opts.searchPosition === 'top'
            ? [this._toolbar, this._nav, this._chips, this._scroll, this._empty]
            : [this._nav, this._chips, this._scroll, this._empty, this._toolbar];
        for (const a of order)
            this._panel.add_child(a);

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
        this._panel.translation_y = OPEN_SLIDE;
        this._panel.ease({ opacity: 255, translation_y: 0, duration: ANIM_MS, mode: Clutter.AnimationMode.EASE_OUT_CUBIC });
    }

    /**
     * Remove the panel. The caller has already released the grab, so the backdrop stops taking
     * input immediately and only the visual fade-out remains.
     */
    dismiss({ animate }) {
        const backdrop = this.backdrop;
        this.backdrop = null;
        this._items = [];
        if (!backdrop)
            return;
        backdrop.reactive = false;
        this._panel.reactive = false;
        if (!animate) {
            backdrop.destroy();
            return;
        }
        this._fading = backdrop;
        this._panel.ease({
            opacity: 0, translation_y: OPEN_SLIDE, duration: ANIM_MS, mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onStopped: () => this._finishFade(),
        });
    }

    _finishFade() {
        const backdrop = this._fading;
        this._fading = null;
        backdrop?.destroy();
        this._opts.onGone?.(this);
    }

    /** Remove everything now, including a panel that is still fading out. */
    destroy() {
        this.dismiss({ animate: false });
        if (this._fading) {
            this._panel.remove_all_transitions();  // onStopped then runs _finishFade
            this._finishFade();
        }
    }

    get text() {
        return this._entry?.get_text() ?? '';
    }

    applyStyles(styles) {
        this.styles = styles;
        if (!this.backdrop)
            return;
        const bottom = this._opts.searchPosition !== 'top';
        this._panel.set_style(`${styles.panel} spacing: 8px;`);
        this._toolbar.set_style(styles.toolbar);
        this._entry.set_style(styles.entry);
        // Keep the hint clear of the text cursor.
        this._entry.hint_actor?.set_style(`${styles.entryHint} padding-left: 3px;`);
        this._list.set_style(`spacing: 4px; padding-${bottom ? 'bottom' : 'top'}: 2px;`);
        this._empty.set_style(styles.empty);
        this._nav.set_style('spacing: 4px;');
        this._chips.set_style('spacing: 4px;');
        this._restyleChrome();
        for (const item of this._items)
            item.restyle();
    }

    _restyleChrome() {
        const s = this.styles;
        const active = this.text.trim() ? 'all' : this.view;
        for (const [view, { button, icon, label }] of this._tabButtons ?? []) {
            const on = view === active;
            button.set_style(`${on ? s.tabActive : s.tab} spacing: 6px;`);
            setAccessibleState(button, Atk.StateType.SELECTED, on);
            icon.set_style(on ? s.tabTextActive : s.tabText);
            label.set_style(`${on ? s.tabTextActive : s.tabText} padding-left: 6px;`);
        }
        this._gear?.set_style(`${this._gear.hover ? s.title : s.subtitle} padding: 0 4px;`);
        for (const chip of this._chips?.get_children() ?? []) {
            const on = chip._categoryId === this._activeCategoryId;
            chip.set_style(on ? s.chipActive : s.chip);
            setAccessibleState(chip, Atk.StateType.CHECKED, on);
        }
    }

    // --- results -------------------------------------------------------------

    /**
     * @param {object[]} ranked  ranked and decorated (pinned, recentIndex, category)
     * @param {{kind: string, pending: number}} info
     */
    setResults(ranked, info) {
        this._ranked = ranked;
        this._info = info;
        if (!this.menu)
            this._render();
    }

    _visibleResults() {
        if (this._opts.scoped)
            return this._ranked;
        const query = this.text;
        const view = query.trim() ? 'all' : this.view;
        const cats = availableCategories(this._ranked);
        this._activeCategoryId = view === 'categories'
            ? (cats.some(c => c.id === this.category) ? this.category : cats[0]?.id ?? null)
            : null;
        return applyView(this._ranked, { view, category: this._activeCategoryId, query, pinned: this._opts.pinned() });
    }

    _renderChips() {
        const show = !this._opts.scoped && !this.text.trim() && this.view === 'categories' && !this.menu;
        this._chips.visible = show;
        this._chips.destroy_all_children();
        if (!show)
            return;
        for (const cat of availableCategories(this._ranked)) {
            const box = new St.BoxLayout({ style: 'spacing: 4px;' });
            box.add_child(new St.Icon({ icon_name: cat.icon, icon_size: 14 }));
            if (!this._compact)
                box.add_child(new St.Label({ text: cat.label, y_align: Clutter.ActorAlign.CENTER }));
            const chip = new St.Button({ child: box, can_focus: false, reactive: true, accessible_name: cat.label });
            chip._categoryId = cat.id;
            onPrimaryClick(chip, () => this.setCategory(cat.id));
            this._chips.add_child(chip);
        }
    }

    _render({ keepSelection = false } = {}) {
        if (!this.backdrop)
            return;
        const prevSelected = this.selectedIndex;
        this._list.destroy_all_children();
        this._items = [];

        this._gridActive = false;
        if (this.menu) {
            this._renderMenu();
        } else {
            const visible = this._visibleResults();
            this._renderChips();
            // Only app results have grid-sized icons; anything else falls back to the list
            // (as in Noctalia).
            this._gridActive = this.grid && visible.length > 0 && visible.every(r => r.providerId === 'apps');
            if (this._gridActive)
                this._renderGrid(visible);
            else
                visible.forEach((result, i) => this._addItem(this._list, new Item(this, i, { result, layout: 'list' })));
        }

        const count = this._items.length;
        if (!count)
            this.selectedIndex = -1;
        else if (this.menu)
            this.selectedIndex = Math.min(1, count - 1);  // first action, not the "back" header
        else
            this.selectedIndex = keepSelection ? Math.min(Math.max(prevSelected, 0), count - 1) : 0;
        if (this._selectAfterRender && count && !this.menu) {
            const follow = this._items.findIndex(item => item.result?.id === this._selectAfterRender);
            if (follow >= 0) {
                this.selectedIndex = follow;
                this._selectAfterRender = null;
            }
        }
        for (const item of this._items)
            item.restyle();
        this._scroll.vadjustment.value = 0;
        this._updateEmpty();
        this._restyleChrome();
    }

    _addItem(container, item) {
        this._items.push(item);
        container.add_child(item.actor);
    }

    _renderGrid(results) {
        const cellWidth = Math.floor((this._panel.width - 24) / GRID_COLUMNS);
        let row = null;
        results.forEach((result, i) => {
            if (i % GRID_COLUMNS === 0) {
                row = new St.BoxLayout({ x_expand: true, style: 'spacing: 4px;' });
                this._list.add_child(row);
            }
            const item = new Item(this, i, { result, layout: 'grid' });
            item.actor.set_width(cellWidth);
            this._items.push(item);
            row.add_child(item.actor);
        });
    }

    _renderMenu() {
        const { result, actions } = this.menu;
        // Row 0 is the header ("back"); actions follow.
        const header = new Item(this, 0, { action: { id: 'back', label: result.title, icon: 'go-previous-symbolic' }, layout: 'list' });
        this._addItem(this._list, header);
        actions.forEach((action, i) => this._addItem(this._list, new Item(this, i + 1, { action, layout: 'list' })));
    }

    _updateEmpty() {
        const empty = this._items.length === 0;
        this._empty.visible = empty;
        this._scroll.visible = !empty;
        if (!empty)
            return;
        const typed = this.text.trim();
        if (this._info.kind === 'overview')
            this._empty.text = 'No providers match';
        else if (typed)
            this._empty.text = this._info.pending ? 'Searching…' : 'No results';
        else if (this.view === 'recent')
            this._empty.text = 'Apps you launch will appear here';
        else if (this.view === 'pinned')
            this._empty.text = 'No pinned apps yet — Shift+Enter on an app to pin it';
        else if (this.view === 'categories')
            this._empty.text = 'No apps with a category';
        else
            this._empty.text = 'No apps';
    }

    // --- view, category, grid, menu -----------------------------------------

    setView(view, { animate = true } = {}) {
        if (this._opts.scoped || !this.tabs.includes(view) || (view === this.view && !this.text.trim()))
            return;
        const from = this.tabs.indexOf(this.text.trim() ? 'all' : this.view);
        this.view = view;
        this.menu = null;
        // Choosing a tab while a query is typed clears the query, so the tab is what you see.
        if (this.text.trim())
            this._entry.set_text('');
        else
            this._render();
        if (animate)
            this._slideBody(Math.sign(this.tabs.indexOf(view) - from));
    }

    cycleView(step) {
        const current = this.tabs.indexOf(this.text.trim() ? 'all' : this.view);
        this.setView(this.tabs[(current + step + this.tabs.length) % this.tabs.length]);
    }

    setCategory(id) {
        if (id === this._activeCategoryId)
            return;
        const cats = availableCategories(this._ranked).map(c => c.id);
        const dir = Math.sign(cats.indexOf(id) - cats.indexOf(this._activeCategoryId));
        this.category = id;
        this._render();
        this._slideBody(dir);
    }

    cycleCategory(step) {
        if (this.view !== 'categories' || this.text.trim())
            return false;
        const cats = availableCategories(this._ranked).map(c => c.id);
        if (!cats.length)
            return false;
        const i = Math.max(0, cats.indexOf(this._activeCategoryId));
        this.setCategory(cats[(i + step + cats.length) % cats.length]);
        return true;
    }

    setGrid(grid) {
        if (this.grid === grid)
            return;
        this.grid = grid;
        if (!this.menu)
            this._render({ keepSelection: true });
    }

    openMenu(result) {
        if (!result)
            return;
        let actions;
        try {
            actions = this._opts.onActions(result) ?? [];
        } catch {
            actions = [];
        }
        if (result.providerId === 'apps')
            actions = [...actions, { id: 'toggle-pin', label: result.pinned ? 'Unpin' : 'Pin', icon: 'view-pin-symbolic' }];
        this.menu = { result, actions };
        this._render();
        this._slideBody(1);
    }

    closeMenu() {
        if (!this.menu)
            return;
        this.menu = null;
        this._render();
        this._slideBody(-1);
    }

    _slideBody(direction) {
        if (!direction || !this._scroll)
            return;
        const distance = Math.min(Math.round(this._panel.width * 0.12), 72);
        for (const a of [this._scroll, this._empty]) {
            a.remove_all_transitions();
            a.translation_x = direction * distance;
            a.opacity = 199; // 0.78
            a.ease({ translation_x: 0, opacity: 255, duration: ANIM_MS, mode: Clutter.AnimationMode.EASE_OUT_CUBIC });
        }
    }

    // --- activation ----------------------------------------------------------

    activateIndex(index, opts = {}) {
        const item = this._items[index];
        if (!item)
            return;
        if (this.menu) {
            this._runMenuItem(item);
            return;
        }
        this._opts.onActivate(item.result, { alternate: Boolean(opts.alternate) });
    }

    _runMenuItem(item) {
        const { result } = this.menu;
        const id = item.action.id;
        if (id === 'back') {
            this.closeMenu();
        } else if (id === 'toggle-pin') {
            this._opts.onTogglePin(result);
            this.closeMenu();
        } else {
            this._opts.onRunAction(result, id);
        }
    }

    onItemClicked(item, event) {
        const button = event.get_button();
        if (button === Clutter.BUTTON_SECONDARY && item.result) {
            this.openMenu(item.result);
            return Clutter.EVENT_STOP;
        }
        if (button !== Clutter.BUTTON_PRIMARY && button !== Clutter.BUTTON_MIDDLE)
            return Clutter.EVENT_PROPAGATE;
        const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;
        this.selectedIndex = item.index;
        this.activateIndex(item.index, { alternate: ctrl || button === Clutter.BUTTON_MIDDLE });
        return Clutter.EVENT_STOP;
    }

    _onTextChanged() {
        this.menu = null;
        this._opts.onQuery(this._entry.get_text());
    }

    // --- keyboard ------------------------------------------------------------

    _select(index) {
        if (!this._items.length)
            return;
        const prev = this._items[this.selectedIndex];
        this.selectedIndex = index;
        prev?.restyle();
        const item = this._items[index];
        item.restyle();
        ensureActorVisibleInScrollView(this._scroll, item.layout === 'grid' ? item.actor.get_parent() : item.actor);
    }

    _pageStride() {
        const rowHeight = this._items[0]?.actor.height;
        const viewHeight = this._scroll.height;
        return rowHeight > 0 && viewHeight > 0 ? Math.max(1, Math.floor(viewHeight / rowHeight) - 1) : PAGE_FALLBACK;
    }

    _move(move) {
        const next = moveSelection(this.selectedIndex, move, {
            count: this._items.length, grid: Boolean(this._gridActive) && !this.menu, page: this._pageStride(),
        });
        if (next >= 0)
            this._select(next);
    }

    _onKey(event) {
        const sym = event.get_key_symbol();
        const state = event.get_state();
        const ctrl = (state & Clutter.ModifierType.CONTROL_MASK) !== 0;
        const shift = (state & Clutter.ModifierType.SHIFT_MASK) !== 0;
        const gridNav = Boolean(this._gridActive) && !this.menu;

        if (sym === Clutter.KEY_Escape) {
            if (this.menu)
                this.closeMenu();
            else
                this._opts.onCancel('escape');
            return Clutter.EVENT_STOP;
        }
        if (ENTER_KEYS.has(sym)) {
            if (shift && !this.menu && !this._opts.scoped)
                this.openMenu(this._items[this.selectedIndex]?.result);
            else
                this.activateIndex(this.selectedIndex, { alternate: ctrl });
            return Clutter.EVENT_STOP;
        }
        if (ctrl && (sym === Clutter.KEY_Tab || sym === Clutter.KEY_ISO_Left_Tab)) {
            this.cycleView(shift || sym === Clutter.KEY_ISO_Left_Tab ? -1 : 1);
            return Clutter.EVENT_STOP;
        }
        if (ctrl && sym >= Clutter.KEY_1 && sym <= Clutter.KEY_4) {
            this.setView(this.tabs[sym - Clutter.KEY_1]);
            return Clutter.EVENT_STOP;
        }
        if (ctrl && sym === Clutter.KEY_comma && this._opts.onOpenSettings && !this._opts.scoped) {
            this._opts.onOpenSettings();
            return Clutter.EVENT_STOP;
        }
        if (ctrl && (sym === Clutter.KEY_g || sym === Clutter.KEY_G)) {
            this._opts.onToggleGrid();
            return Clutter.EVENT_STOP;
        }
        // Ctrl+Up/Down reorders pins in the Pinned view; the selection follows the moved app.
        if (ctrl && (sym === Clutter.KEY_Up || sym === Clutter.KEY_Down) && this.view === 'pinned' && !this.text.trim() && !this.menu) {
            const result = this._items[this.selectedIndex]?.result;
            if (result && this._opts.onMovePin) {
                this._selectAfterRender = result.id;
                this._opts.onMovePin(result, sym === Clutter.KEY_Up ? -1 : 1);
            }
            return Clutter.EVENT_STOP;
        }
        if (ctrl && (sym === Clutter.KEY_Left || sym === Clutter.KEY_Right))
            return this.cycleCategory(sym === Clutter.KEY_Left ? -1 : 1) ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;

        let move = null;
        if (sym === Clutter.KEY_Down || sym === Clutter.KEY_Tab || (ctrl && sym === Clutter.KEY_n))
            move = 'down';
        else if (sym === Clutter.KEY_Up || sym === Clutter.KEY_ISO_Left_Tab || (ctrl && sym === Clutter.KEY_p))
            move = 'up';
        else if (sym === Clutter.KEY_Page_Down)
            move = 'pageDown';
        else if (sym === Clutter.KEY_Page_Up)
            move = 'pageUp';
        else if (gridNav && sym === Clutter.KEY_Left)
            move = 'left';
        else if (gridNav && sym === Clutter.KEY_Right)
            move = 'right';
        if (move) {
            this._move(move);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    // --- test hooks ------------------------------------------------------------

    /** Type into the entry as a user would. */
    setText(text) {
        this._entry.set_text(text);
    }

    /** Feed a key through the same handler as real key presses. */
    handleKeySymbol(sym, { ctrl = false, shift = false } = {}) {
        return this._onKey({
            get_key_symbol: () => sym,
            get_state: () => (ctrl ? Clutter.ModifierType.CONTROL_MASK : 0) | (shift ? Clutter.ModifierType.SHIFT_MASK : 0),
        });
    }

    get panelActor() {
        return this._panel;
    }

    /** Test hook: the settings gear (null in dmenu mode). */
    get settingsIcon() {
        return this._gear ?? null;
    }

    get toolbarActor() {
        return this._toolbar;
    }

    get rows() {
        return this._items;
    }

    /** Test hook: the icon actor shown for an item (null when none). */
    iconOf(item) {
        return item._iconBin.child ?? null;
    }

    get activeCategory() {
        return this._activeCategoryId ?? null;
    }

    get categoryChips() {
        return (this._chips?.visible ? this._chips.get_children() : []).map(c => c._categoryId);
    }
}
