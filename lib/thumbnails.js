// Freedesktop thumbnail locations (Thumbnail Managing Standard 0.9): a thumbnail of the file with URI u is
// <cache>/thumbnails/<size>/<md5(u)>.png, where u is the canonical file URI as Gio prints it. Pure: the MD5
// function is passed in, so this runs under Node and GJS alike.

/** Smallest first: the launcher draws 40-48 px icons, so the 128 px "normal" size is enough when present. */
export const THUMBNAIL_SIZES = Object.freeze(['normal', 'large', 'x-large', 'xx-large']);
/** The size the launcher writes when it creates a missing thumbnail (256 px). */
export const WRITE_SIZE = 'large';
export const WRITE_PIXELS = 256;

/**
 * @param {string} uri  the file's URI (Gio.File.get_uri())
 * @param {string} cacheDir  $XDG_CACHE_HOME
 * @param {(s: string) => string} md5  hex MD5 of a UTF-8 string
 * @returns {string[]} candidate thumbnail paths, smallest size first
 */
export function thumbnailPaths(uri, cacheDir, md5) {
    const name = `${md5(uri)}.png`;
    return THUMBNAIL_SIZES.map(size => `${cacheDir}/thumbnails/${size}/${name}`);
}

/**
 * A thumbnail is usable only when it is at least as new as the image (a replaced image keeps its URI, so an
 * older thumbnail would show the old picture).
 * @param {number|null} thumbMtime  seconds, or null when the thumbnail does not exist
 * @param {number} imageMtime  seconds
 */
export function isFresh(thumbMtime, imageMtime) {
    return typeof thumbMtime === 'number' && thumbMtime >= imageMtime;
}
