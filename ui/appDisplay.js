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

const { Shell } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const AppDisplay = imports.ui.appDisplay;
const Main = imports.ui.main;
const Utils = DesktopExtension.imports.utils;

function rebuildAppGrid() {
    const { appDisplay } = Main.overview._overview.controls;

    appDisplay._items.clear();
    appDisplay._orderedItems.splice(0, appDisplay._orderedItems.length);

    const grid = appDisplay._grid;
    while (grid.nPages > 0) {
        const items = appDisplay._grid.getItemsAtPage(grid.nPages - 1);
        for (const item of items)
            appDisplay._grid.removeItem(item);
    }

    appDisplay._redisplay();
}

let overviewHidingId = 0;
let overviewHiddenId = 0;
let hidingOverview = false;

function enable() {
    Utils.override(AppDisplay.AppDisplay, 'goToPage',
        function (pageNumber, animate = true) {
            if (hidingOverview)
                return;

            pageNumber = Math.clamp(pageNumber, 0, this._grid.nPages - 1);

            if (this._grid.currentPage === pageNumber &&
                this._displayingDialog &&
                this._currentDialog)
                return;
            if (this._displayingDialog && this._currentDialog)
                this._currentDialog.popdown();

            if (this._grid.currentPage === pageNumber)
                return;

            this._grid.goToPage(pageNumber, animate);
        });

    Utils.override(AppDisplay.AppIcon, 'activate', function (button) {
        const original = Utils.original(AppDisplay.AppIcon, 'activate');
        original.bind(this)(button);

        Main.overview.hide(true);
    });

    Utils.override(AppDisplay.PageManager, 'getAppPosition', function(appId) {
        const original = Utils.original(AppDisplay.PageManager, 'getAppPosition');
        let [page, position] = original.bind(this)(appId);
        if (page != -1 || position != -1)
            return [page, position];

        const appSys = Shell.AppSystem.get_default();
        const app = appSys.lookup_app(appId);
        if (app) {
            const appInfo = app.get_app_info();
            const installedApps = appSys.get_installed();
            const renamedFromList = appInfo.get_string_list("X-Flatpak-RenamedFrom");
            for (const renamedFromId of renamedFromList) {
                // Protect against malformed .desktop files
                if (renamedFromId == appId)
                    continue;

                // We use the installed apps list to check if the renamed app
                // is still installed as AppSystem.lookup_app() may be
                // redirecting to AppSystem.lookup_alias()
                if (installedApps.find(appInfo => appInfo && appInfo.get_id() == renamedFromId))
                    continue;

                // Invoke original impl here to make sure we don't end up in an
                // infinite loop in case both apps refer to each other as
                // renamed from - although the check above should avoid that by
                // ignoring the renamed app if still installed.
                // This also means we go down one level only so if for example AppA
                // is renamed from AppB which is renamed from AppC... we would stop
                // searching at AppB (as the AppSystem.lookup_alias() impl
                // currently does)
                [page, position] = original.bind(this)(renamedFromId);
                if (page != -1 || position != -1)
                    break;
            }
        }

        return [page, position];
    });

    // This relies on the fact that signals are emitted in the
    // order they are connected. Which means, AppDisplay will
    // receive the 'hidden' signal first, then we will receive
    // after, which guarantees that 'hidingOverview' is set to
    // true during the precise time we want
    overviewHidingId =
        Main.overview.connect('hiding', () => {
            hidingOverview = true;
        });
    overviewHiddenId =
        Main.overview.connect('hidden', () => {
            hidingOverview = false;
        });

    rebuildAppGrid();
}

function disable() {
    Utils.restore(AppDisplay.AppDisplay);
    Utils.restore(AppDisplay.AppIcon);
    Utils.restore(AppDisplay.PageManager);

    Main.overview.disconnect(overviewHidingId);
    Main.overview.disconnect(overviewHiddenId);

    rebuildAppGrid();
}
