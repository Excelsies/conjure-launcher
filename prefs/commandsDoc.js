// The commands.json document as the preferences editor sees it.
// Pure: parsing, editing that keeps unknown keys, validation with the extension's own rules,
// and serialization.

import { validateCommands, COMMANDS_FORMAT_VERSION } from '../lib/commands.js';
import { BUILTIN_TRIGGERS } from '../lib/builtins.js';

export const EDITABLE_FIELDS = Object.freeze(['id', 'label', 'prefix', 'icon', 'command', 'exec', 'freeform', 'global', 'cache']);

export function emptyDoc() {
    return { version: COMMANDS_FORMAT_VERSION, entries: [] };
}

/** @returns {{ok: true, doc: object} | {ok: false, error: string}} empty text = empty document */
export function parseDoc(text) {
    if (text === null || text === undefined || !text.trim())
        return { ok: true, doc: emptyDoc() };
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        return { ok: false, error: `not valid JSON: ${e.message}` };
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== COMMANDS_FORMAT_VERSION || !Array.isArray(data.entries))
        return { ok: false, error: 'expected {"version": 1, "entries": [...]}' };
    return { ok: true, doc: data };
}

/** Errors for the whole document, as the extension would report them. */
export function validateDoc(doc) {
    return validateCommands(doc, BUILTIN_TRIGGERS).errors;
}

/** Errors that concern entry `index` (entries are reported as "entry <index>..."). */
export function errorsFor(doc, index) {
    return validateDoc(doc).filter(e => e.startsWith(`entry ${index} `) || e.startsWith(`entry ${index}:`));
}

function clean(fields) {
    const out = {};
    for (const key of EDITABLE_FIELDS) {
        const v = fields[key];
        if (key === 'freeform' || key === 'global') {
            if (v === true)
                out[key] = true;
        } else if (key === 'cache') {
            if (Number.isInteger(v) && v > 0)
                out[key] = v;
        } else if (typeof v === 'string' && v.trim() !== '') {
            out[key] = key === 'command' || key === 'exec' ? v : v.trim();
        }
    }
    return out;
}

/**
 * Add (index = null) or replace entry `index` with `fields`. Keys the editor does not know about
 * are kept from the old entry; editable keys left empty are removed.
 * @returns {object} a new document; the input is not mutated
 */
export function upsertEntry(doc, index, fields) {
    const entries = [...doc.entries];
    const base = index === null ? {} : { ...entries[index] };
    for (const key of EDITABLE_FIELDS)
        delete base[key];
    const entry = { ...base, ...clean(fields) };
    if (index === null)
        entries.push(entry);
    else
        entries[index] = entry;
    return { ...doc, entries };
}

export function removeEntry(doc, index) {
    return { ...doc, entries: doc.entries.filter((_, i) => i !== index) };
}

export function serializeDoc(doc) {
    return `${JSON.stringify(doc, null, 2)}\n`;
}

/** A URL-safe id suggestion from a label ("SSH hosts" -> "ssh-hosts"), unique in the document. */
export function suggestId(doc, label) {
    const base = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'command';
    const taken = new Set(doc.entries.map(e => e?.id));
    let id = base;
    for (let n = 2; taken.has(id); n++)
        id = `${base}-${n}`;
    return id;
}
