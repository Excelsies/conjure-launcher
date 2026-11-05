#!/usr/bin/env bash
# Pre-upload checks for extensions.gnome.org (docs/publishing.md):
#   1. build the zip (tools/pack.sh)
#   2. check its contents: runtime files only, notices included, no compiled schemas
#   3. check the automatable review rules on the packaged sources
#   4. install the ZIP (not the checkout) into a headless sandbox and run smoke tests
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
uuid="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$root/metadata.json")"
fail=0
bad() { echo "FAIL: $*"; fail=1; }
ok() { echo "ok - $*"; }

"$root/tools/pack.sh" >/dev/null
zip="$root/dist/$uuid.shell-extension.zip"
[[ -f "$zip" ]] || { echo "FAIL: no zip at $zip"; exit 1; }
listing="$(unzip -Z1 "$zip")"

for f in metadata.json extension.js prefs.js stylesheet.css LICENSE THIRD_PARTY_NOTICES.md \
         schemas/org.gnome.shell.extensions.conjure-launcher.gschema.xml data/emoji.json bin/conjure-dmenu; do
    grep -qx "$f" <<<"$listing" && ok "zip contains $f" || bad "zip is missing $f"
done
for pat in '^tests/' '^tools/' '^ci/' '^docs/' '^node_modules/' '\.compiled$' '^\.git' '^package' '^eslint'; do
    grep -qE "$pat" <<<"$listing" && bad "zip contains files matching $pat" || ok "no files matching $pat"
done

work="$(mktemp -d "${TMPDIR:-/var/tmp}/conjure-ego.XXXXXX")"
trap 'rm -rf "$work"' EXIT
unzip -q "$zip" -d "$work"
js="$(cd "$work" && find . -name '*.js' -not -path './bin/*' | sort)"

# Legacy imports and eval-like constructs are rejected in review.
grep -nE "imports\.(gi|misc|ui)|\beval\(|new Function\(" $(cd "$work" && echo $js | sed "s#\./#$work/#g") && bad "legacy imports or eval" || ok "no legacy imports or eval"
# No GNOME objects or shell state touched at import time (plain JS constants such as Map/Set
# tables are fine; Gio._promisify is accepted by reviewers).
if grep -nE "^(const|let|var) [A-Za-z_]+ = (new (St|Clutter|Gio|GLib|Meta|Shell|GObject)\.|global\.|Main\.|(St|Gio)\.[A-Za-z]+\.get_default\()" $(cd "$work" && echo $js | sed "s#\./#$work/#g"); then
    bad "objects created at module level"
else
    ok "no objects created at module level"
fi
# The preferences process has no shell: prefs.js and what it imports must not use shell libraries.
prefs_graph="$work/prefs.js $work/lib/theme.js $work/lib/prefsHelpers.js $work/lib/commandsDoc.js $work/lib/commands.js $work/lib/builtins.js $work/common/commandsStore.js"
grep -nE "gi://(St|Clutter|Meta|Shell)|resource:///org/gnome/shell/ui" $prefs_graph && bad "prefs imports shell-only libraries" || ok "prefs uses no shell-only libraries"
# enable() must not be done in the constructor.
grep -nE "^\s+constructor\(" "$work/extension.js" && bad "extension.js defines a constructor" || ok "extension.js has no constructor"
python3 -I - "$work/metadata.json" <<'PY' || fail=1
import json, sys
m = json.load(open(sys.argv[1]))
need = ['uuid', 'name', 'description', 'shell-version', 'url', 'settings-schema']
missing = [k for k in need if not m.get(k)]
print('FAIL: metadata missing ' + ', '.join(missing) if missing else 'ok - metadata has ' + ', '.join(need))
sys.exit(1 if missing else 0)
PY
head -1 "$work/LICENSE" | grep -q 'MIT License' && ok "license is MIT (GPL-compatible)" || bad "license not found"

echo "== smoke tests against the installed zip"
CONJURE_TEST_ZIP="$zip" "$root/tools/shell-test.sh" "$root/tests/shell/defaults.js" "$root/tests/shell/providers.js" || fail=1

(( fail == 0 )) && echo "ego-check: all checks passed ($zip)" || echo "ego-check: FAILED"
exit "$fail"
