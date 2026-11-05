// Custom command entries (docs/architecture.md, Command entries): validation of commands.json,
// candidate parsing, and the injection-safe exec command line.

export const COMMANDS_FORMAT_VERSION = 1;
export const MAX_CANDIDATES = 500;
export const MAX_STRING = 1000;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
const PREFIX_RE = /^[a-z0-9][a-z0-9-]{0,15}$/;
const ICON_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Validate a parsed commands.json. Entries are checked one by one; an invalid entry is dropped
 * and reported, the rest are kept.
 * @param {unknown} data            JSON.parse output
 * @param {string[]} reservedPrefixes  triggers already used by built-in providers
 * @returns {{entries: object[], errors: string[]}}
 * @throws {SyntaxError} when the document itself is not a version-1 object with an entries array
 */
export function validateCommands(data, reservedPrefixes = []) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== COMMANDS_FORMAT_VERSION ||
        !Array.isArray(data.entries))
        throw new SyntaxError('expected {"version": 1, "entries": [...]}');

    const entries = [];
    const errors = [];
    const ids = new Set();
    const prefixes = new Set(reservedPrefixes);
    data.entries.forEach((e, i) => {
        const fail = reason => errors.push(`entry ${i}${e && typeof e.id === 'string' ? ` (${e.id})` : ''}: ${reason}`);
        if (!e || typeof e !== 'object' || Array.isArray(e))
            return fail('not an object');
        if (typeof e.id !== 'string' || !ID_RE.test(e.id))
            return fail('id must be 1-32 characters: a-z, 0-9, -');
        if (ids.has(e.id))
            return fail('duplicate id');
        if (typeof e.prefix !== 'string' || !PREFIX_RE.test(e.prefix))
            return fail('prefix must be 1-16 characters: a-z, 0-9, -');
        if (prefixes.has(e.prefix))
            return fail(`prefix "${e.prefix}" is already used`);
        for (const key of ['label', 'command', 'exec']) {
            if (e[key] !== undefined && (typeof e[key] !== 'string' || e[key].length > MAX_STRING))
                return fail(`${key} must be a string of at most ${MAX_STRING} characters`);
        }
        if (!e.command && !e.exec)
            return fail('needs a command, an exec, or both');
        if (e.icon !== undefined && (typeof e.icon !== 'string' || !ICON_RE.test(e.icon)))
            return fail('icon must be an icon name');
        for (const key of ['global', 'freeform']) {
            if (e[key] !== undefined && typeof e[key] !== 'boolean')
                return fail(`${key} must be true or false`);
        }
        ids.add(e.id);
        prefixes.add(e.prefix);
        entries.push({
            id: e.id, prefix: e.prefix, label: e.label || e.id, icon: e.icon || 'utilities-terminal-symbolic',
            command: e.command || '', exec: e.exec || '', global: e.global === true, freeform: e.freeform === true,
        });
    });
    return { entries, errors };
}

/**
 * Candidates from command output: one per non-empty line; "title<TAB>subtitle" is split for
 * display, but the raw line is what {selection} receives (as in Noctalia's dmenu).
 */
export function parseCandidates(text, limit = MAX_CANDIDATES) {
    const out = [];
    for (const line of String(text).split('\n')) {
        const raw = line.replace(/\r$/, '');
        if (!raw.trim())
            continue;
        const tab = raw.indexOf('\t');
        out.push({ raw, title: tab >= 0 ? raw.slice(0, tab) : raw, subtitle: tab >= 0 ? raw.slice(tab + 1) : '' });
        if (out.length >= limit)
            break;
    }
    return out;
}

/**
 * The argv that runs an exec template. The template is shell syntax written by the user; the
 * selection and query are not: {selection} and {query} become "$1" and "$2", and the values are
 * passed as arguments, so no candidate text is ever parsed by the shell.
 */
export function execArgv(template, selection, query) {
    const script = template.replaceAll('{selection}', '"$1"').replaceAll('{query}', '"$2"');
    return ['/bin/sh', '-c', script, 'conjure-launcher', String(selection), String(query)];
}

/**
 * The argv that runs a candidate command (user-written shell syntax, no substitutions), in its own
 * session (setsid), so the whole process group can be killed on timeout or close: killing only the
 * shell would leave its children (e.g. "sleep 10 &") running.
 */
export function commandArgv(command) {
    return ['/usr/bin/setsid', '/bin/sh', '-c', command];
}
