# Mirror the owner's real desktop: the app grid moved to Super+Space and input-source switching
# unbound (Ubuntu/GNOME defaults are <Super>a and <Super>space respectively).
gsettings set org.gnome.shell.keybindings toggle-application-view "['<Super>space']"
gsettings set org.gnome.desktop.wm.keybindings switch-input-source "[]"
gsettings set org.gnome.desktop.wm.keybindings switch-input-source-backward "[]"
# Phase 1 checks start from the full app list; Phase 2 views are covered by views.js.
gsettings --schemadir "$CONJURE_TEST_ROOT/schemas" set org.gnome.shell.extensions.conjure-launcher default-view all
