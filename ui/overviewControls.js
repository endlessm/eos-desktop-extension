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

const { Clutter, GObject, Graphene, Meta, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const Background = imports.ui.background;
const Main = imports.ui.main;
const OverviewControls = imports.ui.overviewControls;

var EndlessControlsManagerLayout = GObject.registerClass(
class EndlessControlsManagerLayout extends OverviewControls.ControlsManagerLayout {
    _init(background, searchEntry, appDisplay, workspacesDisplay,
        workspacesThumbnails, searchController, dash, stateAdjustment) {
        super._init(searchEntry, appDisplay, workspacesDisplay,
            workspacesThumbnails, searchController, dash,
            stateAdjustment);

        this._background = background;
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

function enable() {
    addBackgroundToOverview();
}

function disable() {
    removeBackgroundFromOverview();
}
