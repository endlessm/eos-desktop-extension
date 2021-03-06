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

const { Clutter, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const BackgroundMenu = imports.ui.backgroundMenu;
const Main = imports.ui.main;
const Overview = imports.ui.overview;
const Utils = DesktopExtension.imports.utils;

const EOS_PANEL_EXTENSION_ID = 'eos-panel@endlessm.com'

function addBackgroundMenu() {
    const overviewActor = Main.overview._overview;

    if (overviewActor._backgroundMenu)
        return;

    const oldActionList = overviewActor.get_actions();

    BackgroundMenu.addBackgroundMenu(overviewActor, Main.layoutManager);

    const newActionList = overviewActor.get_actions();
    const intersection = newActionList.filter(a => !oldActionList.includes(a));
    overviewActor._bgMenuClickAction = intersection[0];
}

function removeBackgroundMenu() {
    const overviewActor = Main.overview._overview;

    if (!overviewActor._backgroundMenu)
        return;

    overviewActor._backgroundMenu.destroy();
    overviewActor._backgroundMenu = null;
    overviewActor._backgroundManager = null;

    overviewActor.remove_action(overviewActor._bgMenuClickAction);
    overviewActor._bgMenuClickAction = null;
}

function _findGhostPanel(overviewActor) {
    for (const actor of overviewActor) {
        if ((actor instanceof St.Bin) &&
            (actor.child instanceof Clutter.Clone))
            return actor;
    }

    return null;
}

function moveGhostPanel(position, overviewActor = Main.overview._overview) {
    const ghostPanel = _findGhostPanel(overviewActor);

    if (!ghostPanel)
        return;

    overviewActor.set_child_at_index(ghostPanel, position);
}

function updateGhostPanelPosition(overviewActor = Main.overview._overview) {
    const eosPanelEnabled = Utils.isExtensionEnabled(EOS_PANEL_EXTENSION_ID);
    moveGhostPanel(eosPanelEnabled ? 2 : 0, overviewActor);
}

function _unshadeBackgrounds() {
    // Force unshade when enabled
    for (const background of Main.overview._backgroundGroup) {
        if (!background.content)
            continue;
        background.content.brightness = 1.0;
        background.content.vignette_sharpness = 0.0;
    }
}

let extensionStateChangedId = 0;

function enable() {
    Utils.override(Overview.Overview, '_shadeBackgrounds', _unshadeBackgrounds);
    Utils.override(Overview.Overview, '_unshadeBackgrounds', _unshadeBackgrounds);

    _unshadeBackgrounds();

    addBackgroundMenu();

    extensionStateChangedId =
        Main.extensionManager.connect('extension-state-changed',
            () => updateGhostPanelPosition());

    updateGhostPanelPosition();
}

function disable() {
    Utils.restore(Overview.Overview);

    removeBackgroundMenu();

    Main.extensionManager.disconnect(extensionStateChangedId);
    extensionStateChangedId = 0;

    moveGhostPanel(0);
}
