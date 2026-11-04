// Emoji provider: "/emo <name or keyword>" (lib/emoji.js, data/emoji.json from Noctalia).
// Enter copies the emoji.

import Gio from 'gi://Gio';

import { indexEmoji, searchEmoji } from '../lib/emoji.js';
import { copyToClipboard } from '../shell/clipboard.js';

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

    _load() {
        try {
            const [, bytes] = Gio.File.new_for_path(this._path).load_contents(null);
            return indexEmoji(JSON.parse(new TextDecoder().decode(bytes)));
        } catch (e) {
            this._logError(`cannot read emoji data ${this._path}; the emoji provider is empty`, e);
            return [];
        }
    }

    query(text) {
        this._entries ??= this._load();
        return searchEmoji(this._entries, text);
    }

    activate(result) {
        copyToClipboard(result.badge);
    }
}
