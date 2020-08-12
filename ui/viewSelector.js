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

const Main = imports.ui.main;
const Utils = DesktopExtension.imports.utils;
const ViewSelector = imports.ui.viewSelector;

function enable() {
    Utils.override(ViewSelector.ViewSelector, 'animateToOverview', function() {
        this.show();
        this.reset();
        this._showAppsButton.checked = true;
        this._workspacesDisplay.animateToOverview(this._showAppsButton.checked);
        this._activePage = null;
        this._showPage(this._appsPage);

        if (!this._workspacesDisplay.activeWorkspaceHasMaximizedWindows())
            Main.overview.fadeOutDesktop();
    });

    Utils.override(ViewSelector.ViewSelector, 'animateFromOverview', function() {
        // Make sure workspace page is fully visible to allow
        // workspace.js do the animation of the windows
        this._workspacesPage.opacity = 255;

        this._workspacesDisplay.animateFromOverview(this._activePage != this._workspacesPage);

        this._showAppsButton.checked = true;

        if (!this._workspacesDisplay.activeWorkspaceHasMaximizedWindows())
            Main.overview.fadeInDesktop();
    });


    Utils.override(ViewSelector.ViewSelector, '_showPage', function(page) {
        const original = Utils.original(ViewSelector.ViewSelector, '_showPage');
        original.bind(this)(page);

        const searchEntryParent = Main.overview.searchEntry.get_parent();
        const inWindowsPage = page === this._workspacesPage;

        searchEntryParent.opacity = inWindowsPage ? 0 : 255;
        Shell.util_set_hidden_from_pick(searchEntryParent, inWindowsPage);

    });

    Main.overview.searchEntry.primary_icon.add_style_class_name('primary');
}

function disable() {
    Utils.restore(ViewSelector.ViewSelector);
    Main.overview.searchEntry.primary_icon.remove_style_class_name('primary');
}
