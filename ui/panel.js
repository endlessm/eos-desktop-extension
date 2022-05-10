/* exported enable, disable */
/*
 * Copyright 2021 Endless OS Foundation, LLC
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

const { Atk, Clutter, GLib, GObject, St, Shell } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const DND = imports.ui.dnd;
const Main = imports.ui.main;
const OverviewControls = imports.ui.overviewControls;
const PanelMenu = imports.ui.panelMenu;
const Utils = DesktopExtension.imports.utils;

const EosPanelButton = GObject.registerClass(
class EosPanelButton extends PanelMenu.Button {
    _init(params) {
        super._init(0.0, null, true);
        this.accessible_role = Atk.Role.TOGGLE_BUTTON;

        this._callback = params.callback;

        const label = new St.Label({
            text: params.text,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(label);

        this.label_actor = label;

        const { controls } = Main.overview._overview;
        this._signalId = controls._stateAdjustment.connect('notify::value', () => {
            const { value } = controls._stateAdjustment;

            if (value === params.state) {
                this.add_style_pseudo_class('overview');
                this.add_accessible_state(Atk.StateType.CHECKED);
            } else {
                this.remove_style_pseudo_class('overview');
                this.remove_accessible_state(Atk.StateType.CHECKED);
            }
        });

        this._xdndTimeOut = 0;
    }

    _onDestroy() {
        super._onDestroy();

        if (this._signalId) {
            const { controls } = Main.overview._overview;
            controls._stateAdjustment.disconnect(this._signalId);
            delete this._signalId;
        }
    }

    handleDragOver(source, _actor, _x, _y, _time) {
        if (source != Main.xdndHandler)
            return DND.DragMotionResult.CONTINUE;

        if (this._xdndTimeOut != 0)
            GLib.source_remove(this._xdndTimeOut);
        this._xdndTimeOut = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            PanelBUTTON_DND_ACTIVATION_TIMEOUT,
            () => this._xdndToggleOverview());
        GLib.Source.set_name_by_id(this._xdndTimeOut, '[eos-desktop-extension] this._xdndToggleOverview');

        return DND.DragMotionResult.CONTINUE;
    }

    vfunc_captured_event(event) {
        if (event.type() == Clutter.EventType.BUTTON_PRESS ||
            event.type() == Clutter.EventType.TOUCH_BEGIN) {
            if (!Main.overview.shouldToggleByCornerOrButton())
                return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_event(event) {
        if (event.type() == Clutter.EventType.TOUCH_END ||
            event.type() == Clutter.EventType.BUTTON_RELEASE) {
            if (Main.overview.shouldToggleByCornerOrButton())
                this._callback();
        }

        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_key_release_event(keyEvent) {
        const symbol = keyEvent.keyval;
        if (symbol == Clutter.KEY_Return || symbol == Clutter.KEY_space) {
            if (Main.overview.shouldToggleByCornerOrButton()) {
                this._callback();
                return Clutter.EVENT_STOP;
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _xdndToggleOverview() {
        const [x, y] = global.get_pointer();
        const pickedActor =
            global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);

        if (pickedActor == this && Main.overview.shouldToggleByCornerOrButton())
            this._callback();

        GLib.source_remove(this._xdndTimeOut);
        this._xdndTimeOut = 0;
        return GLib.SOURCE_REMOVE;
    }
});

const ApplicationsButton = GObject.registerClass(
class ApplicationsButton extends EosPanelButton {
    _init() {
        super._init({
            text: _('Applications'),
            state: OverviewControls.ControlsState.APP_GRID,
            callback: () => {
                if (!Main.overview.visible)
                    Main.overview.showApps();
                else if (!Main.overview.dash.showAppsButton.checked)
                    Main.overview.dash.showAppsButton.checked = true;
                else
                    Main.overview.hide();
            },
        });
    }
});

const WorkspacesButton = GObject.registerClass(
class WorkspacesButton extends EosPanelButton {
    _init() {
        super._init({
            text: _('Activities'),
            state: OverviewControls.ControlsState.WINDOW_PICKER,
            callback: () => {
                if (!Main.overview.visible)
                    Main.overview.show();
                else if (Main.overview.dash.showAppsButton.checked)
                    Main.overview.dash.showAppsButton.checked = false;
                else
                    Main.overview.hide();
            },
        });
    }
});

function setActivitiesButtonVisible(visible) {
    if (Main.panel.statusArea.activities)
        Main.panel.statusArea.activities.visible = visible;
}

const indicators = [];

function addIndicator(role, indicator, position) {
    Main.panel.addToStatusArea(role, indicator, position, 'left');
    indicators.push(indicator);
}

function enable() {
    setActivitiesButtonVisible(false);
    addIndicator('workspaces', new WorkspacesButton(), 0);
    addIndicator('applications', new ApplicationsButton(), 1);
}

function disable() {
    for (const indicator of indicators)
        indicator.destroy();
    setActivitiesButtonVisible(true);
}
