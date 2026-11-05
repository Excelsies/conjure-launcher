// Custom command entries from ~/.config/conjure-launcher/commands.json (docs/architecture.md,
// Command entries).
// CommandsRegistry watches the file and keeps one CommandProvider per valid entry in the
// launcher's provider list (edited in place, so the query controller sees changes at once).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { trySpawn } from 'resource:///org/gnome/shell/misc/util.js';

import { validateCommands, parseCandidates, execArgv, commandArgv } from '../lib/commands.js';
import { score as fuzzy, isMatch } from '../lib/fzy.js';
import { copyToClipboard } from '../shell/clipboard.js';

const COMMAND_TIMEOUT_MS = 2000;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const RELOAD_DELAY_MS = 200;
// Typed text is offered after every real match (Noctalia scores it 2048, above all matches,
// which makes Enter on "st" run with "st" instead of the visible "staging").
const FREEFORM_SCORE = -1e9;

Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');

/** Run a candidate command: 2 s timeout, 1 MiB output cap, killable via cancel(). */
function runCommand(command, { onCancel }) {
    return new Promise(resolve => {
        let proc;
        try {
            proc = Gio.Subprocess.new(commandArgv(command), Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        } catch (e) {
            resolve({ ok: false, error: e.message });
            return;
        }
        const stdout = proc.get_stdout_pipe();
        const chunks = [];
        let size = 0;
        let finished = false;
        const finish = result => {
            if (finished)
                return;
            finished = true;
            if (timer)
                GLib.source_remove(timer);
            timer = 0;
            resolve(result);
        };
        const kill = reason => {
            // setsid made the child a session and process-group leader, so its pid is the group id.
            const pid = proc.get_identifier();
            if (pid)
                GLib.spawn_async(null, ['/bin/kill', '-KILL', '--', `-${pid}`], null, GLib.SpawnFlags.STDERR_TO_DEV_NULL, null);
            proc.force_exit();
            finish({ ok: false, error: reason });
        };
        let timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, COMMAND_TIMEOUT_MS, () => {
            timer = 0;  // this source is finished; finish() must not remove it again
            kill(`timed out after ${COMMAND_TIMEOUT_MS} ms`);
            return GLib.SOURCE_REMOVE;
        });
        onCancel(() => kill('cancelled'));
        (async () => {
            try {
                for (;;) {
                    const bytes = await stdout.read_bytes_async(64 * 1024, GLib.PRIORITY_DEFAULT, null);
                    const n = bytes.get_size();
                    if (!n || finished)
                        break;
                    size += n;
                    if (size > MAX_OUTPUT_BYTES) {
                        kill(`output over ${MAX_OUTPUT_BYTES} bytes`);
                        return;
                    }
                    chunks.push(bytes.toArray());
                }
                const all = new Uint8Array(size);
                let off = 0;
                for (const c of chunks) {
                    all.set(c, off);
                    off += c.length;
                }
                finish({ ok: true, text: new TextDecoder().decode(all) });
            } catch (e) {
                finish({ ok: false, error: e.message });
            }
        })();
    });
}

export class CommandProvider {
    constructor(entry, { logError }) {
        this.entry = entry;
        this.id = `cmd:${entry.id}`;
        this.trigger = entry.prefix;
        this.displayName = entry.label;
        this.icon = entry.icon;
        this.global = entry.global;
        this.trackUsage = true;
        this._logError = logError;
        this._candidates = null;    // per open: Promise<{raw,title,subtitle}[]>
        this._cancelRun = null;
    }

    /** Called when the launcher closes: drop the cache and kill a command still running. */
    onClose() {
        this._cancelRun?.();
        this._cancelRun = null;
        this._candidates = null;
    }

    _loadCandidates() {
        if (!this.entry.command)
            return Promise.resolve([]);
        const callbacks = [];
        this._cancelRun = () => callbacks.splice(0).forEach(fn => fn());
        return runCommand(this.entry.command, { onCancel: fn => callbacks.push(fn) }).then(r => {
            if (!r.ok) {
                if (r.error !== 'cancelled')
                    this._logError(`command for "${this.entry.id}" failed: ${r.error}`, null);
                return [];
            }
            return parseCandidates(r.text);
        });
    }

    query(text) {
        const q = text.trim();
        if (!this.entry.command) {
            // Exec-only entry (e.g. a web search): one result that runs with the typed text.
            return [{ id: 'run', title: q ? `${this.entry.label}: ${q}` : this.entry.label,
                subtitle: this.entry.exec, iconName: this.icon, raw: q, typed: q, score: 0 }];
        }
        this._candidates ??= this._loadCandidates();
        const copies = !this.entry.exec;
        return this._candidates.then(candidates => {
            const lower = q.toLowerCase();
            const out = [];
            candidates.forEach((c, i) => {
                const s = lower ? fuzzy(lower, c.title.toLowerCase()) : -i;
                if (!lower || isMatch(s))
                    out.push({ id: c.raw, title: c.title, subtitle: c.subtitle || this.entry.label, raw: c.raw, typed: q, iconName: this.icon, copies, score: s });
            });
            if (this.entry.freeform && q)
                out.push({ id: `freeform:${q}`, title: q, subtitle: `Use typed text · ${this.entry.label}`, raw: q, typed: q, iconName: this.icon, copies, score: FREEFORM_SCORE, freeform: true });
            return out.sort((a, b) => b.score - a.score);
        });
    }

    activate(result) {
        if (!this.entry.exec) {
            copyToClipboard(result.raw);
            return;
        }
        // {selection} is the chosen line; {query} is what was typed after the prefix.
        trySpawn(execArgv(this.entry.exec, result.raw, result.typed ?? ''));
    }
}

export class CommandsRegistry {
    /**
     * @param {{providers: object[], reservedPrefixes: () => string[], log, logError, path?: string}} opts
     */
    constructor({ providers, reservedPrefixes, log, logError, path }) {
        this._providers = providers;
        this._reserved = reservedPrefixes;
        this._log = log;
        this._logError = logError;
        this.path = path ?? GLib.build_filenamev([GLib.get_user_config_dir(), 'conjure-launcher', 'commands.json']);
        this._file = Gio.File.new_for_path(this.path);
        this.errors = [];
        this._reloadId = 0;
        // Watch reliably from the start: for a file in a folder that does not exist yet, GLib
        // falls back to polling about every 4 s, so create our own config folder up front.
        try {
            this._file.get_parent().make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                logError(`cannot create ${this._file.get_parent().get_path()}`, e);
        }
        this._monitor = this._file.monitor_file(Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._monitorId = this._monitor.connect('changed', () => this._scheduleReload());
        this.reload();
    }

    destroy() {
        if (this._reloadId)
            GLib.source_remove(this._reloadId);
        this._reloadId = 0;
        this._monitor.disconnect(this._monitorId);
        this._monitor.cancel();
        this._apply([]);
    }

    get entries() {
        return this._providers.filter(p => p instanceof CommandProvider).map(p => p.entry);
    }

    _scheduleReload() {
        if (this._reloadId)
            GLib.source_remove(this._reloadId);
        this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RELOAD_DELAY_MS, () => {
            this._reloadId = 0;
            this.reload();
            return GLib.SOURCE_REMOVE;
        });
    }

    reload() {
        let text;
        try {
            text = new TextDecoder().decode(this._file.load_contents(null)[1]);
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                this.errors = [];
                this._apply([]);
                return;
            }
            this._logError(`cannot read ${this.path}; keeping the previous command entries`, e);
            return;
        }
        let result;
        try {
            result = validateCommands(JSON.parse(text), this._reserved());
        } catch (e) {
            this.errors = [e.message];
            this._logError(`${this.path} is not valid (${e.message}); keeping the previous command entries`, null);
            return;
        }
        this.errors = result.errors;
        for (const err of result.errors)
            this._log(`${this.path}: ${err}; entry skipped`);
        this._apply(result.entries);
    }

    _apply(entries) {
        for (let i = this._providers.length - 1; i >= 0; i--) {
            if (this._providers[i] instanceof CommandProvider) {
                this._providers[i].onClose();
                this._providers.splice(i, 1);
            }
        }
        for (const entry of entries)
            this._providers.push(new CommandProvider(entry, { logError: this._logError }));
    }
}
