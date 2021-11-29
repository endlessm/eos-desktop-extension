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

const { Clutter, Graphene, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const Utils = DesktopExtension.imports.utils;
const Workspace = imports.ui.workspace;

function enable() {
    Utils.override(Workspace.Workspace, '_init', function(metaWorkspace, monitorIndex, overviewAdjustment) {
        const original = Utils.original(Workspace.Workspace, '_init');
        original.bind(this)(metaWorkspace, monitorIndex, overviewAdjustment);

        this.remove_child(this._background);
        delete this._background;
    });
}

function disable() {
    Utils.restore(Workspace.Workspace);
}
