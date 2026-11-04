// Harness probe: proves the automation hook runs inside a headless shell with the extension
// loaded from the sandbox. Run with tools/shell-test.sh.
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GLib from 'gi://GLib';

export async function run() {
    const uuid = GLib.getenv('CONJURE_TEST_UUID');
    const ext = Main.extensionManager.lookup(uuid);
    if (!ext)
        throw new Error(`extension ${uuid} not found`);
    // ExtensionState.ACTIVE === 1
    if (ext.state !== 1)
        throw new Error(`extension state ${ext.state}, error: ${ext.error}`);
    console.log(`ok - extension ${uuid} is active, path ${ext.path}`);
    console.log(`ok - monitors: ${Main.layoutManager.monitors.length}, primary ${Main.layoutManager.primaryMonitor?.width}x${Main.layoutManager.primaryMonitor?.height}`);
}
