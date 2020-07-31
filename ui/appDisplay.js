/* exported enable, disable */
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

const AppDisplay = imports.ui.appDisplay;
const IconGrid = imports.ui.iconGrid;
const Main = imports.ui.main;
const ViewSelector = imports.ui.viewSelector;
const Utils = DesktopExtension.imports.utils;

const EOS_LINK_PREFIX = 'eos-link-';

function enable() {
    Utils.override(AppDisplay.AppDisplay, '_loadApps', function() {
        const original = Utils.original(AppDisplay.AppDisplay, '_loadApps');
        const newApps = original.bind(this)();

        const filteredApps = newApps.filter(appIcon => {
            const appId = appIcon.id;
            const [page, position] = this._pageManager.getAppPosition(appId);

            const isLink = appId.startsWith(EOS_LINK_PREFIX);
            const isOnDesktop = page !== -1 && position !== -1;

            return !isLink || isOnDesktop;
        });

        return filteredApps;
    });

    Utils.override(IconGrid.IconGrid, 'animateSpring', function() {
        // Skip the entire spring animation
        this._animationDone();
    });
}

function disable() {
    Utils.restore(AppDisplay.AppDisplay);
    Utils.restore(IconGrid.IconGrid);
}
