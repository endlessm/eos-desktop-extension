// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
/* exported WorkspaceMonitor */

const { GObject, Meta, Shell } = imports.gi;

const Main = imports.ui.main;
const ViewSelector = imports.ui.viewSelector;

var WorkspaceMonitor = GObject.registerClass(
class WorkspaceMonitor extends GObject.Object {
    _init() {
        super._init();

        this._shellwm = global.window_manager;
        this._shellwm.connect('minimize', this._windowDisappearing.bind(this));
        this._shellwm.connect('destroy', this._windowDisappearing.bind(this));

        this._windowGroup = global.window_group;
        this._windowGroup.connect('actor-added', this._windowsChanged.bind(this));
        this._windowGroup.connect('actor-removed', this._windowsChanged.bind(this));

        global.display.connect('in-fullscreen-changed', this._fullscreenChanged.bind(this));

        const primaryMonitor = Main.layoutManager.primaryMonitor;
        this._inFullscreen = primaryMonitor && primaryMonitor.inFullscreen;

        this._enabled = false;
    }

    _fullscreenChanged() {
        const primaryMonitor = Main.layoutManager.primaryMonitor;
        const inFullscreen = primaryMonitor && primaryMonitor.inFullscreen;

        if (this._inFullscreen !== inFullscreen) {
            this._inFullscreen = inFullscreen;
            this._updateOverview();
        }
    }

    _windowDisappearing(shellwm, actor) {
        if (!this._enabled)
            return;

        if (actor.meta_window.get_transient_for())
            return;

        const windows = this._getVisibleWindows();
        if (windows.length === 0)
            Main.overview.show();
    }

    _updateOverview() {
        if (!this._enabled)
            return;

        const windows = this._getVisibleWindows();
        if (windows.length === 0)
            Main.overview.show();
        else if (this._inFullscreen)
            // Hide in fullscreen mode
            Main.overview.hide();
    }

    _windowDisappeared() {
        this._updateOverview();
    }

    _windowsChanged() {
        if (!this._enabled)
            return;

        const windows = this._getVisibleWindows();
        const overview = Main.overview;
        const isShowingAppsGrid =
            overview.visible &&
            overview.viewSelector.getActivePage() === ViewSelector.ViewPage.APPS;

        if (windows.length > 0 && isShowingAppsGrid) {
            // Make sure to hide the apps grid so that running apps whose
            // windows are becoming visible are shown to the user.
            overview.hide();
        } else {
            // Fallback to the default logic used for dissapearing windows.
            this._updateOverview();
        }
    }

    _getVisibleWindows() {
        return this._windowGroup.get_children().filter(child => {
            if (!(child instanceof Meta.WindowActor))
                return false;

            const { metaWindow } = child;
            return !metaWindow.minimized && !metaWindow.get_transient_for();
        });
    }

    enable() {
        this._enabled = true;
        this._updateOverview();
    }

    disable() {
        this._enabled = false;
    }

    get hasVisibleWindows() {
        // Count anything fullscreen as an extra window
        if (this._inFullscreen)
            return true;

        const windows = this._getVisibleWindows();
        return windows.length > 0;
    }
});
