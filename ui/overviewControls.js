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

const { Clutter, GObject, Shell } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const Config = imports.misc.config;
const Layout = imports.ui.layout;
const Main = imports.ui.main;
const OverviewControls = imports.ui.overviewControls;
const ShellUtils = imports.misc.util;
const Utils = DesktopExtension.imports.utils;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;

const SMALL_WORKSPACE_RATIO = 0.55;
const DASH_MAX_HEIGHT_RATIO = 0.15;

var EndlessControlsManagerLayout = GObject.registerClass(
class EndlessControlsManagerLayout extends OverviewControls.ControlsManagerLayout {
    _computeWorkspacesBoxForState(state, box, searchHeight, dashHeight, thumbnailsHeight) {
        let workAreaBox = this._workAreaBox;
        let workspaceBox = box.copy();

        const [width, height] = workspaceBox.get_size();
        const { y1: startY } = workAreaBox;
        const { spacing } = this;
        const { expandFraction } = this._workspacesThumbnails;
        const offLimitsY = 0 - startY - height * SMALL_WORKSPACE_RATIO;

        switch (state) {
        case OverviewControls.ControlsState.HIDDEN:
            workspaceBox.set_origin(...workAreaBox.get_origin());
            workspaceBox.set_size(...workAreaBox.get_size());
            break;
        case OverviewControls.ControlsState.WINDOW_PICKER:
            // We are using searchHeight here because it is related to the
            // size of this._workspacesThumbnails in vfunc_allocate.
            workspaceBox.set_origin(0,
                startY + Math.max(searchHeight + spacing,
                    thumbnailsHeight + spacing * expandFraction));
            workspaceBox.set_size(width,
                height -
                dashHeight - spacing -
                Math.max(searchHeight + spacing,
                    thumbnailsHeight + spacing * expandFraction));
            break;
        case OverviewControls.ControlsState.APP_GRID:
            workspaceBox.set_origin(0, offLimitsY);
            workspaceBox.set_size(
                width,
                Math.round(height * SMALL_WORKSPACE_RATIO));
            break;
        }

        return workspaceBox;
    }

    _getAppDisplayBoxForState(state, box, searchHeight, dashHeight) {
        const appDisplayBox = new Clutter.ActorBox();
        let workAreaBox = this._workAreaBox;
        let [width, height] = box.get_size();
        let [startX, startY] = workAreaBox.get_origin();
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

    vfunc_allocate(_container, _box) {
        const childBox = new Clutter.ActorBox();

        const { spacing } = this;

        const monitor = Main.layoutManager.findMonitorForActor(this._container);
        const workArea = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
        const startX = workArea.x - monitor.x;
        const startY = workArea.y - monitor.y;
        const workAreaBox = new Clutter.ActorBox();
        workAreaBox.set_origin(startX, startY);
        workAreaBox.set_size(workArea.width, workArea.height);
        const [width, height] = workAreaBox.get_size();
        let availableHeight = height;
        const availableWidth = width;

        // Search entry
        let [searchHeight] = this._searchEntry.get_preferred_height(width);
        childBox.set_origin(startX, startY);
        childBox.set_size(width, searchHeight);
        this._searchEntry.allocate(childBox);

        // Dash
        const maxDashHeight = Math.round(workAreaBox.get_height() * DASH_MAX_HEIGHT_RATIO);
        this._dash.setMaxSize(width, maxDashHeight);

        let [, dashHeight] = this._dash.get_preferred_height(width);
        dashHeight = Math.min(dashHeight, maxDashHeight);
        childBox.set_origin(startX, startY + height - dashHeight);
        childBox.set_size(width, dashHeight);
        this._dash.allocate(childBox);

        availableHeight -= dashHeight + spacing;

        // Workspace Thumbnails
        let thumbnailsHeight = 0;
        if (this._workspacesThumbnails.visible) {
            const { expandFraction } = this._workspacesThumbnails;
            [thumbnailsHeight] =
                this._workspacesThumbnails.get_preferred_height(width);
            thumbnailsHeight = Math.min(
                thumbnailsHeight * expandFraction,
                height * WorkspaceThumbnail.MAX_THUMBNAIL_SCALE);
            const yOffset = Math.abs(thumbnailsHeight - spacing - searchHeight) / 2;
            childBox.set_origin(startX, startY + yOffset);
            childBox.set_size(width, Math.max(thumbnailsHeight - spacing, searchHeight));
            this._workspacesThumbnails.allocate(childBox);
        }

        availableHeight -= Math.max(searchHeight, thumbnailsHeight) + spacing;

        // Workspaces
        let params = [workAreaBox, searchHeight, dashHeight, thumbnailsHeight];
        const transitionParams = this._stateAdjustment.getStateTransitionParams();

        // Update cached boxes
        for (const state of Object.values(OverviewControls.ControlsState)) {
            this._cachedWorkspaceBoxes.set(
                state, this._computeWorkspacesBoxForState(state, ...params));
        }

        let workspacesBox;
        if (!transitionParams.transitioning) {
            workspacesBox = this._cachedWorkspaceBoxes.get(transitionParams.currentState);
        } else {
            const initialBox = this._cachedWorkspaceBoxes.get(transitionParams.initialState);
            const finalBox = this._cachedWorkspaceBoxes.get(transitionParams.finalState);
            workspacesBox = initialBox.interpolate(finalBox, transitionParams.progress);
        }

        this._workspacesDisplay.allocate(workspacesBox);

        // AppDisplay
        if (this._appDisplay.visible) {
            const workspaceAppGridBox =
                this._cachedWorkspaceBoxes.get(OverviewControls.ControlsState.APP_GRID);

            params = [workAreaBox, searchHeight, dashHeight, workspaceAppGridBox];
            let appDisplayBox;
            if (!transitionParams.transitioning) {
                appDisplayBox =
                    this._getAppDisplayBoxForState(transitionParams.currentState, ...params);
            } else {
                const initialBox =
                    this._getAppDisplayBoxForState(transitionParams.initialState, ...params);
                const finalBox =
                    this._getAppDisplayBoxForState(transitionParams.finalState, ...params);

                appDisplayBox = initialBox.interpolate(finalBox, transitionParams.progress);
            }

            this._appDisplay.allocate(appDisplayBox);
        }

        // Search
        childBox.set_origin(startX, startY + searchHeight + spacing);
        childBox.set_size(availableWidth, availableHeight);

        this._searchController.allocate(childBox);

        this._runPostAllocation();
    }
});

function overrideOverviewLayoutManager() {
    const { controls } = Main.overview._overview;

    controls._originalLayoutManager = controls.layoutManager;
    controls.layoutManager = new EndlessControlsManagerLayout(
        controls._searchEntryBin,
        controls._appDisplay,
        controls._workspacesDisplay,
        controls._thumbnailsBox,
        controls._searchController,
        controls.dash,
        controls._stateAdjustment);
}

function restoreOverviewLayoutManager() {
    const { controls } = Main.overview._overview;

    controls.layoutManager = controls._originalLayoutManager;
    delete controls._originalLayoutManager;
}

function getAppDisplayOpacityForState(state) {
    switch (state) {
    case OverviewControls.ControlsState.HIDDEN:
    case OverviewControls.ControlsState.WINDOW_PICKER:
        return 0;
    case OverviewControls.ControlsState.APP_GRID:
        return 255;
    }
}

function getSearchEntryOpacityForState(state) {
    switch (state) {
    case OverviewControls.ControlsState.HIDDEN:
    case OverviewControls.ControlsState.WINDOW_PICKER:
        return 0;
    case OverviewControls.ControlsState.APP_GRID:
        return 255;
    }
}

function getWorkspaceThumbnailOpacityForState(state) {
    switch (state) {
    case OverviewControls.ControlsState.HIDDEN:
        return 0;
    case OverviewControls.ControlsState.WINDOW_PICKER:
        return 255;
    case OverviewControls.ControlsState.APP_GRID:
        return 0;
    }
}

function setDashAboveWorkspaces(above) {
    const { controls } = Main.overview._overview;

    if (above)
        controls.set_child_above_sibling(controls.dash, controls._workspacesDisplay);
    else
        controls.set_child_below_sibling(controls.dash, controls._searchController);
}

function restoreAppDisplay() {
    let { controls } = Main.overview._overview;

    /* In vanilla Shell, _appDisplay.opacity depends only on whether search is
     * active, while this extension also uses it to fade the grid in and out
     * when you enter and leave the APP_GRID state. Restore it to the value it
     * would have had in vanilla Shell.
     */
    let { searchActive } = controls._searchController;
    controls._appDisplay.opacity = searchActive ? 0 : 255;
}

function enable() {
    Utils.override(OverviewControls.ControlsManager, function _updateAppDisplayVisibility(params) {
        if (!params)
            params = this._stateAdjustment.getStateTransitionParams();

        const { searchActive } = this._searchController;
        const { currentState, initialState, finalState, progress } = params;
        const state = Math.max(initialState, finalState);

        if (!searchActive) {
            this._appDisplay.visible =
                state > OverviewControls.ControlsState.WINDOW_PICKER;
            this._appDisplay.opacity = ShellUtils.lerp(
                getAppDisplayOpacityForState(initialState),
                getAppDisplayOpacityForState(finalState),
                progress);
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

        this._thumbnailsBox.opacity = ShellUtils.lerp(
            getWorkspaceThumbnailOpacityForState(initialState),
            getWorkspaceThumbnailOpacityForState(finalState),
            progress);
        this._thumbnailsBox.visible = !searchActive;

        // Update the vignette effect
        if (Main.overview._backgroundGroup) {
            for (const background of Main.overview._backgroundGroup) {
                const { content } = background;

                const getVignetteForState = state => {
                    switch (state) {
                    case OverviewControls.ControlsState.HIDDEN:
                        return [1.0, 0.0];
                    case OverviewControls.ControlsState.WINDOW_PICKER:
                        return [1.0, 0.5];
                    case OverviewControls.ControlsState.APP_GRID:
                        return [1.0, 0.0];
                    }
                };

                const initial = getVignetteForState(initialState);
                const final = getVignetteForState(finalState);

                content.set_vignette(true, ...[
                    ShellUtils.lerp(initial[0], final[0], progress),
                    ShellUtils.lerp(initial[1], final[1], progress),
                ]);
            }
        }

    });

    Utils.override(OverviewControls.ControlsManager, async function runStartupAnimation() {
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
        return new Promise(resolve => {
            this.dash.ease({
                translation_y: 0,
                delay: STARTUP_ANIMATION_TIME,
                duration: STARTUP_ANIMATION_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onStopped: (isFinished) => {
                    if (!isFinished)
                        this.dash.translation_y = 0;

                    resolve();
                }
            });
        });
    });

    overrideOverviewLayoutManager();
}

function disable() {
    Utils.restore(OverviewControls.ControlsManager);

    restoreOverviewLayoutManager();
    restoreAppDisplay();
}
