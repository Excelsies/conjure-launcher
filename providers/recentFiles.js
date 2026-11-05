// Recent files: "/rec <name>" lists files from GTK's recently-used list (~/.local/share/recently-used.xbel,
// written by GTK apps), newest first; Enter opens one in its default app. Read once per open, off the main
// thread; a missing or unparseable list gives no results and is logged once.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import { score as fuzzy, isMatch } from '../lib/fzy.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');

const MAX_SCANNED = 500;  // newest entries considered
const MAX_RESULTS = 50;

export class RecentFilesProvider {
    constructor(logError) {
        this.id = 'recent-files';
        this.trigger = 'rec';
        this.displayName = 'Recent files';
        this.icon = 'document-open-recent-symbolic';
        this.trackUsage = false;
        this._logError = logError;
        this._loggedFailure = false;
        this._entries = null;
        this.path = GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']);
    }

    onClose() {
        this._entries = null;
    }

    async _load() {
        const file = Gio.File.new_for_path(this.path);
        let bytes;
        try {
            [bytes] = await file.load_contents_async(null);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                this._failed(e);
            return [];
        }
        const bookmarks = new GLib.BookmarkFile();
        try {
            bookmarks.load_from_data(bytes);
        } catch (e) {
            this._failed(e);
            return [];
        }
        return bookmarks.get_uris()
            .filter(uri => uri.startsWith('file://'))
            .map(uri => ({ uri, modified: bookmarks.get_modified_date_time(uri)?.to_unix() ?? 0, mime: this._mime(bookmarks, uri) }))
            .sort((a, b) => b.modified - a.modified)
            .slice(0, MAX_SCANNED)
            .map(e => {
                const f = Gio.File.new_for_uri(e.uri);
                return { ...e, file: f, name: f.get_basename() ?? e.uri, folder: f.get_parent()?.get_path() ?? '' };
            });
    }

    _mime(bookmarks, uri) {
        try {
            return bookmarks.get_mime_type(uri);
        } catch {
            return null;
        }
    }

    _failed(e) {
        if (!this._loggedFailure)
            this._logError(`could not read ${this.path}`, e);
        this._loggedFailure = true;
    }

    query(text) {
        this._entries ??= this._load();
        const q = text.trim().toLowerCase();
        return this._entries.then(entries => {
            const out = [];
            entries.forEach((e, i) => {
                const s = q ? fuzzy(q, `${e.name} ${e.folder}`.toLowerCase()) : -i;
                if (q && !isMatch(s))
                    return;
                // A deleted file stays in the list until GTK prunes it; skip it here.
                if (out.length < MAX_RESULTS && e.file.query_exists(null))
                    out.push({ id: e.uri, title: e.name, subtitle: e.folder, uri: e.uri, mime: e.mime, score: s });
            });
            return out.sort((a, b) => b.score - a.score);
        });
    }

    createIcon(result, size) {
        const gicon = result.mime ? Gio.content_type_get_icon(result.mime) : Gio.ThemedIcon.new('text-x-generic');
        return new St.Icon({ gicon, icon_size: size });
    }

    /** Separate so tests can record opens instead of starting apps. */
    launchUri(uri) {
        Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
    }

    activate(result) {
        this.launchUri(result.uri);
    }
}
