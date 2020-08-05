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

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const Overview = imports.ui.overview;
const Utils = DesktopExtension.imports.utils;

function enable() {
    Utils.override(Overview.Overview, '_shadeBackgrounds', function() {});

    // Force unshade when enabled
    for (const background of Main.overview._backgroundGroup) {
        if (!background.content)
            continue;
        background.content.brightness = 1.0;
        background.content.vignette_sharpness = 0.0;
    }
}

function disable() {
    Utils.restore(Overview.Overview);
}
