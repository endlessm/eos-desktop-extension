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

const AppDisplay = DesktopExtension.imports.ui.appDisplay;
const Dash = DesktopExtension.imports.ui.dash;
const Layout = DesktopExtension.imports.ui.layout;
const Overview = DesktopExtension.imports.ui.overview;
const Settings = DesktopExtension.imports.settings;
const ViewSelector = DesktopExtension.imports.ui.viewSelector;
const Search = DesktopExtension.imports.ui.search;
const WorkspaceMonitor = DesktopExtension.imports.ui.workspaceMonitor;

class Extension {
    constructor() {
        this._workspaceMonitor = new WorkspaceMonitor.WorkspaceMonitor();
        this._enabled = false;
    }

    async enable() {
        if (this._enabled)
            return;

        await Settings.migrate();

        this._workspaceMonitor.enable();
        AppDisplay.enable();
        Dash.enable();
        Layout.enable();
        ViewSelector.enable();
        Overview.enable();
        Search.enable();

        this._enabled = true;
    }

    disable() {
        if (!this._enabled)
            return;

        this._workspaceMonitor.disable();
        AppDisplay.disable();
        Dash.disable();
        Layout.disable();
        ViewSelector.disable();
        Overview.disable();
        Search.disable();

        this._enabled = false;
    }
}

function init() {
    return new Extension();
}
