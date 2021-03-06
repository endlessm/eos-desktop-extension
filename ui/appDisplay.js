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

const { Clutter, GLib, Meta, Shell, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const AppDisplay = imports.ui.appDisplay;
const IconGrid = imports.ui.iconGrid;
const Main = imports.ui.main;
const PageIndicators = imports.ui.pageIndicators;
const Utils = DesktopExtension.imports.utils;

function _disconnectAdjustment(appDisplay) {
    if (!appDisplay._adjId || appDisplay._adjId === 0)
        return;

    appDisplay._adjustment.disconnect(appDisplay._adjId);
    appDisplay._adjId = 0;
}

function _createPageIndicators(appDisplay, orientation) {
    const vertical = orientation === Clutter.Orientation.VERTICAL;
    let pageIndicators;

    if (vertical)
        pageIndicators = new PageIndicators.AnimatedPageIndicators();
    else
        pageIndicators = new PageIndicators.PageIndicators(orientation);

    pageIndicators.y_expand = vertical;
    pageIndicators.connect('page-activated',
        (indicators, pageIndex) => {
            appDisplay.goToPage(pageIndex);
        });
    pageIndicators.connect('scroll-event', (actor, event) => {
        appDisplay._scrollView.event(event, false);
    });

    return pageIndicators;
}

function changeAppGridOrientation(orientation, appDisplay = null) {
    if (!appDisplay)
        appDisplay = Main.overview.viewSelector.appDisplay;

    if (appDisplay._orientation === orientation)
        return;

    const scrollView = appDisplay._scrollView;
    const scrollViewParent = scrollView.get_parent();

    // Remove old actors
    _disconnectAdjustment(appDisplay);
    appDisplay._pageIndicators.destroy();
    scrollViewParent.remove_child(scrollView);

    // Update the adjustment
    const vertical = orientation === Clutter.Orientation.VERTICAL;
    const scroll = vertical ?  scrollView.vscroll : scrollView.hscroll;
    appDisplay._adjustment = scroll.adjustment;

    // Readd actors
    const pageIndicators = _createPageIndicators(appDisplay, orientation);
    appDisplay._pageIndicators = pageIndicators;

    if (vertical) {
        appDisplay.remove_style_class_name('app-display');
        appDisplay._stack.add_child(scrollView);
        appDisplay.add_child(pageIndicators);
        scrollViewParent.destroy();
        scrollView.add_style_class_name('all-apps');
    } else {
        const box = new St.BoxLayout({
            x_expand: true,
            y_expand: true,
            vertical: true,
        });
        appDisplay._stack.add_child(box);
        box.add_child(scrollView);
        box.add_child(pageIndicators);

        appDisplay._adjId =
            appDisplay._adjustment.connect('notify::value', adj => {
                appDisplay._pageIndicators.setCurrentPosition(
                    adj.value / adj.page_size);
            });

        scrollView.remove_style_class_name('all-apps');
        appDisplay.add_style_class_name('app-display');
    }

    appDisplay._scrollView.set_policy(
        vertical ? St.PolicyType.NEVER : St.PolicyType.EXTERNAL,
        vertical ? St.PolicyType.EXTERNAL : St.PolicyType.NEVER);

    appDisplay._grid.layout_manager.orientation = orientation;
    appDisplay._swipeTracker.orientation = orientation;
    appDisplay._orientation = orientation;

    appDisplay._grid.layout_manager.layout_changed();
}

function setFixedIconSize(iconSize, appDisplay = null) {
    if (!appDisplay)
        appDisplay = Main.overview.viewSelector.appDisplay;

    appDisplay._grid.layout_manager.fixed_icon_size = iconSize;
    appDisplay._grid.layout_manager.layout_changed();
}

function rebuildAppGrid() {
    const { appDisplay } = Main.overview.viewSelector;

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
    Utils.override(AppDisplay.AppDisplay, 'adaptToSize', function (width, height) {
        const [, indicatorHeight] = this._pageIndicators.get_preferred_height(-1);

        let box = new Clutter.ActorBox({
            x2: width,
            y2: height - indicatorHeight,
        });
        box = this._scrollView.get_theme_node().get_content_box(box);
        box = this._grid.get_theme_node().get_content_box(box);

        const availWidth = box.get_width();
        const availHeight = box.get_height();

        this._grid.adaptToSize(availWidth, availHeight);

        if (this._availWidth !== availWidth ||
            this._availHeight !== availHeight ||
            this._pageIndicators.nPages !== this._grid.nPages) {
            Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
                this._pageIndicators.setNPages(this._grid.nPages);
                return GLib.SOURCE_REMOVE;
            });
        }

        this._availWidth = availWidth;
        this._availHeight = availHeight;

        // Disable easing allocation on clones
        if (this !== Main.overview.viewSelector.appDisplay)
            this._grid.layout_manager._pageSizeChanged = true;
    });

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

    Utils.override(IconGrid.IconGrid, 'animateSpring', function () {
        // Skip the entire spring animation
        this._animationDone();
    });

    Utils.override(PageIndicators.PageIndicators, 'animateIndicators', function () {
        // Empty function to avoid overriding AppDisplay.animate()
    });

    rebuildAppGrid();
    changeAppGridOrientation(Clutter.Orientation.HORIZONTAL);
    setFixedIconSize(64);
}

function disable() {
    Utils.restore(AppDisplay.AppDisplay);
    Utils.restore(AppDisplay.PageManager);
    Utils.restore(IconGrid.IconGrid);
    Utils.restore(PageIndicators.PageIndicators);

    Main.overview.disconnect(overviewHidingId);
    Main.overview.disconnect(overviewHiddenId);

    rebuildAppGrid();
    changeAppGridOrientation(Clutter.Orientation.VERTICAL);
    setFixedIconSize(-1);
}
