// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
/* exported WorkspaceMonitor */

const { GObject, Shell } = imports.gi;

const Main = imports.ui.main;
const ViewSelector = imports.ui.viewSelector;

var WorkspaceMonitor = GObject.registerClass(
class WorkspaceMonitor extends GObject.Object {
    _init() {
        super._init();

        this._shellwm = global.window_manager;
        this._shellwm.connect('minimize', this._windowDisappearing.bind(this));
        this._shellwm.connect('destroy', this._windowDisappearing.bind(this));

        this._windowTracker = Shell.WindowTracker.get_default();
        this._windowTracker.connect('tracked-windows-changed', this._trackedWindowsChanged.bind(this));

        global.display.connect('in-fullscreen-changed', this._fullscreenChanged.bind(this));

        const primaryMonitor = Main.layoutManager.primaryMonitor;
        this._inFullscreen = primaryMonitor && primaryMonitor.inFullscreen;

        this._appSystem = Shell.AppSystem.get_default();
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

        function _isLastWindow(apps, win) {
            if (apps.length === 0)
                return true;

            if (apps.length > 1)
                return false;

            const windows = apps[0].get_windows();
            return windows.length === 1 && windows[0] === win;
        }

        const visibleApps = this._getVisibleApps();
        if (_isLastWindow(visibleApps, actor.meta_window))
            Main.layoutManager.showOverview();
    }

    _updateOverview() {
        if (!this._enabled)
            return;

        const visibleApps = this._getVisibleApps();
        if (visibleApps.length === 0)
            Main.overview.show();
        else if (this._inFullscreen)
            // Hide in fullscreen mode
            Main.overview.hide();
    }

    _windowDisappeared() {
        this._updateOverview();
    }

    _trackedWindowsChanged() {
        if (!this._enabled)
            return;

        const visibleApps = this._getVisibleApps();
        const isShowingAppsGrid =
            Main.overview.visible &&
            Main.overview.getActivePage() === ViewSelector.ViewPage.APPS;

        if (visibleApps.length > 0 && isShowingAppsGrid) {
            // Make sure to hide the apps grid so that running apps whose
            // windows are becoming visible are shown to the user.
            Main.overview.hide();
        } else {
            // Fallback to the default logic used for dissapearing windows.
            this._updateOverview();
        }
    }

    _getVisibleApps() {
        const runningApps = this._appSystem.get_running();
        return runningApps.filter(app => {
            for (const window of app.get_windows()) {
                // We do not count transient windows because of an issue with Audacity
                // where a transient window was always being counted as visible even
                // though it was minimized
                if (window.get_transient_for())
                    continue;

                if (!window.minimized)
                    return true;
            }

            return false;
        });
    }

    enable() {
        this._enabled = true;
        this._updateOverview();
    }

    disable() {
        this._enabled = false;
    }

    get hasActiveWindows() {
        // Count anything fullscreen as an extra window
        if (this._inFullscreen)
            return true;

        const apps = this._appSystem.get_running();
        return apps.length > 0;
    }

    get hasVisibleWindows() {
        // Count anything fullscreen as an extra window
        if (this._inFullscreen)
            return true;

        const visibleApps = this._getVisibleApps();
        return visibleApps.length > 0;
    }
});
