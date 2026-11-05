// Emoji provider: "/emo <name or keyword>" (lib/emoji.js, data/emoji.json from Noctalia).
// Enter copies the emoji.

import Gio from 'gi://Gio';

import { indexEmoji, searchEmoji } from '../lib/emoji.js';
import { copyToClipboard } from '../shell/clipboard.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');

export class EmojiProvider {
    /** @param {string} dataPath  absolute path of data/emoji.json */
    constructor(dataPath, logError) {
        this.id = 'emoji';
        this.trigger = 'emo';
        this.displayName = 'Emoji';
        this.icon = 'face-smile-symbolic';
        this.trackUsage = true;
        this._path = dataPath;
        this._logError = logError;
        this._entries = null;
    }

    /** Read and index the data once, off the main thread, on the first /emo query. */
    async _load() {
        try {
            const [bytes] = await Gio.File.new_for_path(this._path).load_contents_async(null);
            return indexEmoji(JSON.parse(new TextDecoder().decode(bytes)));
        } catch (e) {
            this._logError(`cannot read emoji data ${this._path}; the emoji provider is empty`, e);
            return [];
        }
    }

    query(text) {
        this._entries ??= this._load();
        return this._entries.then(entries => searchEmoji(entries, text));
    }

    activate(result) {
        copyToClipboard(result.badge);
    }
}
