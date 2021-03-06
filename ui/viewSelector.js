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

const { Clutter, Shell, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;
const Utils = DesktopExtension.imports.utils;
const ViewSelector = imports.ui.viewSelector;

function addWorkspacesPageClickAction() {
    if (Main.overview._workspacePageClickActionData)
        return;

    const overviewActor = Main.overview._overview;
    const { viewSelector } = Main.overview;

    const clickAction = new Clutter.ClickAction();
    clickAction.connect('clicked', () => {
        if (clickAction.get_button() == 1) {
            viewSelector.showApps();

            // This is the background menu action we add in
            // layout.js
            if (overviewActor._bgMenuClickAction)
                overviewActor._bgMenuClickAction.release();
        }
    });
    Main.overview._overview.add_action(clickAction);

    const pageChangedId = viewSelector.connect('page-changed', () => {
        const activePage = viewSelector.getActivePage();
        const inWindowsPage = activePage === ViewSelector.ViewPage.WINDOWS;

        clickAction.enabled = inWindowsPage;
    });

    Main.overview._workspacePageClickActionData = {
        clickAction,
        pageChangedId,
    };
}

function removeWorkspacesPageClickAction() {
    if (!Main.overview._workspacePageClickActionData)
        return;

    const { viewSelector } = Main.overview;
    const data = Main.overview._workspacePageClickActionData;

    Main.overview._overview.remove_action(data.clickAction);
    viewSelector.disconnect(data.pageChangedId);

    delete Main.overview._workspacePageClickActionData;
}

function connectSearchEntryClick() {
    const { searchEntry } = Main.overview;
    if (searchEntry._clickHandler)
        return;

    searchEntry._clickHandler = searchEntry.connect_after('secondary-icon-clicked', () => {
        const overviewActor = Main.overview._overview;
        if (overviewActor._bgMenuClickAction)
            overviewActor._bgMenuClickAction.release();
    });
}

function disconnectSearchEntryClick() {
    const { searchEntry } = Main.overview;
    if (!searchEntry._clickHandler)
        return;
    searchEntry.disconnect(searchEntry._clickHandler);

    delete searchEntry._clickHandler;
}

function reconnectToStageKeyPress() {
    const { viewSelector } = Main.overview;

    if (viewSelector._stageKeyPressId > 0) {
        global.stage.disconnect(viewSelector._stageKeyPressId);
        viewSelector._stageKeyPressId = 0;
    }

    if (Main.overview.visible) {
        viewSelector._stageKeyPressId =
            global.stage.connect('key-press-event',
                viewSelector._onStageKeyPress.bind(viewSelector));
    }
}

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

        if (!this._workspacesDisplay.activeWorkspaceHasMaximizedWindows())
            Main.overview.fadeInDesktop();

        const id = Main.overview.connect('hidden', () => {
            this._showAppsButton.checked = true;
            Main.overview.disconnect(id);
        })
    });


    Utils.override(ViewSelector.ViewSelector, '_showPage', function(page) {
        const original = Utils.original(ViewSelector.ViewSelector, '_showPage');
        original.bind(this)(page);

        const searchEntryParent = Main.overview.searchEntry.get_parent();
        const inWindowsPage = page === this._workspacesPage;

        searchEntryParent.opacity = inWindowsPage ? 0 : 255;
        Shell.util_set_hidden_from_pick(searchEntryParent, inWindowsPage);
    });

    Utils.override(ViewSelector.ViewSelector, '_onStageKeyPress',
        function(actor, event) {
            // Ignore events while anything but the overview has
            // pushed a modal (system modals, looking glass, ...)
            if (Main.modalCount > 1)
                return Clutter.EVENT_PROPAGATE;

            const symbol = event.get_key_symbol();

            if (symbol === Clutter.KEY_Escape) {
                if (this._searchActive)
                    this.reset();
                else if (this._activePage == this._workspacesPage)
                    Main.overview.hide();
                return Clutter.EVENT_STOP;
            } else if (this._shouldTriggerSearch(symbol)) {
                this.startSearch(event);
            } else if (!this._searchActive && !global.stage.key_focus) {
                if (symbol === Clutter.KEY_Tab || symbol === Clutter.KEY_Down) {
                    this._activePage.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
                    return Clutter.EVENT_STOP;
                } else if (symbol === Clutter.KEY_ISO_Left_Tab) {
                    this._activePage.navigate_focus(null, St.DirectionType.TAB_BACKWARD, false);
                    return Clutter.EVENT_STOP;
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });

    Main.overview.searchEntry.primary_icon.add_style_class_name('primary');

    addWorkspacesPageClickAction();
    reconnectToStageKeyPress();
    connectSearchEntryClick();
}

function disable() {
    Utils.restore(ViewSelector.ViewSelector);
    Main.overview.searchEntry.primary_icon.remove_style_class_name('primary');
    removeWorkspacesPageClickAction();
    reconnectToStageKeyPress();
    disconnectSearchEntryClick();
}
