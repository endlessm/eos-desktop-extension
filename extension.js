/* exported init */
/*
 * Copyright 2020 Endless, Inc
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
const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();
const WorkspaceMonitor = DesktopExtension.imports.ui.workspaceMonitor;

class Extension {
    constructor() {
        this._workspaceMonitor = new WorkspaceMonitor();
    }

    enable() {
        this._workspaceMonitor.enable();
    }

    disable() {
        this._workspaceMonitor.disable();
    }
}

function init() {
    return new Extension();
}
