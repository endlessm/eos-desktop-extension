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

const { Clutter, GObject, Shell, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const AppDisplay = imports.ui.appDisplay;
const AppDisplayOverrides = DesktopExtension.imports.ui.appDisplay;
const LayoutManager = imports.ui.layout;
const Main = imports.ui.main;
const OverviewOverrides = DesktopExtension.imports.ui.overview;
const ViewSelector = imports.ui.viewSelector;

const EOS_INACTIVE_GRID_OPACITY = 96;

let startupPreparedId = 0;

var OverviewClone = GObject.registerClass(
class OverviewClone extends St.BoxLayout {
    _init() {
        super._init({
            reactive: true,
        });

        const box = new St.BoxLayout({
            name: 'overview',
            opacity: EOS_INACTIVE_GRID_OPACITY,
            vertical: true,
        });
        this.add_child(box);

        Shell.util_set_hidden_from_pick(box, true);

        this.add_constraint(new LayoutManager.MonitorConstraint({ primary: true }));

        // Add a clone of the panel to the overview so spacing and such is
        // automatic
        const panelGhost = new St.Bin({
            child: new Clutter.Clone({ source: Main.panel }),
            reactive: false,
            opacity: 0,
        });
        box.add_child(panelGhost);

        const searchEntryClone = new Clutter.Clone({
            source: Main.overview.searchEntry.get_parent(),
            x_align: Clutter.ActorAlign.CENTER,
        });
        box.add_actor(searchEntryClone);

        // HACK: invasively find the overview signal id that AppDisplay
        // will use when connecting to the 'hidden' signal
        this._overviewHiddenId = Main.overview._nextConnectionId;

        const appDisplayClone = new AppDisplay.AppDisplay();
        appDisplayClone.offscreen_redirect = Clutter.OffscreenRedirect.ALWAYS;

        // Disable DnD on clones
        appDisplayClone._disconnectDnD();
        appDisplayClone._connectDnD = function() {};

        AppDisplayOverrides.changeAppGridOrientation(
            Clutter.Orientation.HORIZONTAL,
            appDisplayClone);
        AppDisplayOverrides.setFixedIconSize(64, appDisplayClone);
        box.add_child(appDisplayClone);

        // Bind adjustments
        const { appDisplay } = Main.overview.viewSelector;
        appDisplay._scrollView.hscroll.adjustment.bind_property('value',
            appDisplayClone._scrollView.hscroll.adjustment, 'value',
            GObject.BindingFlags.SYNC_CREATE);
        appDisplay._scrollView.vscroll.adjustment.bind_property('value',
            appDisplayClone._scrollView.vscroll.adjustment, 'value',
            GObject.BindingFlags.SYNC_CREATE);

        // Added by this extension's ui/appDisplay.js file
        this._desaturateEffect = new Clutter.DesaturateEffect({
            name: 'endless-desaturate',
            factor: 1.0,
        });
        box.add_effect(this._desaturateEffect);

        // 'Go To Overview' click action
        const clickAction = new Clutter.ClickAction();
        clickAction.connect('clicked', () => {
            Main.overview.show();
        });
        this.add_action(clickAction);

        this._extensionStateChangedId =
        Main.extensionManager.connect('extension-state-changed',
            () => OverviewOverrides.updateGhostPanelPosition(box));
        OverviewOverrides.updateGhostPanelPosition(box);

        this.connect('destroy', this._onDestroy.bind(this));
    }

    _onDestroy() {
        if (this._overviewHiddenId > 0) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = 0;
        }

        if (this._extensionStateChangedId > 0) {
            Main.extensionManager.disconnect(this._extensionStateChangedId);
            this._extensionStateChangedId = 0;
        }
    }
});

const bgGroups = [
    Main.layoutManager._backgroundGroup,
    Main.overview._backgroundGroup,
];

var OverviewCloneController = class OverviewCloneController {
    constructor() {
        this._overviewShowingId = 0;
        this._overviewShownId = 0;
        this._overviewHidingId = 0;
        this._overviewHiddenId = 0;
        this._viewSelectorPageChangedId = 0;
    }

    _updateClones() {
        const { viewSelector, visible, animationInProgress } = Main.overview;
        const inWindowsPage = viewSelector._workspacesPage.visible;

        const overviewCloneOpacity =
            animationInProgress || inWindowsPage ? 255 : 0;
        Main.overview._backgroundGroup._appGridClone.opacity = overviewCloneOpacity;

        const layoutCloneOpacity = visible ? 0 : 255;
        Main.layoutManager._backgroundGroup._appGridClone.opacity = layoutCloneOpacity;
    }

    enable() {
        bgGroups.forEach(group => {
            if (group._appGridClone)
                return;

            const clone = new OverviewClone();

            group.add_child(clone);
            group._appGridClone = clone;
        });

        const { viewSelector } = Main.overview;

        this._overviewShowingId =
            Main.overview.connect('showing', () => this._updateClones());
        this._overviewShownId =
            Main.overview.connect('shown', () => this._updateClones());
        this._overviewHidingId =
            Main.overview.connect('hiding', () => this._updateClones());
        this._overviewHiddenId =
            Main.overview.connect('hidden', () => this._updateClones());
        this._viewSelectorPageChangedId =
            viewSelector._workspacesPage.connect('notify::visible',
                () => this._updateClones());
    }

    disable() {
        bgGroups.forEach(actor => {
            if (actor._appGridClone) {
                actor._appGridClone.destroy();
                delete actor._appGridClone;
            }
        });

        Main.overview.disconnect(this._overviewShowingId);
        this._overviewShowingId = 0;
        Main.overview.disconnect(this._overviewHiddenId);
        this._overviewHiddenId = 0;
        Main.overview.disconnect(this._overviewShownId);
        this._overviewShownId = 0;
        Main.overview.disconnect(this._overviewHidingId);
        this._overviewHidingId = 0;
        Main.overview.viewSelector.disconnect(this._viewSelectorPageChangedId);
        this._viewSelectorPageChangedId = 0;
    }
};

const cloneController = new OverviewCloneController();

function enable() {
    if (startupPreparedId === 0) {
        startupPreparedId =
            Main.layoutManager.connect('startup-prepared', () => {
                Main.overview.show();
            });
    }

    cloneController.enable();
}

function disable() {
    if (startupPreparedId > 0) {
        Main.layoutManager.disconnect(startupPreparedId);
        startupPreparedId = 0;
    }

    cloneController.disable();
}
