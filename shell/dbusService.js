// org.excelsies.ConjureLauncher on the session bus (design brief section 18): Dmenu(prompt,
// candidates) opens the launcher scoped to the candidates and answers with the pick. Every
// pending call is answered exactly once: on a pick, on any close, on a newer call, or on disable.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const BUS_NAME = 'org.excelsies.ConjureLauncher';
export const OBJECT_PATH = '/org/excelsies/ConjureLauncher';
const MAX_PROMPT = 200;
const MAX_CANDIDATES = 20000;
const MAX_LINE = 2000;

const IFACE = `<node><interface name="org.excelsies.ConjureLauncher">
<method name="Dmenu">
  <arg type="s" name="prompt" direction="in"/>
  <arg type="as" name="candidates" direction="in"/>
  <arg type="s" name="selection" direction="out"/>
  <arg type="b" name="picked" direction="out"/>
</method>
</interface></node>`;

export class ConjureDBusService {
    /**
     * @param {{dmenu: (prompt: string, lines: string[]) => Promise<{picked: boolean, selection: string}>,
     *          logError: Function}} opts
     */
    constructor({ dmenu, logError }) {
        this._dmenu = dmenu;
        this._logError = logError;
        this._exported = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._ownerId = Gio.bus_own_name(Gio.BusType.SESSION, BUS_NAME, Gio.BusNameOwnerFlags.NONE,
            conn => this._exported.export(conn, OBJECT_PATH), null,
            () => this._logError(`could not own ${BUS_NAME} on the session bus; dmenu mode is unavailable`, null));
    }

    destroy() {
        this._exported.unexport();
        Gio.bus_unown_name(this._ownerId);
    }

    DmenuAsync([prompt, candidates], invocation) {
        if (prompt.length > MAX_PROMPT || candidates.length > MAX_CANDIDATES || candidates.some(c => c.length > MAX_LINE)) {
            invocation.return_dbus_error('org.freedesktop.DBus.Error.InvalidArgs',
                `prompt <= ${MAX_PROMPT} chars, <= ${MAX_CANDIDATES} candidates, each <= ${MAX_LINE} chars`);
            return;
        }
        this._dmenu(prompt, candidates).then(
            ({ picked, selection }) => invocation.return_value(new GLib.Variant('(sb)', [picked ? selection : '', picked])),
            e => invocation.return_dbus_error(`${BUS_NAME}.Error.Closed`, e?.message ?? 'closed'));
    }
}
