// Reading and writing commands.json for the preferences editor.
// Gio only, so it runs in the preferences process. Writes are atomic and refuse to overwrite a
// file that changed on disk since it was read (etag), or one that could not be parsed.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { parseDoc, serializeDoc } from './commandsDoc.js';

export function defaultCommandsPath() {
    return GLib.build_filenamev([GLib.get_user_config_dir(), 'conjure-launcher', 'commands.json']);
}

export class CommandsStore {
    constructor(path = defaultCommandsPath()) {
        this.path = path;
        this._file = Gio.File.new_for_path(path);
        this._etag = null;
        this._state = null;  // what the last load() found
    }

    /**
     * @returns {{state: 'missing'|'ok'|'invalid'|'unreadable', doc?: object, error?: string}}
     */
    load() {
        let bytes, etag;
        try {
            [, bytes, etag] = this._file.load_contents(null);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                this._etag = null;
                this._state = 'missing';
                return { state: 'missing', doc: parseDoc('').doc };
            }
            this._state = 'unreadable';
            return { state: 'unreadable', error: e.message };
        }
        this._etag = etag;
        const parsed = parseDoc(new TextDecoder().decode(bytes));
        this._state = parsed.ok ? 'ok' : 'invalid';
        return parsed.ok ? { state: 'ok', doc: parsed.doc } : { state: 'invalid', error: parsed.error };
    }

    /**
     * Save a document over what load() read.
     * @returns {{ok: true} | {ok: false, conflict?: boolean, error: string}}
     */
    save(doc) {
        if (this._state !== 'ok' && this._state !== 'missing')
            return { ok: false, error: 'the file was not read successfully; not overwriting it' };
        if (this._state === 'missing' && this._file.query_exists(null))
            return { ok: false, conflict: true, error: 'the file was created on disk since it was read' };
        try {
            this._file.get_parent().make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                return { ok: false, error: e.message };
        }
        const bytes = new TextEncoder().encode(serializeDoc(doc));
        try {
            const [, etag] = this._file.replace_contents(bytes, this._state === 'ok' ? this._etag : null, false,
                Gio.FileCreateFlags.NONE, null);
            this._etag = etag;
            this._state = 'ok';
            return { ok: true };
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.WRONG_ETAG))
                return { ok: false, conflict: true, error: 'the file changed on disk since it was read' };
            return { ok: false, error: e.message };
        }
    }
}
