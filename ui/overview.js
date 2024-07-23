/* exported enable, disable */
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

const { Meta } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const Background = imports.ui.background;
const Main = imports.ui.main;
const Overview = imports.ui.overview;
const Utils = DesktopExtension.imports.utils;

function updateBackgrounds() {
    for (const bgManager of Main.overview._bgManagers)
        bgManager.destroy();

    Main.overview._bgManagers = [];

    for (const i in Main.layoutManager.monitors) {
        const bgManager = new Background.BackgroundManager({
            container: Main.overview._backgroundGroup,
            monitorIndex: i,
        });
        Main.overview._bgManagers.push(bgManager);
    }
}

function addBackgroundToOverview() {
    Main.overview._backgroundGroup = new Meta.BackgroundGroup();
    Main.layoutManager.overviewGroup.insert_child_below(
        Main.overview._backgroundGroup, null);
    Main.overview._monitorsChangedId = Main.layoutManager.connect(
        'monitors-changed',
        () => updateBackgrounds());

    Main.overview._bgManagers = [];

    updateBackgrounds();
}

function removeBackgroundFromOverview() {
    for (const bgManager of Main.overview._bgManagers)
        bgManager.destroy();
    delete Main.overview._bgManagers;

    Main.layoutManager.overviewGroup.remove_child(Main.overview._backgroundGroup);
    delete Main.overview._backgroundGroup;

    Main.layoutManager.disconnect(Main.overview._monitorsChangedId);
    delete Main.overview._monitorsChangedId;
}

function enable(workspaceMonitor) {
    Utils.override(Overview.Overview, function hide(bypassVisibleWindowCheck = false) {
        if (!bypassVisibleWindowCheck &&
            !workspaceMonitor.hasVisibleWindows &&
            this._startupAnimationDone) {
            Main.overview.dash.showAppsButton.checked = true;
            return;
        }

        const original = Utils.original(Overview.Overview, 'hide');
        original.call(this);
    });

    Utils.override(Overview.Overview, function _eosHideOrShowApps() {
        if (workspaceMonitor.hasVisibleWindows)
            this.hide();
        else
            Main.overview.dash.showAppsButton.checked = true;
    });

    Utils.override(Overview.Overview, function _eosHideOrShowOverview() {
        if (workspaceMonitor.hasVisibleWindows)
            this.hide();
        else
            Main.overview.dash.showAppsButton.checked = false;
    });

    Utils.override(Overview.Overview, async function runStartupAnimation() {
        const original = Utils.original(Overview.Overview, 'runStartupAnimation');
        await original.call(this);
        this._startupAnimationDone = true;
    });

    addBackgroundToOverview();
}

function disable() {
    Utils.restore(Overview.Overview);
    removeBackgroundFromOverview();
}
