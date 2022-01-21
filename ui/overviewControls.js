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

const Background = imports.ui.background;
const Layout = imports.ui.layout;
const LayoutOverrides = DesktopExtension.imports.ui.layout;
const Main = imports.ui.main;
const OverviewControls = imports.ui.overviewControls;
const ShellUtils = imports.misc.util;
const Utils = DesktopExtension.imports.utils;

const SMALL_WORKSPACE_RATIO = 0.55;

var EndlessControlsManagerLayout = GObject.registerClass(
class EndlessControlsManagerLayout extends OverviewControls.ControlsManagerLayout {
    _init(background, searchEntry, appDisplay, workspacesDisplay,
        workspacesThumbnails, searchController, dash, stateAdjustment) {
        super._init(searchEntry, appDisplay, workspacesDisplay,
            workspacesThumbnails, searchController, dash,
            stateAdjustment);

        this._background = background;
    }

    _computeWorkspacesBoxForState(state, workAreaBox, searchHeight, dashHeight, thumbnailsHeight) {
        const workspaceBox = workAreaBox.copy();
        const [startX, startY] = workAreaBox.get_origin();
        const [width, height] = workspaceBox.get_size();
        const { spacing } = this;
        const { expandFraction } = this._workspacesThumbnails;
        const offLimitsY = 0 - startY - height * SMALL_WORKSPACE_RATIO;

        switch (state) {
        case OverviewControls.ControlsState.HIDDEN:
            break;
        case OverviewControls.ControlsState.WINDOW_PICKER:
            workspaceBox.set_origin(startX,
                startY + searchHeight + spacing +
                thumbnailsHeight + spacing * expandFraction);
            workspaceBox.set_size(width,
                height -
                dashHeight - spacing -
                searchHeight - spacing -
                thumbnailsHeight - spacing * expandFraction);
            break;
        case OverviewControls.ControlsState.APP_GRID:
            workspaceBox.set_origin(startX, offLimitsY);
            workspaceBox.set_size(
                width,
                Math.round(height * SMALL_WORKSPACE_RATIO));
            break;
        }

        return workspaceBox;
    }

    _getAppDisplayBoxForState(state, workAreaBox, searchHeight, dashHeight) {
        const [startX, startY] = workAreaBox.get_origin();
        const [width, height] = workAreaBox.get_size();
        const appDisplayBox = new Clutter.ActorBox();
        const { spacing } = this;

        switch (state) {
        case OverviewControls.ControlsState.HIDDEN:
        case OverviewControls.ControlsState.WINDOW_PICKER:
        case OverviewControls.ControlsState.APP_GRID:
            appDisplayBox.set_origin(startX,
                startY + searchHeight + spacing);
            break;
        }

        appDisplayBox.set_size(width,
            height -
            searchHeight - spacing -
            dashHeight);

        return appDisplayBox;
    }

    vfunc_allocate(container, box) {
        this._background.allocate(box);
        super.vfunc_allocate(container, box);
    }
});

function addBackgroundToOverview() {
    const { controls } = Main.overview._overview;

    controls._backgroundGroup = new Meta.BackgroundGroup({
        layout_manager: new Clutter.BinLayout(),
        x_expand: true,
        y_expand: true,
    });
    controls.insert_child_below(controls._backgroundGroup,
        controls._searchEntryBin);

    controls._bgManager = new Background.BackgroundManager({
        container: controls._backgroundGroup,
        monitorIndex: Main.layoutManager.primaryIndex,
        controlPosition: false,
        useContentSize: false,
    });

    controls._originalLayoutManager = controls.layoutManager;
    controls.layoutManager = new EndlessControlsManagerLayout(
        controls._backgroundGroup,
        controls._searchEntryBin,
        controls._appDisplay,
        controls._workspacesDisplay,
        controls._thumbnailsBox,
        controls._searchController,
        controls.dash,
        controls._stateAdjustment);
}

function removeBackgroundFromOverview() {
    const { controls } = Main.overview._overview;

    controls._bgManager.destroy();

    controls._backgroundGroup.destroy();
    delete controls._backgroundGroup;

    controls.layoutManager = controls._originalLayoutManager;
    delete controls._originalLayoutManager;
}

function getAppDisplayOpacityForState(state) {
    switch(state) {
    case OverviewControls.ControlsState.HIDDEN:
        return LayoutOverrides.EOS_INACTIVE_GRID_OPACITY;
    case OverviewControls.ControlsState.WINDOW_PICKER:
        return 0;
    case OverviewControls.ControlsState.APP_GRID:
        return 255;
    }
}

function getSearchEntryOpacityForState(state) {
    switch(state) {
    case OverviewControls.ControlsState.HIDDEN:
        return LayoutOverrides.EOS_INACTIVE_GRID_OPACITY;
    case OverviewControls.ControlsState.WINDOW_PICKER:
        return 0;
    case OverviewControls.ControlsState.APP_GRID:
        return 255;
    }
}

function setDashAboveWorkspaces(above) {
    const { controls } = Main.overview._overview;

    if (above)
        controls.set_child_above_sibling(controls.dash, controls._workspacesDisplay);
    else
        controls.set_child_below_sibling(controls.dash, controls._searchController);
}

function enable() {
    Utils.override(OverviewControls.ControlsManager, '_updateAppDisplayVisibility', function(params) {
        if (!params)
            params = this._stateAdjustment.getStateTransitionParams();

        const { searchActive } = this._searchController;
        const { currentState, initialState, finalState, progress } = params;

        if (!searchActive) {
            this._appDisplay.visible = true;
            this._appDisplay.opacity = ShellUtils.lerp(
                getAppDisplayOpacityForState(initialState),
                getAppDisplayOpacityForState(finalState),
                progress);

            Shell.util_set_hidden_from_pick(
                this._appDisplay,
                currentState <= OverviewControls.ControlsState.WINDOW_PICKER);
        }

        setDashAboveWorkspaces(currentState < OverviewControls.ControlsState.WINDOW_PICKER);

        // Update search entry visibility
        this._searchEntryBin.opacity = searchActive ? 255 : ShellUtils.lerp(
                getSearchEntryOpacityForState(initialState),
                getSearchEntryOpacityForState(finalState),
            progress);
        Shell.util_set_hidden_from_pick(
            this._searchEntryBin,
            this._searchEntryBin.opacity < 195);

        // Update the vignette effect
        if (this._backgroundGroup) {
            for (const background of this._backgroundGroup) {
                const { content } = background;

                const getVignetteForState = state => {
                    switch (state) {
                    case OverviewControls.ControlsState.HIDDEN:
                         return [1.0, 0.0];
                    case OverviewControls.ControlsState.WINDOW_PICKER:
                    case OverviewControls.ControlsState.APP_GRID:
                        return [0.7, 0.5];
                    }
                }

                const initial = getVignetteForState(initialState);
                const final = getVignetteForState(finalState);

                content.set_vignette(true, ...[
                    ShellUtils.lerp(initial[0], final[0], progress),
                    ShellUtils.lerp(initial[1], final[1], progress),
                ]);
            }
        }
    });

    Utils.override(OverviewControls.ControlsManager, 'runStartupAnimation', async function(callback) {
        this._ignoreShowAppsButtonToggle = true;

        this._searchController.prepareToEnterOverview();
        this._workspacesDisplay.prepareToEnterOverview();

        this.dash.showAppsButton.checked = true;
        this._stateAdjustment.value = OverviewControls.ControlsState.APP_GRID;

        this._ignoreShowAppsButtonToggle = false;

        // Set the opacity here to avoid a 1-frame flicker
        this.opacity = 0;

        // We can't run the animation before the first allocation happens
        await this.layoutManager.ensureAllocation();

        const { STARTUP_ANIMATION_TIME } = Layout;

        // Opacity
        this.ease({
            opacity: 255,
            duration: STARTUP_ANIMATION_TIME,
            mode: Clutter.AnimationMode.LINEAR,
        });

        // Search bar falls from the ceiling
        const { primaryMonitor } = Main.layoutManager;
        const [, y] = this._searchEntryBin.get_transformed_position();
        const yOffset = y - primaryMonitor.y;

        this._searchEntryBin.translation_y = -(yOffset + this._searchEntryBin.height);
        this._searchEntryBin.ease({
            translation_y: 0,
            duration: STARTUP_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        // The Dash rises from the bottom. This is the last animation to finish,
        // so run the callback there.
        this.dash.translation_y = this.dash.height;
        this.dash.ease({
            translation_y: 0,
            delay: STARTUP_ANIMATION_TIME,
            duration: STARTUP_ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => callback(),
        });
    });

    addBackgroundToOverview();
}

function disable() {
    Utils.restore(OverviewControls.ControlsManager);
    removeBackgroundFromOverview();
}
