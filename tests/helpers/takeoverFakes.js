// In-memory adapters matching lib/takeover.js's contract. GSettings set_strv/set_boolean return
// false for a non-writable key and leave the value unchanged; the fakes do the same. Every
// successful write is recorded in state.writes so tests can check ordering and absence.

export function makeFakes(initial, { savedWritable = true, flagWritable = true } = {}) {
    const state = { gnome: [...initial], saved: [], hasSaved: false, gnomeWritable: true, writes: [] };
    const gnome = {
        get: () => [...state.gnome],
        set: v => {
            if (!state.gnomeWritable)
                return false;
            state.gnome = [...v];
            state.writes.push('gnome');
            return true;
        },
    };
    const saved = {
        getSaved: () => [...state.saved],
        setSaved: v => {
            if (!savedWritable)
                return false;
            state.saved = [...v];
            state.writes.push('saved');
            return true;
        },
        hasSaved: () => state.hasSaved,
        setHasSaved: b => {
            if (!flagWritable)
                return false;
            state.hasSaved = b;
            state.writes.push('flag');
            return true;
        },
    };
    return { gnome, saved, state };
}
