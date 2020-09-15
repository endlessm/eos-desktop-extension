/* exported enable, disable */

/*
 *  Copyright 2020 Endless OS Foundation LLC
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, see <http://www.gnu.org/licenses/>.
 */

const { Shell } = imports.gi;

const Main = imports.ui.main;

function _setSwitcherKeybindingsMode(mode) {
    const keybindings = [
        'cycle-group',
        'cycle-group-backward',
        'cycle-windows',
        'cycle-windows-backward',
        'switch-applications',
        'switch-applications-backward',
        'switch-group',
        'switch-group-backward',
        'switch-windows',
        'switch-windows-backward',
    ];

    for (const keybinding of keybindings) {
        Main.wm.removeKeybinding(keybinding);
        Main.wm.setCustomKeybindingHandler(keybinding,
            mode, Main.wm._startSwitcher.bind(Main.wm));
    }
}

function enable() {
    _setSwitcherKeybindingsMode(Shell.ActionMode.NORMAL |
                                Shell.ActionMode.OVERVIEW);
}

function disable() {
    _setSwitcherKeybindingsMode(Shell.ActionMode.NORMAL);
}
