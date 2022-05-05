/* exported IconGridLayout */

/*
 *  Copyright 2020 Endless OS Foundation LLC
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

const { Gio, GLib, GObject, Json, Shell } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const Dirs = DesktopExtension.imports.dirs;
const ParentalControlsManager = imports.misc.parentalControlsManager;

var DESKTOP_GRID_ID = 'desktop';

const SCHEMA_KEY = 'icon-grid-layout';
const DIRECTORY_EXT = '.directory';

const DEFAULT_CONFIGS_DIR = `${Dirs.DATADIR}/eos-shell-content/icon-grid-defaults`;
const DEFAULT_CONFIG_NAME_BASE = 'icon-grid';

const OVERRIDE_CONFIGS_DIR = `${Dirs.LOCALSTATEDIR}/lib/eos-image-defaults/icon-grid`;
const OVERRIDE_CONFIG_NAME_BASE = 'icon-grid';
const PREPEND_CONFIG_NAME_BASE = 'icon-grid-prepend';
const APPEND_CONFIG_NAME_BASE = 'icon-grid-append';

var IconGridLayout = GObject.registerClass(
class IconGridLayout extends GObject.Object {
    _init(settings) {
        super._init();

        this._settings = settings;

        this._parentalControlsManager = ParentalControlsManager.getDefault();
        this._parentalControlsManager.connect('app-filter-changed', () => {
            this._updateIconTree();
        });

        this._updateIconTree();

        this._removeUndone = false;
    }

    _getIconTreeFromVariant(allIcons) {
        let iconTree = {};
        let appSys = Shell.AppSystem.get_default();

        for (let i = 0; i < allIcons.n_children(); i++) {
            let context = allIcons.get_child_value(i);
            let [folder] = context.get_child_value(0).get_string();
            let children = context.get_child_value(1).get_strv();

            children = children.filter(appId => {
                const app = appSys.lookup_alias(appId);
                if (!app)
                    return true;

                // Ensure the app is not blacklisted.
                return this._parentalControlsManager.shouldShowApp(app.get_app_info());
            });

            iconTree[folder] = children.map(appId => {
                // Some older versions of eos-app-store incorrectly added eos-app-*.desktop
                // files to the icon grid layout, instead of the proper unprefixed .desktop
                // files, which should never leak out of the Shell. Take these out of the
                // icon layout.
                if (appId.startsWith('eos-app-'))
                    return appId.slice('eos-app-'.length);

                // Some apps have their name superseded, for instance gedit -> org.gnome.gedit.
                // We want the new name, not the old one.
                const app = appSys.lookup_alias(appId);
                if (app)
                    return app.get_id();

                return appId;
            });
        }

        return iconTree;
    }

    _updateIconTree() {
        let allIcons = this._settings.get_value(SCHEMA_KEY);
        let iconTree = this._getIconTreeFromVariant(allIcons);
        const nIcons = allIcons.n_children();

        if (nIcons > 0 && !iconTree[DESKTOP_GRID_ID]) {
            // Missing toplevel desktop ID indicates we are reading a
            // corrupted setting. Reset grid to defaults, and let the logic
            // below run after the GSettings notification
            log('Corrupted icon-grid-layout detected, resetting to defaults');
            this._settings.reset(SCHEMA_KEY);
            return;
        }

        if (nIcons === 0) {
            // Entirely empty indicates that we need to read in the defaults
            allIcons = this._getDefaultIcons();
            iconTree = this._getIconTreeFromVariant(allIcons);
        }

        this._iconTree = iconTree;
    }

    _loadConfigJsonString(dir, base) {
        let jsonString = null;
        GLib.get_language_names()
            .filter(name => name.indexOf('.') === -1)
            .map(name => {
                const path = GLib.build_filenamev([dir,
                    `${base}-${name}.json`]);
                return Gio.File.new_for_path(path);
            })
            .some(defaultsFile => {
                try {
                    const [, data] = defaultsFile.load_contents(null);
                    jsonString = imports.byteArray.toString(data);
                    return true;
                } catch (e) {
                    // Ignore errors, as we always have a fallback
                }
                return false;
            });
        return jsonString;
    }

    _mergeJsonStrings(base, override, prepend, append) {
        let baseNode = {};
        let prependNode = null;
        let appendNode = null;
        // If any image default override matches the user's locale,
        // give that priority over the default from the base OS
        if (override)
            baseNode = JSON.parse(override);
        else if (base)
            baseNode = JSON.parse(base);

        if (prepend)
            prependNode = JSON.parse(prepend);

        if (append)
            appendNode = JSON.parse(append);

        for (let key in baseNode) {
            if (prependNode && prependNode[key])
                baseNode[key] = prependNode[key].concat(baseNode[key]);

            if (appendNode && appendNode[key])
                baseNode[key] = baseNode[key].concat(appendNode[key]);
        }
        return JSON.stringify(baseNode);
    }

    _getDefaultIcons() {
        let iconTree = null;

        try {
            let mergedJson = this._mergeJsonStrings(
                this._loadConfigJsonString(DEFAULT_CONFIGS_DIR, DEFAULT_CONFIG_NAME_BASE),
                this._loadConfigJsonString(OVERRIDE_CONFIGS_DIR, OVERRIDE_CONFIG_NAME_BASE),
                this._loadConfigJsonString(OVERRIDE_CONFIGS_DIR, PREPEND_CONFIG_NAME_BASE),
                this._loadConfigJsonString(OVERRIDE_CONFIGS_DIR, APPEND_CONFIG_NAME_BASE));
            iconTree = Json.gvariant_deserialize_data(mergedJson, -1, 'a{sas}');
        } catch (e) {
            logError(e, 'Failed to read JSON config');
        }

        if (iconTree === null || iconTree.n_children() === 0) {
            log('No icon grid defaults found!');

            // At the minimum, put in something that avoids exceptions later
            const fallback = {};
            fallback[DESKTOP_GRID_ID] = [];
            iconTree = GLib.Variant.new('a{sas}', fallback);
        }

        return iconTree;
    }

    hasIcon(id) {
        for (let folderId in this._iconTree) {
            let folder = this._iconTree[folderId];
            if (folder.indexOf(id) !== -1)
                return true;
        }

        return false;
    }

    getIcons(folder) {
        if (this._iconTree && this._iconTree[folder])
            return this._iconTree[folder];

        return [];
    }

    iconIsFolder(id) {
        return id && id.endsWith(DIRECTORY_EXT);
    }

    listApplications() {
        const allApplications = [];

        for (let folderId in this._iconTree) {
            let folder = this._iconTree[folderId];
            for (let iconIdx in folder) {
                let icon = folder[iconIdx];
                if (!this.iconIsFolder(icon))
                    allApplications.push(icon);
            }
        }

        return allApplications;
    }
});

