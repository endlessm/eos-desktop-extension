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

const { Clutter, GLib, GObject, Meta, Shell, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const Dash = imports.ui.dash;
const LayoutManager = imports.ui.layout;
const Main = imports.ui.main;
const Utils = DesktopExtension.imports.utils;

const DEFAULT_BARRIER_TRAVEL_THRESHOLD = 150;
const DEFAULT_BARRIER_TRAVEL_TIMEOUT = 1000;

const WINDOW_OVERLAP_POLL_TIMEOUT = 200;

// Note: must be kept in sync with js/ui/overviewControls.js
const DASH_MAX_HEIGHT_RATIO = 0.15;

const EosDashIcon = GObject.registerClass({
    GTypeName: 'EosDashIcon',
}, class EosDashIcon extends Dash.DashIcon {
    _init(app) {
        super._init(app);

        this._windowsChangedId =
            app.connect('windows-changed', () => this.updateIconGeometry());
    }

    vfunc_map() {
        super.vfunc_map();
        this.updateIconGeometry();
    }

    _onDestroy() {
        if (this._windowsChangedId) {
            this.app.disconnect(this._windowsChangedId);
            delete this._windowsChangedId;
        }

        super._onDestroy();
    }

    updateIconGeometry() {
        const windows = this.app.get_windows();

        if (windows?.length === 0)
            return;

        const rect = new Meta.Rectangle();
        [rect.x, rect.y] = this.get_transformed_position();
        [rect.width, rect.height] = this.get_transformed_size();

        windows.forEach(w => w.set_icon_geometry(rect));
    }
});

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
        this._barrierThreshold = DEFAULT_BARRIER_TRAVEL_THRESHOLD;
        this._barrierTimeout = DEFAULT_BARRIER_TRAVEL_TIMEOUT;
    }

    _armTriggerTimeout() {
        if (this._triggerTimeoutId)
            return;

        this._triggerTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_LOW,
            1000,
            () => {
                delete this._triggerTimeoutId;
                return GLib.SOURCE_REMOVE;
            });
    }

    _disarmTriggerTimeout() {
        if (!this._triggerTimeoutId)
            return;

        GLib.source_remove(this._triggerTimeoutId);
        delete this._triggerTimeoutId;
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
        if (Main.overview.visibleTarget ||
            Main.overview.dash._dashContainer.hover ||
            this._triggerTimeoutId) {
            this._setDashVisible(true);
            return;
        }

        // When the Dash is already visible in the session, and the
        // cursor is within the Dash boundaries, but not hovering
        // _dashContainer, continue showing it
        const dashBox = this._getDashBox();
        const [pointerX, pointerY] = global.get_pointer();
        if (this._dashVisible && dashBox.contains(pointerX, pointerY))
            return;

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

    _removeBarrier() {
        if (!this._barrier)
            return;

        this._pressureBarrier.removeBarrier(this._barrier);
        this._barrier.destroy();
        delete this._barrier;
    }

    _updateBarrier() {
        this._removeBarrier();

        const { primaryIndex } = Main.layoutManager;
        const { x, y, width, height } =
            Main.layoutManager.getWorkAreaForMonitor(primaryIndex);

        this._barrier = new Meta.Barrier({
            display: global.display,
            x1: x + 1,
            x2: x + width - 2,
            y1: y + height,
            y2: y + height,
            directions: Meta.BarrierDirection.NEGATIVE_Y,
        });
        this._pressureBarrier.addBarrier(this._barrier);
    }

    enable() {
        this._timeoutId = GLib.timeout_add(
            GLib.PRIORITY_LOW,
            WINDOW_OVERLAP_POLL_TIMEOUT,
            () => {
                this.update();
                return GLib.SOURCE_CONTINUE;
            });

        this._pressureBarrier = new LayoutManager.PressureBarrier(
            this._barrierThreshold,
            this._barrierTimeout,
            Shell.ActionMode.NORMAL);
        this._pressureBarrier.connect('trigger', () => {
            this._setDashVisible(true);
            this._armTriggerTimeout();
        });
        this._updateBarrier();

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._updateBarrier();
        });

        this._workareasChangedId = global.display.connect('workareas-changed', () => {
            this._updateBarrier();
        });
    }

    disable() {
        GLib.source_remove(this._timeoutId);
        delete this._timeoutId;

        this._removeBarrier();
        this._pressureBarrier.destroy()
        delete this._pressureBarrier;

        Main.layoutManager.disconnect(this._monitorsChangedId);
        delete this._monitorsChangedId;

        global.display.disconnect(this._workareasChangedId);
        delete this._workareasChangedId;

        this._disarmTriggerTimeout();
    }

    get dash_visible() {
        return this._dashVisible;
    }

    get barrierThreshold() {
        return this._barrierThreshold;
    }

    set barrierThreshold(threshold) {
        this._barrierThreshold = threshold;
        if (this._pressureBarrier)
            this._pressureBarrier._threshold = threshold;
    }

    get barrierTimeout() {
        return this._barrierTimeout;
    }

    set barrierTimeout(timeout) {
        this._barrierTimeout = timeout;
        if (this._pressureBarrier)
            this._pressureBarrier._timeout = timeout;
    }
});

const EosDashController = class EosDashController {
    constructor(workspaceMonitor) {
        this._workspaceMonitor = workspaceMonitor;

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
            onStopped: () => {
                // Sometimes we reparent the Dash before this transition
                // is finished, cancelling the timeline. In these cases,
                // we must ensure the Dash ends up with the target
                // translation
                dash.translation_y = dashVisible ? 0 : dash.height;
            },
            onComplete: () => {
                this._updateIconsGeometries();

                // GNOME Shell only tracks changes in the actor allocation,
                // but we're easing translation-y which is a post-allocation
                // transform that doesn't change allocation, therefore we
                // must manually queue an update to input regions.
                Main.layoutManager._queueUpdateRegions();
            }
        });
    }

    _updateIconsGeometries() {
        for (const actor of Main.overview.dash._box) {
            if (actor.child?.updateIconGeometry)
                actor.child.updateIconGeometry();
        }
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
        Main.overview.dash._dashContainer.reactive = true;
        Main.overview.dash._dashContainer.track_hover = true;

        Main.layoutManager.addChrome(this._sessionDashContainer, {
            affectsInputRegion: false,
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

        // Show the overview when the toggling the apps button in session
        // mode
        const { showAppsButton } = Main.overview.dash;
        this._showOverviewId = showAppsButton.connect('notify::checked', () => {
            if (Main.overview._overview.controls._ignoreShowAppsButtonToggle ||
                this._workspaceMonitor.hasVisibleWindows ||
                Main.overview.visibleTarget)
                return;

            if (showAppsButton.checked)
                Main.overview.showApps();
            else
                Main.overview.show();
        });
    }

    disable() {
        Main.overview.dash._dashContainer.reactive = false;
        Main.overview.dash._dashContainer.track_hover = false;

        Main.layoutManager.removeChrome(this._sessionDashContainer);

        const overviewControls = Main.overview._overview.controls;
        overviewControls.remove_child(this._fakeDash);

        this._overviewSignals.forEach(id => Main.overview.disconnect(id));
        delete this._overviewSignals;

        this._intellihide.disable();

        Main.overview.dash.showAppsButton.disconnect(this._showOverviewId);
        delete this._showOverviewId;
    }

    get intellihide() {
        return this._intellihide;
    }
};

let dashController = null;
function enable(workspaceMonitor) {
    Utils.override(Dash.Dash, '_createAppItem', function(app) {
        const appIcon = new EosDashIcon(app);

        appIcon.connect('menu-state-changed', (o, opened) => {
            this._itemMenuStateChanged(item, opened);
        });

        const item = new Dash.DashItemContainer();
        item.setChild(appIcon);

        // Override default AppIcon label_actor, now the
        // accessible_name is set at DashItemContainer.setLabelText
        appIcon.label_actor = null;
        item.setLabelText(app.get_name());

        appIcon.icon.setIconSize(this.iconSize);
        this._hookUpLabel(item, appIcon);

        return item;
    });

    Utils.override(Dash.Dash, 'setBarrierParams', function(distance, time) {
        if (!dashController)
            return;

        dashController.intellihide.barrierThreshold = distance;
        dashController.intellihide.barrierTimeout = time;
    });

    if (!dashController)
        dashController = new EosDashController(workspaceMonitor);

    dashController.enable();
}

function disable() {
    Utils.restore(Dash.Dash);
    dashController.disable();
}
