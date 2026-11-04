// Wallpapers: "/wall <name>" lists images under the wallpaper folder (setting wallpaper-dir;
// empty means <XDG Pictures>/Wallpapers) and Enter sets the GNOME background, light and dark.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import { score as fuzzy, isMatch } from '../lib/fzy.js';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'svg', 'avif', 'jxl']);
const MAX_DEPTH = 4;
const MAX_FILES = 5000;
const MAX_RESULTS = 50;

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');

export function wallpaperDir(setting) {
    const value = setting.trim();
    if (value)
        return value.startsWith('~/') ? GLib.build_filenamev([GLib.get_home_dir(), value.slice(2)]) : value;
    const pictures = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES) ??
        GLib.build_filenamev([GLib.get_home_dir(), 'Pictures']);
    return GLib.build_filenamev([pictures, 'Wallpapers']);
}

async function listImages(root) {
    const out = [];
    const walk = async (dir, depth) => {
        if (depth > MAX_DEPTH || out.length >= MAX_FILES)
            return;
        let enumerator;
        try {
            enumerator = await dir.enumerate_children_async('standard::name,standard::type,standard::is-hidden',
                Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
        } catch {
            return;  // unreadable folder: skip it
        }
        for (;;) {
            const infos = await enumerator.next_files_async(100, GLib.PRIORITY_DEFAULT, null);
            if (!infos.length)
                break;
            for (const info of infos) {
                if (info.get_is_hidden())
                    continue;
                const child = dir.get_child(info.get_name());
                if (info.get_file_type() === Gio.FileType.DIRECTORY)
                    await walk(child, depth + 1);
                else if (IMAGE_EXTENSIONS.has(info.get_name().split('.').pop().toLowerCase()) && out.length < MAX_FILES)
                    out.push(child);
            }
        }
    };
    await walk(Gio.File.new_for_path(root), 0);
    return out;
}

export class WallpaperProvider {
    constructor(settings) {
        this.id = 'wallpaper';
        this.trigger = 'wall';
        this.displayName = 'Wallpapers';
        this.icon = 'preferences-desktop-wallpaper-symbolic';
        this.trackUsage = true;
        this._settings = settings;
        this._files = null;
    }

    onClose() {
        this._files = null;
    }

    query(text) {
        const dir = wallpaperDir(this._settings.get_string('wallpaper-dir'));
        this._files ??= listImages(dir);
        const q = text.trim().toLowerCase();
        return this._files.then(files => {
            const out = [];
            files.forEach((file, i) => {
                const name = file.get_basename();
                const folder = file.get_parent()?.get_basename() ?? '';
                const s = q ? fuzzy(q, `${name} ${folder}`.toLowerCase()) : -i;
                if (!q || isMatch(s))
                    out.push({ id: file.get_path(), title: name, subtitle: file.get_parent()?.get_path() ?? '', file, score: s });
            });
            return out.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
        });
    }

    createIcon(result, size) {
        return new St.Icon({ gicon: new Gio.FileIcon({ file: result.file }), icon_size: size });
    }

    activate(result) {
        const bg = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
        const uri = result.file.get_uri();
        bg.set_string('picture-uri', uri);
        bg.set_string('picture-uri-dark', uri);
        if (bg.get_string('picture-options') === 'none')
            bg.set_string('picture-options', 'zoom');
    }
}
