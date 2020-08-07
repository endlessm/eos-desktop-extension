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

const { Clutter, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const AppDisplay = imports.ui.appDisplay;
const IconGrid = imports.ui.iconGrid;
const Main = imports.ui.main;
const PageIndicators = imports.ui.pageIndicators;
const ViewSelector = imports.ui.viewSelector;
const Utils = DesktopExtension.imports.utils;

const EOS_LINK_PREFIX = 'eos-link-';

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
    }

    appDisplay._scrollView.set_policy(
        vertical ? St.PolicyType.NEVER : St.PolicyType.EXTERNAL,
        vertical ? St.PolicyType.EXTERNAL : St.PolicyType.NEVER);

    appDisplay._grid.layout_manager.orientation = orientation;
    appDisplay._swipeTracker.orientation = orientation;
    appDisplay._orientation = orientation;

    appDisplay._grid.layout_manager.layout_changed();
}

function enable() {
    Utils.override(AppDisplay.AppDisplay, 'adaptToSize', function(width, height) {
        const [, indicatorHeight] = this._pageIndicators.get_preferred_height(-1);
        height -= indicatorHeight;

        const original = Utils.original(AppDisplay.AppDisplay, 'adaptToSize');
        original.bind(this)(width, height);
    });

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

    Utils.override(PageIndicators.PageIndicators, 'animateIndicators', function() {
        // Empty function to avoid overriding AppDisplay.animate()
    });

    changeAppGridOrientation(Clutter.Orientation.HORIZONTAL);
}

function disable() {
    Utils.restore(AppDisplay.AppDisplay);
    Utils.restore(IconGrid.IconGrid);
    Utils.restore(PageIndicators.PageIndicators);

    changeAppGridOrientation(Clutter.Orientation.VERTICAL);
}
