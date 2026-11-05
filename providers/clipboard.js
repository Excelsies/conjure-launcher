// Clipboard history: "/clip <text>" lists recent text copies, newest first; Enter copies one back (and
// auto-paste applies). Memory only; a copy marked secret is never stored (invariant 7, lib/clipHistory.js).
// GNOME disables extensions while the screen is locked, so the history also clears on every lock.

import Meta from 'gi://Meta';
import St from 'gi://St';

import { score as fuzzy, isMatch } from '../lib/fzy.js';
import { ClipHistory, shouldStore, preview } from '../lib/clipHistory.js';
import { copyToClipboard } from '../shell/clipboard.js';

const CLIPBOARD = Meta.SelectionType.SELECTION_CLIPBOARD;

export class ClipboardProvider {
    constructor(settings, logError) {
        this.id = 'clipboard';
        this.trigger = 'clip';
        this.displayName = 'Clipboard history';
        this.icon = 'edit-paste-symbolic';
        this.trackUsage = false;
        this._settings = settings;
        this._logError = logError;
        this._loggedReadFailure = false;
        this.history = new ClipHistory(settings.get_int('clipboard-history-size'));
        this._generation = 0;  // a read that finishes after a newer copy (or disable) is dropped
        this.reads = 0;        // clipboard reads issued (tests)
        this._selection = global.display.get_selection();
        this._selectionId = this._selection.connect('owner-changed', (_s, type, source) => this.onOwnerChanged(type, source));
        this._settingsIds = [
            settings.connect('changed::clipboard-history', () => {
                if (!settings.get_boolean('clipboard-history'))
                    this.history.clear();
            }),
            settings.connect('changed::clipboard-history-size', () => this.history.setLimit(settings.get_int('clipboard-history-size'))),
            settings.connect('changed::clipboard-clear-request', () => this.history.clear()),
        ];
    }

    /** The selection owner changed: read the new text and store it if allowed. Public for tests. */
    onOwnerChanged(type, source) {
        const generation = ++this._generation;
        if (type !== CLIPBOARD || !source || !this._settings.get_boolean('clipboard-history'))
            return;
        let mimetypes;
        try {
            mimetypes = source.get_mimetypes();
        } catch (e) {
            this._readFailed(e);
            return;
        }
        // Checked before reading: a secret is never even read into the extension.
        if (!shouldStore(mimetypes, 'x'))
            return;
        this.reads++;
        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_c, text) => {
            if (generation !== this._generation || !this._selectionId)
                return;
            if (shouldStore(mimetypes, text))
                this.history.add(text);
        });
    }

    _readFailed(e) {
        if (!this._loggedReadFailure)
            this._logError('could not read a clipboard copy; it was not stored', e);
        this._loggedReadFailure = true;
    }

    query(text) {
        const q = text.trim().toLowerCase();
        const out = [];
        this.history.items().forEach(({ text: t }, i) => {
            const s = q ? fuzzy(q, t.slice(0, 2000).toLowerCase()) : -i;
            if (q && !isMatch(s))
                return;
            const lines = t.split('\n').length;
            out.push({
                id: `clip-${i}`, title: preview(t), subtitle: `${lines > 1 ? `${lines} lines, ` : ''}${t.length} characters`,
                iconName: this.icon, copyText: t, copies: true, score: q ? s : -i,
            });
        });
        return out.sort((a, b) => b.score - a.score);
    }

    activate(result) {
        copyToClipboard(result.copyText);
    }

    destroy() {
        this._generation++;
        if (this._selectionId)
            this._selection.disconnect(this._selectionId);
        this._selectionId = 0;
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];
        this.history.clear();
    }
}
