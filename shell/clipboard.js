// Copy text to the clipboard (Calculator and Emoji results).
import St from 'gi://St';

export function copyToClipboard(text) {
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
}
