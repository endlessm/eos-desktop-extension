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

const { Clutter, GObject, Graphene, Meta, Shell, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const Overview = imports.ui.overview;
const Utils = DesktopExtension.imports.utils;

function enable(workspaceMonitor) {
    Utils.override(Overview.Overview, 'hide', function(bypassVisibleWindowCheck = false) {
        if (!bypassVisibleWindowCheck && !workspaceMonitor.hasVisibleWindows)
            return;

        const original = Utils.original(Overview.Overview, 'hide');
        original.bind(this)();
    });

    Utils.override(Overview.Overview, 'runStartupAnimation', async function(callback) {
        const original = Utils.original(Overview.Overview, 'runStartupAnimation');
        original.bind(this)(callback);

        this._startupAnimationDone = true;
    });
}

function disable() {
    Utils.restore(Overview.Overview);
}
