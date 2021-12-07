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
const LayoutManager = imports.ui.layout;
const Main = imports.ui.main;

var EOS_INACTIVE_GRID_OPACITY = 96;

var OverviewClone = GObject.registerClass(
class OverviewClone extends St.BoxLayout {
    _init() {
        super._init({
            reactive: true,
        });

        const box = new St.BoxLayout({
            styleClass: 'controls-manager',
            opacity: EOS_INACTIVE_GRID_OPACITY,
            vertical: true,
        });
        this.add_child(box);

        Shell.util_set_hidden_from_pick(box, true);

        this.add_constraint(new LayoutManager.MonitorConstraint({
            primary: true,
            workArea: true,
        }));

        // Search entry
        this._entry = new St.Entry({
            primary_icon: new St.Icon({
                style_class: 'search-entry-icon',
                icon_name: 'edit-find-symbolic',
            }),
            style_class: 'search-entry',
        });
        this._entry.primary_icon.add_style_class_name('primary');
        const searchEntryBin = new St.Bin({
            child: this._entry,
            x_align: Clutter.ActorAlign.CENTER,
            offscreen_redirect: Clutter.OffscreenRedirect.ALWAYS,
        });
        box.add_actor(searchEntryBin);

        // HACK: invasively find the overview signal id that AppDisplay
        // will use when connecting to the 'hidden' signal
        this._overviewHiddenId = Main.overview._nextConnectionId;

        const appDisplayClone = new AppDisplay.AppDisplay();

        appDisplayClone.add_constraint(new Clutter.BindConstraint({
            source: Main.overview._overview.controls.appDisplay,
            coordinate: Clutter.BindCoordinate.HEIGHT,
        }));

        // Disable DnD on clones
        appDisplayClone._disconnectDnD();
        appDisplayClone._connectDnD = function() {};
        appDisplayClone._savePages = function() {};

        // Hide running dots of the clones
        const originalAddItem = appDisplayClone._addItem;
        appDisplayClone._addItem = function(item, page, position) {
            originalAddItem.bind(appDisplayClone)(item, page, position);
            if (item._dot)
                item._dot.opacity = 0;
        };
        box.add_child(appDisplayClone);

        // Bind adjustments
        const { appDisplay } = Main.overview._overview.controls;
        ['upper', 'value'].forEach(property => {
            appDisplay._scrollView.hscroll.adjustment.bind_property(property,
                appDisplayClone._scrollView.hscroll.adjustment, property,
                GObject.BindingFlags.SYNC_CREATE);
            appDisplay._scrollView.vscroll.adjustment.bind_property(property,
                appDisplayClone._scrollView.vscroll.adjustment, property,
                GObject.BindingFlags.SYNC_CREATE);
        });

        // Added by this extension's ui/appDisplay.js file
        this._desaturateEffect = new Clutter.DesaturateEffect({
            name: 'endless-desaturate',
            factor: 1.0,
        });
        box.add_effect(this._desaturateEffect);

        // 'Go To Overview' click action
        const clickAction = new Clutter.ClickAction();
        clickAction.connect('clicked', () => {
            Main.overview.showApps();
        });
        this.add_action(clickAction);

        // Dash clone
        const dashClone = new Clutter.Actor({ opacity: 0 });
        Main.overview.dash.bind_property('height',
            dashClone, 'height',
            GObject.BindingFlags.SYNC_CREATE);
        box.add_child(dashClone);

        // Hide page indicators in clones
        appDisplayClone._pageIndicators.opacity = 0;

        this.connect('destroy', this._onDestroy.bind(this));
    }

    _onDestroy() {
        if (this._overviewHiddenId > 0) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = 0;
        }
    }
});

const bgGroups = [
    Main.layoutManager._backgroundGroup,
];

var OverviewCloneController = class OverviewCloneController {
    constructor() {
        this._overviewShowingId = 0;
        this._overviewShownId = 0;
        this._overviewHidingId = 0;
        this._overviewHiddenId = 0;
    }

    _updateClones() {
        const { visible } = Main.overview;

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

        this._overviewShowingId =
            Main.overview.connect('showing', () => this._updateClones());
        this._overviewShownId =
            Main.overview.connect('shown', () => this._updateClones());
        this._overviewHidingId =
            Main.overview.connect('hiding', () => this._updateClones());
        this._overviewHiddenId =
            Main.overview.connect('hidden', () => this._updateClones());
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
        this._workspacesVisibleId = 0;
    }
};

const cloneController = new OverviewCloneController();

function enable() {
    cloneController.enable();
}

function disable() {
    cloneController.disable();
}
