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

const { Clutter, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const LayoutManager = imports.ui.layout;
const Main = imports.ui.main;

// Note: must be kept in sync with js/ui/overviewControls.js
const DASH_MAX_HEIGHT_RATIO = 0.15;

const SessionDashContainer = GObject.registerClass({
    GTypeName: 'SessionDashContainer',
}, class SessionDashContainer extends Clutter.Actor {
    _init() {
        super._init({
            yAlign: Clutter.ActorAlign.END,
            clipToAllocation: true,
        });

        this.add_constraint(new LayoutManager.MonitorConstraint({
            primary: true,
            workArea: true,
        }));
    }

    vfunc_get_preferred_height(forWidth) {
        if (this._dash)
            return this._dash.get_preferred_height(forWidth);

        const { primaryIndex } = Main.layoutManager;
        const workarea = Main.layoutManager.getWorkAreaForMonitor(primaryIndex);

        return [16, workarea.height * DASH_MAX_HEIGHT_RATIO];
    }

    vfunc_allocate(box) {
        this.set_allocation(box);

        if (this._dash) {
            const { primaryIndex } = Main.layoutManager;
            const { width, height } =
                Main.layoutManager.getWorkAreaForMonitor(primaryIndex);
            const maxDashHeight = height * DASH_MAX_HEIGHT_RATIO;

            this._dash.setMaxSize(width, maxDashHeight);

            let [, dashHeight] = this._dash.get_preferred_height(width);
            dashHeight = Math.min(dashHeight, maxDashHeight);

            const childBox = new Clutter.ActorBox();
            childBox.set_origin(0, 0);
            childBox.set_size(width, dashHeight);
            this._dash.allocate(childBox);
        }
    }

    set dash(v) {
        if (this._dash)
            this.remove_child(this._dash);

        this._dash = v;

        if (this._dash)
            this.add_child(this._dash);
    }
});

const FakeDash = GObject.registerClass({
    GTypeName: 'FakeDash',
}, class FakeDash extends Clutter.Actor {
    setMaxSize(width, height) {
        // Do nothing.
    }
});

const EosDashController = class EosDashController {
    constructor() {
        this._fakeDash = new FakeDash();
        this._sessionDashContainer = new SessionDashContainer();
    }

    _addDashToOverview() {
        const overviewControls = Main.overview._overview.controls;

        Main.layoutManager.untrackChrome(Main.overview.dash);

        this._sessionDashContainer.dash = null;
        overviewControls.layoutManager._dash = Main.overview.dash;
        overviewControls.insert_child_above(
            Main.overview.dash,
            overviewControls.appDisplay);

        this._fakeDash.hide();
        this._sessionDashContainer.hide();
    }

    _addDashToSession() {
        const overviewControls = Main.overview._overview.controls;

        Main.layoutManager.trackChrome(Main.overview.dash, {
            affectsInputRegion: true,
        });

        overviewControls.remove_child(Main.overview.dash);
        overviewControls.layoutManager._dash = this._fakeDash;
        this._sessionDashContainer.dash = Main.overview.dash;

        this._fakeDash.show();
        this._sessionDashContainer.show();
    }

    enable() {
        Main.layoutManager.addChrome(this._sessionDashContainer, {
            affectsInputRegion: true,
        });

        const overviewControls = Main.overview._overview.controls;
        overviewControls.insert_child_above(this._fakeDash, Main.overview.dash);

        this._overviewSignals = [];
        this._overviewSignals.push(Main.overview.connect('showing', () => {
            this._addDashToOverview();
        }));
        this._overviewSignals.push(Main.overview.connect('hidden', () => {
            this._addDashToSession();
        }));
    }

    disable() {
        Main.layoutManager.removeChrome(this._sessionDashContainer);

        const overviewControls = Main.overview._overview.controls;
        overviewControls.remove_child(this._fakeDash);

        this._overviewSignals.forEach(id => Main.overview.disconnect(id));
        delete this._overviewSignals;
    }
};

let dashContoller = null;
function enable() {
    if (!dashContoller)
        dashContoller = new EosDashController();

    dashContoller.enable();
}

function disable() {
    dashContoller.disable();
}
