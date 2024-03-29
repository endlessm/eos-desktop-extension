/* exported init */
/*
 * Copyright 2020 Endless OS Foundation LLC
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

const AppSystem = DesktopExtension.imports.ui.appSystem;
const AppDisplay = DesktopExtension.imports.ui.appDisplay;
const Dash = DesktopExtension.imports.ui.dash;
const Overview = DesktopExtension.imports.ui.overview;
const OverviewControls = DesktopExtension.imports.ui.overviewControls;
const Panel = DesktopExtension.imports.ui.panel;
const Search = DesktopExtension.imports.ui.search;
const Settings = DesktopExtension.imports.settings;
const Workspace = DesktopExtension.imports.ui.workspace;
const WorkspaceMonitor = DesktopExtension.imports.ui.workspaceMonitor;

class Extension {
    constructor() {
        this._enabled = false;
    }

    async _enable() {
        if (this._enabled)
            return;

        this._workspaceMonitor = new WorkspaceMonitor.WorkspaceMonitor();

        AppSystem.enable();
        await Settings.migrate();

        AppDisplay.enable();
        Dash.enable();
        Overview.enable(this._workspaceMonitor);
        OverviewControls.enable();
        Panel.enable();
        Search.enable();
        Workspace.enable();
        this._workspaceMonitor.enable();

        this._enabled = true;
    }

    enable() {
        this._enable().catch((error) => {
            logError(error);
        });
    }

    disable() {
        if (!this._enabled)
            return;

        AppSystem.disable();
        this._workspaceMonitor.disable();
        AppDisplay.disable();
        Dash.disable();
        Overview.disable();
        OverviewControls.disable();
        Panel.disable();
        Search.disable();
        Workspace.disable();

        delete this._workspaceMonitor;

        this._enabled = false;
    }
}

function init() {
    return new Extension();
}
