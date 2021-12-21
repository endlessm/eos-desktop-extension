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

const { Clutter, GLib, GObject, Meta } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const LayoutManager = imports.ui.layout;
const Main = imports.ui.main;

const WINDOW_OVERLAP_POLL_TIMEOUT = 200;

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

const windowTypes = [
    Meta.WindowType.NORMAL,
    Meta.WindowType.DOCK,
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
    Meta.WindowType.TOOLBAR,
    Meta.WindowType.MENU,
    Meta.WindowType.UTILITY,
    Meta.WindowType.SPLASHSCREEN
];

const Intellihide = GObject.registerClass({
    Properties: {
        'dash-visible': GObject.ParamSpec.boolean(
            'dash-visible', 'dash-visible', 'dash-visible',
            GObject.ParamFlags.READABLE,
            true),
    },
}, class Intellihide extends GObject.Object {
    _init() {
        super._init();

        this._dashVisible = true;
    }

    _getRelevantWindows() {
        return global.get_window_actors().filter(windowActor => {
            const metaWindow = windowActor.get_meta_window();

            if (!metaWindow)
                return false;

            if (windowTypes.indexOf(metaWindow.get_window_type()) === -1)
                return false;

            if (metaWindow.minimized)
                return false;

            const currentWorkspaceIndex =
                global.workspace_manager.get_active_workspace_index();
            const windowWorkspaceIndex = metaWindow.get_workspace()?.index();

            return currentWorkspaceIndex === windowWorkspaceIndex &&
                metaWindow.showing_on_its_workspace();
        }).map(windowActor => windowActor.get_meta_window());
    }

    _getDashBox() {
        const { primaryIndex } = Main.layoutManager;
        const { x, y, width, height } =
            Main.layoutManager.getWorkAreaForMonitor(primaryIndex);

        const dashHeight = Main.overview.dash.height;

        const childBox = new Clutter.ActorBox();
        childBox.set_origin(x, y + height - dashHeight);
        childBox.set_size(width, dashHeight);
        return childBox;
    }

    _setDashVisible(visible) {
        if (this._dashVisible === visible)
            return;

        this._dashVisible = visible;
        this.notify('dash-visible');
    }

    update() {
        // Always show the Dash in overview
        if (Main.overview.visibleTarget) {
            this._setDashVisible(true);
            return;
        }

        const dashBox = this._getDashBox();
        let hasOverlaps = false;

        for (const metaWindow of this._getRelevantWindows()) {
            const frameRect = metaWindow.get_frame_rect();

            hasOverlaps |=
                frameRect.x + frameRect.width > dashBox.x1 &&
                frameRect.y + frameRect.height > dashBox.y1 &&
                frameRect.x < dashBox.x2 &&
                frameRect.y < dashBox.y2;

            if (hasOverlaps)
                break;
        }

        this._setDashVisible(!hasOverlaps);
    }

    enable() {
        this._timeoutId = GLib.timeout_add(
            GLib.PRIORITY_LOW,
            WINDOW_OVERLAP_POLL_TIMEOUT,
            () => {
                this.update();
                return GLib.SOURCE_CONTINUE;
            });
    }

    disable() {
        GLib.source_remove(this._timeoutId);
        delete this._timeoutId;
    }

    get dash_visible() {
        return this._dashVisible;
    }
});

const EosDashController = class EosDashController {
    constructor() {
        this._fakeDash = new FakeDash();
        this._sessionDashContainer = new SessionDashContainer();

        this._intellihide = new Intellihide();
        this._intellihide.connect('notify::dash-visible', () => this._updateDash());
    }

    _updateDash() {
        const { dash } = Main.overview;
        const { dashVisible } = this._intellihide;

        dash.remove_transition('translation-y');
        dash.ease({
            translation_y: dashVisible ? 0 : dash.height,
            duration: 250,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
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

            // This must be done after reparenting, otherwise the translation-y
            // transition doesn't happen
            this._intellihide.update();
        }));
        this._overviewSignals.push(Main.overview.connect('hiding', () => {
            this._intellihide.update();
        }));
        this._overviewSignals.push(Main.overview.connect('hidden', () => {
            this._addDashToSession();
        }));

        this._intellihide.enable();
    }

    disable() {
        Main.layoutManager.removeChrome(this._sessionDashContainer);

        const overviewControls = Main.overview._overview.controls;
        overviewControls.remove_child(this._fakeDash);

        this._overviewSignals.forEach(id => Main.overview.disconnect(id));
        delete this._overviewSignals;

        this._intellihide.disable();
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
