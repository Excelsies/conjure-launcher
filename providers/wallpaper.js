// Wallpapers: "/wall <name>" lists images under the wallpaper folder (setting wallpaper-dir;
// empty means <XDG Pictures>/Wallpapers) and Enter sets the GNOME background, light and dark.
//
// Icons come from freedesktop thumbnails, not from decoding the images (slow for large wallpapers). A missing
// or stale thumbnail shows a generic icon while one is made in the background, then the icon updates.
// The file list is kept across opens and re-read only when a listed folder changes.

import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import { score as fuzzy, isMatch } from '../lib/fzy.js';
import { thumbnailPaths, isFresh, THUMBNAIL_SIZES, WRITE_SIZE, WRITE_PIXELS } from '../lib/thumbnails.js';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'svg', 'avif', 'jxl']);
const MAX_DEPTH = 4;
const MAX_FILES = 5000;
const MAX_RESULTS = 50;

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');
Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'read_async');
Gio._promisify(GdkPixbuf.Pixbuf, 'new_from_stream_at_scale_async', 'new_from_stream_finish');

const MTIME_ATTRS = 'time::modified,time::modified-usec';
const mtimeOf = info => info.get_attribute_uint64('time::modified') * 1e6 + info.get_attribute_uint32('time::modified-usec');
const md5 = text => GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, text, -1);

export function wallpaperDir(setting) {
    const value = setting.trim();
    if (value)
        return value.startsWith('~/') ? GLib.build_filenamev([GLib.get_home_dir(), value.slice(2)]) : value;
    const pictures = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES) ??
        GLib.build_filenamev([GLib.get_home_dir(), 'Pictures']);
    return GLib.build_filenamev([pictures, 'Wallpapers']);
}

/** @returns {Promise<{images: {file: Gio.File, mtime: number}[], dirs: Map<string, number>}>} */
async function listImages(root) {
    const images = [];
    const dirs = new Map();  // path -> mtime (usec) of every folder listed, to detect changes later
    const walk = async (dir, depth) => {
        if (depth > MAX_DEPTH || images.length >= MAX_FILES)
            return;
        let enumerator;
        try {
            dirs.set(dir.get_path(), mtimeOf(await dir.query_info_async(MTIME_ATTRS, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null)));
            enumerator = await dir.enumerate_children_async(`standard::name,standard::type,standard::is-hidden,${MTIME_ATTRS}`,
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
                else if (IMAGE_EXTENSIONS.has(info.get_name().split('.').pop().toLowerCase()) && images.length < MAX_FILES)
                    images.push({ file: child, mtime: Math.floor(mtimeOf(info) / 1e6) });
            }
        }
    };
    await walk(Gio.File.new_for_path(root), 0);
    return { images, dirs };
}

/** True when any listed folder is gone or has a different modification time. */
async function listingChanged(dirs) {
    for (const [path, mtime] of dirs) {
        try {
            const info = await Gio.File.new_for_path(path).query_info_async(MTIME_ATTRS, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
            if (mtimeOf(info) !== mtime)
                return true;
        } catch {
            return true;
        }
    }
    return false;
}

export class WallpaperProvider {
    constructor(settings) {
        this.id = 'wallpaper';
        this.trigger = 'wall';
        this.displayName = 'Wallpapers';
        this.icon = 'preferences-desktop-wallpaper-symbolic';
        this.trackUsage = true;
        this._settings = settings;
        this._listing = null;     // Promise of {root, images, dirs}, kept across opens
        this._checked = null;     // this open's validation of the listing
        this.listCount = 0;       // listings made (tests)
        this._cacheDir = GLib.get_user_cache_dir();
        this._queue = [];         // thumbnails to create: {file, uri, mtime, onReady}
        this._queued = new Set(); // uris queued or failed this session (no retry loop)
        this._working = false;
        this._cancel = new Gio.Cancellable();
    }

    onClose() {
        this._checked = null;     // the next open re-validates the folders; queued thumbnails keep going
    }

    destroy() {
        this._cancel.cancel();
        this._queue = [];
        this._listing = null;
    }

    _images() {
        const root = wallpaperDir(this._settings.get_string('wallpaper-dir'));
        this._checked ??= (async () => {
            const current = await this._listing?.catch(() => null);
            if (current && current.root === root && !(await listingChanged(current.dirs)))
                return current;
            this.listCount++;
            this._listing = listImages(root).then(l => ({ root, ...l }));
            return this._listing;
        })();
        return this._checked;
    }

    query(text) {
        const q = text.trim().toLowerCase();
        return this._images().then(({ images }) => {
            const out = [];
            images.forEach(({ file, mtime }, i) => {
                const name = file.get_basename();
                const folder = file.get_parent()?.get_basename() ?? '';
                const s = q ? fuzzy(q, `${name} ${folder}`.toLowerCase()) : -i;
                if (!q || isMatch(s))
                    out.push({ id: file.get_path(), title: name, subtitle: file.get_parent()?.get_path() ?? '', file, mtime, score: s });
            });
            return out.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
        });
    }

    /** A fresh thumbnail's path for the image, or null. */
    thumbnailFor(file, mtime) {
        for (const path of thumbnailPaths(file.get_uri(), this._cacheDir, md5)) {
            try {
                const info = Gio.File.new_for_path(path).query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null);
                if (isFresh(info.get_attribute_uint64('time::modified'), mtime))
                    return path;
            } catch {
                // not there at this size
            }
        }
        return null;
    }

    createIcon(result, size) {
        const thumb = this.thumbnailFor(result.file, result.mtime);
        if (thumb)
            return new St.Icon({ gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(thumb) }), icon_size: size });
        const icon = new St.Icon({ icon_name: 'image-x-generic', icon_size: size });
        let alive = true;
        icon.connect('destroy', () => (alive = false));
        this._enqueue(result.file, result.mtime, path => {
            if (alive)
                icon.gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(path) });
        });
        return icon;
    }

    _enqueue(file, mtime, onReady) {
        const uri = file.get_uri();
        if (this._queued.has(uri))
            return;
        this._queued.add(uri);
        this._queue.push({ file, uri, mtime, onReady });
        this._drain();
    }

    async _drain() {
        if (this._working)
            return;
        this._working = true;
        try {
            while (this._queue.length && !this._cancel.is_cancelled()) {
                const job = this._queue.shift();
                const path = await this._makeThumbnail(job).catch(() => null);
                if (path) {
                    this._queued.delete(job.uri);  // made: a later change of the image may queue it again
                    job.onReady(path);
                }
            }
        } finally {
            this._working = false;
        }
    }

    /** Decode at thumbnail size in a worker thread and write it as the standard describes. */
    async _makeThumbnail({ file, uri, mtime }) {
        const target = thumbnailPaths(uri, this._cacheDir, md5)[THUMBNAIL_SIZES.indexOf(WRITE_SIZE)];
        const stream = await file.read_async(GLib.PRIORITY_LOW, this._cancel);
        let pixbuf;
        try {
            pixbuf = await GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, WRITE_PIXELS, WRITE_PIXELS, true, this._cancel);
        } finally {
            stream.close(null);
        }
        GLib.mkdir_with_parents(GLib.path_get_dirname(target), 0o700);
        const tmp = `${target}.conjure-launcher.tmp`;
        pixbuf.savev(tmp, 'png', ['tEXt::Thumb::URI', 'tEXt::Thumb::MTime', 'tEXt::Software'], [uri, String(mtime), 'Conjure Launcher']);
        const tmpFile = Gio.File.new_for_path(tmp);
        tmpFile.set_attribute_uint32('unix::mode', 0o600, Gio.FileQueryInfoFlags.NONE, null);
        tmpFile.move(Gio.File.new_for_path(target), Gio.FileCopyFlags.OVERWRITE, null, null);
        return target;
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
