// Invariant 2 (docs/design-brief.md section 4): the modal grab is always released. Every close
// path calls close(); it is idempotent and flips the open flag synchronously, before any
// animation, so a toggle pressed mid-close sees the panel as closed (section 7).

export class PanelLifecycle {
    /**
     * @param {{push: () => unknown, pop: (grab: unknown) => void,
     *          onOpen?: () => void, onClose?: (reason: string) => void,
     *          logError?: (msg: string, err: unknown) => void}} hooks
     *   push() takes the modal grab and returns a handle; pop(handle) releases it.
     */
    constructor(hooks) {
        this._hooks = hooks;
        this._grab = null;
        this._open = false;
    }

    get isOpen() {
        return this._open;
    }

    /** @returns {boolean} true if the panel is now open. A push() that throws leaves it closed. */
    open() {
        if (this._open)
            return true;
        let grab;
        try {
            grab = this._hooks.push();
        } catch (e) {
            this._hooks.logError?.('could not take the modal grab', e);
            return false;
        }
        this._grab = grab;
        this._open = true;
        try {
            this._hooks.onOpen?.();
        } catch (e) {
            this._hooks.logError?.('onOpen failed; closing', e);
            this.close('open-failed');
            return false;
        }
        return true;
    }

    /** Safe to call any number of times, from any path. */
    close(reason) {
        if (!this._open)
            return;
        this._open = false;
        const grab = this._grab;
        this._grab = null;
        try {
            this._hooks.pop(grab);
        } catch (e) {
            this._hooks.logError?.(`releasing the modal grab failed (close reason: ${reason})`, e);
        }
        try {
            this._hooks.onClose?.(reason);
        } catch (e) {
            this._hooks.logError?.(`onClose failed (close reason: ${reason})`, e);
        }
    }

    toggle() {
        if (this._open) {
            this.close('toggle');
            return false;
        }
        return this.open();
    }
}
