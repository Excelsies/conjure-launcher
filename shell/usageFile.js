// Launch-history persistence for lib/usage.js.
//
// Failure handling:
// - Missing file: start empty.
// - Unparseable file: move it aside as usage.json.corrupt-<time>, so the history is kept for
//   inspection instead of being silently overwritten, then start empty.
// - Any other read error (permissions, I/O): start empty and do NOT write this session, so an
//   unreadable but intact file is never replaced by a near-empty one.
// - Writes go through g_file_replace, which writes a temporary file and renames it over the
//   target, so a crash mid-write cannot leave a truncated file. Saves are serialized.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { UsageModel } from '../lib/usage.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
// The bytes variant finishes with replace_contents_finish (there is no _bytes_finish).
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');

export class UsageFile {
    /**
     * @param {string} dirPath  e.g. $XDG_STATE_HOME/conjure-launcher
     * @param {{log: (msg: string) => void, logError: (msg: string, err: unknown) => void}} logger
     */
    constructor(dirPath, logger) {
        this._dir = Gio.File.new_for_path(dirPath);
        this._file = this._dir.get_child('usage.json');
        this._logger = logger;
        this._writable = false;
        this._queue = Promise.resolve();
        this.model = new UsageModel();
    }

    get path() {
        return this._file.get_path();
    }

    async load() {
        let text;
        try {
            const [bytes] = await this._file.load_contents_async(null);
            text = new TextDecoder().decode(bytes);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                this._writable = true;
                return;
            }
            this._logger.logError(`cannot read ${this.path}; launch history will not be saved this session`, e);
            return;
        }

        try {
            const { model, dropped } = UsageModel.parse(text);
            this.model = model;
            if (dropped)
                this._logger.log(`${this.path}: ignored ${dropped} invalid entries`);
            this._writable = true;
        } catch (e) {
            const stamp = GLib.DateTime.new_now_utc().format('%Y%m%dT%H%M%SZ');
            const aside = this._dir.get_child(`usage.json.corrupt-${stamp}`);
            try {
                this._file.move(aside, Gio.FileCopyFlags.NONE, null, null);
                this._logger.logError(`${this.path} was unreadable (${e.message}); moved to ${aside.get_path()}`, e);
                this._writable = true;
            } catch (moveErr) {
                this._logger.logError(`${this.path} is unreadable and could not be moved aside; not saving this session`, moveErr);
            }
        }
    }

    /** Queue a save of the current model. Never throws; failures are logged. */
    save() {
        if (!this._writable)
            return this._queue;
        const text = this.model.serialize();
        this._queue = this._queue.then(async () => {
            try {
                try {
                    this._dir.make_directory_with_parents(null);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                        throw e;
                }
                await this._file.replace_contents_bytes_async(
                    new GLib.Bytes(new TextEncoder().encode(text)), null, false,
                    Gio.FileCreateFlags.PRIVATE, null);
            } catch (e) {
                this._logger.logError(`saving ${this.path} failed`, e);
            }
        });
        return this._queue;
    }
}
