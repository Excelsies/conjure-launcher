// Freedesktop thumbnail paths and freshness (lib/thumbnails.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { thumbnailPaths, isFresh, THUMBNAIL_SIZES, WRITE_SIZE } from '../lib/thumbnails.js';

const md5 = s => createHash('md5').update(s, 'utf8').digest('hex');

test('thumbnail paths follow the standard: md5 of the URI, smallest size first', () => {
    // The standard's own example: file:///home/jens/photos/me.png -> c6ee772d9e49320e97ec29a7eb5b1697.png
    const paths = thumbnailPaths('file:///home/jens/photos/me.png', '/home/jens/.cache', md5);
    assert.equal(paths[0], '/home/jens/.cache/thumbnails/normal/c6ee772d9e49320e97ec29a7eb5b1697.png');
    assert.deepEqual(paths.map(p => p.split('/').at(-2)), THUMBNAIL_SIZES);
    assert.ok(THUMBNAIL_SIZES.includes(WRITE_SIZE));
});

test('the URI is hashed as given (percent-encoded), not decoded', () => {
    const a = thumbnailPaths('file:///p/my%20wall.png', '/c', md5)[0];
    const b = thumbnailPaths('file:///p/my wall.png', '/c', md5)[0];
    assert.notEqual(a, b);
});

test('a thumbnail older than its image, or missing, is not used', () => {
    assert.equal(isFresh(100, 100), true);
    assert.equal(isFresh(101, 100), true);
    assert.equal(isFresh(99, 100), false);
    assert.equal(isFresh(null, 100), false);
});
