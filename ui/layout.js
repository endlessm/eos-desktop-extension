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

const LayoutManager = imports.ui.layout;
const Main = imports.ui.main;

var EOS_INACTIVE_GRID_OPACITY = 96;

var AppDisplayClone = GObject.registerClass(
class AppDisplayClone extends Clutter.Actor {
    _init() {
        const { appDisplay } = Main.overview._overview.controls;

        super._init({
            x_expand: true,
            y_expand: true,
        });

        this._clone = new Clutter.Clone({
            x_expand: true,
            clip_to_allocation: true,
            source: appDisplay._stack,
        });
        this.add_child(this._clone);
    }

    _getYOffset() {
        const { appDisplay } = Main.overview._overview.controls;

        // HACK!!! I genuinely do not understand why AppDisplay reports
        // different sizes when outside of the overview, and when there
        // is only one page.
        if (appDisplay._grid.nPages === 1 && !Main.overview.visible)
            return appDisplay._pageIndicators.height;

        return 0;
    }

    vfunc_get_preferred_width(forHeight) {
        const { appDisplay } = Main.overview._overview.controls;
        return appDisplay.get_preferred_width(forHeight);
    }

    vfunc_get_preferred_height(forWidth) {
        const { appDisplay } = Main.overview._overview.controls;

        let [minHeight, natHeight] = appDisplay.get_preferred_height(forWidth);

        const offset = this._getYOffset();
        minHeight += offset;
        natHeight += offset;

        return [minHeight, natHeight];
    }

    vfunc_allocate(box) {
        const { appDisplay } = Main.overview._overview.controls;

        this.set_allocation(box);

        appDisplay.adaptToSize(...box.get_size());

        const cloneBox = box.copy();
        cloneBox.set_origin(0, 0);
        cloneBox.y2 -= this._getYOffset();

        if (!appDisplay._stack.has_allocation())
            appDisplay._stack.allocate(cloneBox);

        this._clone.allocate(cloneBox);
    }
});

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
            x_expand: true,
            y_expand: true,
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
            hint_text: Main.overview.searchEntry.hintText,
        });
        this._entry.primary_icon.add_style_class_name('primary');
        const searchEntryBin = new St.Bin({
            child: this._entry,
            x_align: Clutter.ActorAlign.CENTER,
            offscreen_redirect: Clutter.OffscreenRedirect.ALWAYS,
        });
        box.add_actor(searchEntryBin);

        // Clone
        const appDisplayClone = new AppDisplayClone();
        box.add_child(appDisplayClone);

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
