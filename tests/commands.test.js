// Command entries: validation, candidate parsing, and exec safety checked against a real /bin/sh.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateCommands, parseCandidates, execArgv, MAX_CANDIDATES } from '../lib/commands.js';
import { BUILTIN_TRIGGERS } from '../lib/builtins.js';

const good = { id: 'ssh', prefix: 'ssh', label: 'SSH', command: 'echo a', exec: 'echo {selection}' };

test('valid entries load with defaults filled in', () => {
    const { entries, errors } = validateCommands({ version: 1, entries: [good, { id: 'g', prefix: 'g', exec: 'xdg-open {query}' }] });
    assert.deepEqual(errors, []);
    assert.equal(entries.length, 2);
    assert.equal(entries[1].label, 'g');
    assert.equal(entries[1].icon, 'utilities-terminal-symbolic');
    assert.equal(entries[1].global, false);
});

test('each bad entry is dropped with a reason; good ones survive', () => {
    const { entries, errors } = validateCommands({ version: 1, entries: [
        null, [], { id: 'BAD', prefix: 'x', exec: 'x' }, { id: 'a', prefix: 'calc', exec: 'x' },
        { id: 'b', prefix: 'b' }, { id: 'c', prefix: 'c', exec: 5 }, { id: 'd', prefix: 'd', exec: 'x', global: 'yes' },
        { id: 'e', prefix: 'e', exec: 'x', icon: '../../etc/passwd' }, { id: 'f', prefix: 'f', exec: 'x'.repeat(1001) },
        good, { ...good, prefix: 'other' }, { ...good, id: 'ssh2' },
    ] }, ['calc', 'emo']);
    assert.deepEqual(entries.map(e => e.id), ['ssh']);
    assert.equal(errors.length, 11);
    assert.match(errors.join('\n'), /prefix "calc" is already used/);
    assert.match(errors.join('\n'), /duplicate id/);
    assert.match(errors.join('\n'), /prefix "ssh" is already used/);
});

test('a malformed document throws so the caller can keep the last good entries', () => {
    for (const bad of [null, [], {}, { version: 2, entries: [] }, { version: 1 }, { version: 1, entries: {} }])
        assert.throws(() => validateCommands(bad), SyntaxError);
});

test('candidates: one per line, tab splits title/subtitle, raw line kept, capped', () => {
    assert.deepEqual(parseCandidates('alpha\n\n beta\tthe b \r\n'), [
        { raw: 'alpha', title: 'alpha', subtitle: '' },
        { raw: ' beta\tthe b ', title: ' beta', subtitle: 'the b ' },
    ]);
    assert.equal(parseCandidates('x\n'.repeat(MAX_CANDIDATES + 10)).length, MAX_CANDIDATES);
});

// The oracle is a real /bin/sh: hostile candidate text must arrive as one literal argument.
test('exec never lets candidate text become shell syntax (real /bin/sh)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'conjure-exec-'));
    try {
        const marker = join(dir, 'PWNED');
        const hostile = [
            `a; touch ${marker}`, `$(touch ${marker})`, `\`touch ${marker}\``, `" ; touch ${marker} ; "`,
            `' ; touch ${marker} ; '`, `a && touch ${marker}`, `a | touch ${marker}`, `a\ntouch ${marker}`,
            '$HOME', '*', '-n', '${IFS}',
        ];
        for (const sel of hostile) {
            const argv = execArgv('printf "%s|%s" {selection} {query}', sel, 'q$(id)');
            const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' });
            assert.equal(r.status, 0, r.stderr);
            assert.equal(r.stdout, `${sel}|q$(id)`, `${JSON.stringify(sel)} was not passed literally`);
            assert.ok(!existsSync(marker), `${JSON.stringify(sel)} executed a command`);
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('exec substitutes every placeholder occurrence', () => {
    const argv = execArgv('printf %s-%s-%s {selection} {query} {selection}', 'S', 'Q');
    const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' });
    assert.equal(r.stdout, 'S-Q-S');
});

test('a command runs in its own process group, so killing the group stops its children', async () => {
    const { commandArgv } = await import('../lib/commands.js');
    const argv = commandArgv('sleep 30 & echo $! ; wait');
    const { spawn } = await import('node:child_process');
    const child = spawn(argv[0], argv.slice(1), { stdio: ['ignore', 'pipe', 'ignore'] });
    const grandchild = Number(await new Promise(r => child.stdout.once('data', d => r(String(d).trim()))));
    process.kill(-child.pid, 'SIGKILL');
    await new Promise(r => setTimeout(r, 200));
    const alive = pid => {
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    };
    assert.ok(!alive(grandchild), 'the background child survived the group kill');
});

test('cache: whole seconds from 0 to a day, kept on the entry (0 when absent)', () => {
    const base = { id: 'k', prefix: 'k', command: 'true' };
    const one = cache => validateCommands({ version: 1, entries: [{ ...base, cache }] }, []);
    assert.equal(one(60).entries[0].cache, 60);
    assert.equal(validateCommands({ version: 1, entries: [base] }, []).entries[0].cache, 0);
    for (const bad of [-1, 1.5, '60', 86401])
        assert.equal(one(bad).entries.length, 0, String(bad));
});

test('the shipped example commands file is valid', () => {
    const data = JSON.parse(readFileSync(new URL('../data/commands.example.json', import.meta.url), 'utf8'));
    const r = validateCommands(data, BUILTIN_TRIGGERS);
    assert.deepEqual(r.errors, []);
    assert.equal(r.entries.length, 4);
});
