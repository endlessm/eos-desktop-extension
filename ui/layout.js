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

const EOS_INACTIVE_GRID_OPACITY = 96;

let startupPreparedId = 0;

var OverviewClone = GObject.registerClass(
class OverviewClone extends St.BoxLayout {
    _init() {
        super._init();

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

        const appDisplayClone = new AppDisplay.AppDisplay();
        AppDisplayOverrides.changeAppGridOrientation(
            Clutter.Orientation.HORIZONTAL,
            appDisplayClone);
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
    }
});

const bgGroups = [
    Main.layoutManager._backgroundGroup,
    Main.overview._backgroundGroup,
];

function addAppGridClone() {
    bgGroups.forEach(group => group.add_child(new OverviewClone()));
}

function removeAppGridClone() {
    bgGroups.forEach(actor => {
        for (const child of actor) {
            if (child instanceof OverviewClone)
                child.destroy();
        }
    });
}

function enable() {
    if (startupPreparedId === 0) {
        startupPreparedId =
            Main.layoutManager.connect('startup-prepared', () => {
                Main.overview.show();
            });
    }

    addAppGridClone();
}

function disable() {
    if (startupPreparedId > 0) {
        Main.layoutManager.disconnect(startupPreparedId);
        startupPreparedId = 0;
    }

    removeAppGridClone();
}
