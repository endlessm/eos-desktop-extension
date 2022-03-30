// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
/* exported WorkspaceMonitor */

const { GLib, GObject, Meta, Shell } = imports.gi;

const Main = imports.ui.main;

var WorkspaceMonitor = GObject.registerClass(
class WorkspaceMonitor extends GObject.Object {
    _init() {
        super._init();

        this._shellwm = global.window_manager;
        this._windowGroup = global.window_group;
        this._display = global.display;

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
            Main.overview.showApps();
    }

    _updateOverview() {
        if (!this._enabled)
            return;

        if (!Main.overview._startupAnimationDone)
            return;

        const windows = this._getVisibleWindows();
        if (windows.length === 0)
            Main.overview.showApps();
        else if (this._inFullscreen)
            // Hide in fullscreen mode
            Main.overview.hide(true);
    }

    _windowDisappeared() {
        this._updateOverview();
    }

    _windowsChanged() {
        if (!this._enabled)
            return;

        if (this._updateWindowId)
            return;

        this._updateWindowId = GLib.timeout_add(
            GLib.PRIORITY_LOW,
            250,
            () => {
                const windows = this._getVisibleWindows();
                const overview = Main.overview;
                const isShowingAppsGrid =
                    overview.visible &&
                    !overview._overview.controls._searchController.searchActive;

                if (windows.length > 0 && isShowingAppsGrid) {
                    // Make sure to hide the apps grid so that running apps whose
                    // windows are becoming visible are shown to the user.
                    overview.hide(true);
                } else {
                    // Fallback to the default logic used for dissapearing windows.
                    this._updateOverview();
                }

                delete this._updateWindowId;
                return GLib.SOURCE_REMOVE;
            });
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

        this._wmMinimizeId =
            this._shellwm.connect('minimize', this._windowDisappearing.bind(this));
        this._wmDestroyId =
            this._shellwm.connect('destroy', this._windowDisappearing.bind(this));
        this._actorAddedId =
            this._windowGroup.connect('actor-added', this._windowsChanged.bind(this));
        this._actorRemovedId =
            this._windowGroup.connect('actor-removed', this._windowsChanged.bind(this));
        this._inFullscreenId =
            this._display.connect('in-fullscreen-changed', this._fullscreenChanged.bind(this));
    }

    disable() {
        this._enabled = false;

        if (this._updateWindowId) {
            GLib.source_remove(this._updateWindowId);
            delete this._updateWindowId;
        }

        this._shellwm.disconnect(this._wmMinimizeId);
        this._shellwm.disconnect(this._wmDestroyId);
        this._windowGroup.disconnect(this._actorAddedId);
        this._windowGroup.disconnect(this._actorRemovedId);
        this._display.disconnect(this._inFullscreenId);
    }

    get hasVisibleWindows() {
        // Count anything fullscreen as an extra window
        if (this._inFullscreen)
            return true;

        const windows = this._getVisibleWindows();
        return windows.length > 0;
    }
});
