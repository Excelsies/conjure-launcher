// Conjure Launcher: GNOME Shell extension entry point.
// Phase 0 skeleton: no keybinding, modal or settings side effects yet (those land in Phase 1,
// under the invariants in docs/design-brief.md section 4).

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const LOG_PREFIX = '[conjure-launcher]';

export default class ConjureLauncherExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        console.log(`${LOG_PREFIX} enabled (${this.metadata['version-name']})`);
    }

    disable() {
        this._settings = null;
        console.log(`${LOG_PREFIX} disabled`);
    }
}
