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
const OverviewControls = imports.ui.overviewControls;
const ShellUtils = imports.misc.util;
const Utils = DesktopExtension.imports.utils;
const Workspace = imports.ui.workspace;

function getBorderRadiusForState(state) {
    switch (state) {
    case OverviewControls.ControlsState.HIDDEN:
        return 0;
    case OverviewControls.ControlsState.WINDOW_PICKER:
        return 16;
    case OverviewControls.ControlsState.APP_GRID:
        return 0;
    }

    return 0;
}

function getOpacityForState(state) {
    switch (state) {
    case OverviewControls.ControlsState.HIDDEN:
        return 0.0;
    case OverviewControls.ControlsState.WINDOW_PICKER:
        return 0.1;
    case OverviewControls.ControlsState.APP_GRID:
        return 0.0;
    }

    return 0.0;
}

function getBoxShadowOpacityForState(state) {
    switch (state) {
    case OverviewControls.ControlsState.HIDDEN:
        return 0.0;
    case OverviewControls.ControlsState.WINDOW_PICKER:
        return 0.5;
    case OverviewControls.ControlsState.APP_GRID:
        return 0.0;
    }

    return 0.0;
}

function enable() {
    Utils.override(Workspace.Workspace, '_init', function(metaWorkspace, monitorIndex, overviewAdjustment) {
        const original = Utils.original(Workspace.Workspace, '_init');
        original.bind(this)(metaWorkspace, monitorIndex, overviewAdjustment);

        this.remove_child(this._background);
        delete this._background;

        this._overviewStateChangedId = overviewAdjustment.connect('notify::value', () => {
            const { currentState, initialState, finalState, progress } =
                overviewAdjustment.getStateTransitionParams();

            const opacity = ShellUtils.lerp(
                getOpacityForState(initialState),
                getOpacityForState(finalState),
                progress);
            const radius = ShellUtils.lerp(
                getBorderRadiusForState(initialState),
                getBorderRadiusForState(finalState),
                progress);
            const boxShadowOpacity = ShellUtils.lerp(
                getBoxShadowOpacityForState(initialState),
                getBoxShadowOpacityForState(finalState),
                progress);

            this.style = `
                background-color: rgba(255,255,255,${opacity});
                border-radius: ${radius}px;
                box-shadow: 0px 4px 30px rgba(0, 0, 0, ${boxShadowOpacity});
            `;
        });
    });

    Utils.override(Workspace.Workspace, '_onDestroy', function() {
        if (this._overviewStateChangedId) {
            this._overviewAdjustment.disconnect(this._overviewStateChangedId);
            delete this._overviewStateChangedId;
        }

        const original = Utils.original(Workspace.Workspace, '_onDestroy');
        original.bind(this)();
    });
}

function disable() {
    Utils.restore(Workspace.Workspace);
}
