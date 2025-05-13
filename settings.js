/* exported migrate, maybeCancelMigration */

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

const { Gio, GLib, Shell } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();
const GS_ = DesktopExtension.imports.utils.GS_;

const AppDisplay = imports.ui.appDisplay;
const IconGridLayout = DesktopExtension.imports.ui.iconGridLayout;
const Main = imports.ui.main;
const ParentalControlsManager = imports.misc.parentalControlsManager;

const CURRENT_VERSION = 1;

function _getMigrationSettings() {
    const dir = DesktopExtension.dir.get_child('migration').get_path();
    const source = Gio.SettingsSchemaSource.new_from_directory(dir,
        Gio.SettingsSchemaSource.get_default(), false);

    if (!source)
        throw new Error('Error Initializing the thingy.');

    const settingsSchema =
      source.lookup('org.gnome.shell', false);

    if (!settingsSchema)
        throw new Error('Schema missing.');

    return new Gio.Settings({ settingsSchema });
}

function _createFolder(folderSettings, name, appIds) {
    const newFolderId = GLib.uuid_string_random();

    const folders = folderSettings.get_strv('folder-children');
    folders.push(newFolderId);
    folderSettings.set_strv('folder-children', folders);

    // Create the new folder
    const path = folderSettings.path.concat('folders/', newFolderId, '/');
    const newFolderSettings = new Gio.Settings({
        schema_id: 'org.gnome.desktop.app-folders.folder',
        path,
    });

    if (!newFolderSettings) {
        log('Error creating new folder');
        return null;
    }

    newFolderSettings.delay();
    newFolderSettings.set_string('name', name);
    newFolderSettings.set_strv('apps', appIds);
    newFolderSettings.apply();

    return newFolderId;
}

function _getAppsInsideFolder(installedApps, folder) {
    const appSys = Shell.AppSystem.get_default();
    const appIds = [];

    const excludedApps = folder.get_strv('excluded-apps');
    const addAppId = appId => {
        if (excludedApps.includes(appId))
            return;

        const app = appSys.lookup_alias(appId);
        if (!app)
            return;

        if (appIds.indexOf(appId) !== -1)
            return;

        appIds.push(appId);
    };

    const folderApps = folder.get_strv('apps');
    folderApps.forEach(addAppId);

    const folderCategories = folder.get_strv('categories');
    installedApps.forEach(appInfo => {
        const appCategories = AppDisplay._getCategories(appInfo);
        if (!AppDisplay._listsIntersect(folderCategories, appCategories))
            return;

        addAppId(appInfo.get_id());
    });

    return appIds;
}

function _addIcon(pages, itemId, index, itemsPerPage) {
    const page = Math.floor(index / itemsPerPage);

    if (page === pages.length)
        pages.push({});

    pages[page][itemId] = {
        position: GLib.Variant.new_int32(index % itemsPerPage),
    };
}

// Refer to https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/43.9/js/ui/appDisplay.js?ref_type=tags#L2266-2282
function _removeFolder(folderSettings, folderId) {
    let folderChildren = folderSettings.get_strv('folder-children');
    log(`folderChildren: ${folderChildren}`);

    var ix = folderChildren.indexOf(folderId);
    if (ix === -1) {
        log(`Folder ${folderId} not found`);
        return;
    }

    const path = `${folderSettings.path}folders/${folderId}/`;
    const folder = new Gio.Settings({
        schema_id: 'org.gnome.desktop.app-folders.folder',
        path,
    });

    log(`Cleaning up ${path}`);
    let keys = folder.settings_schema.list_keys();
    for (let key of keys)
        folder.reset(key);

    folderChildren.splice(ix, 1);

    log(`Remaining folder-children: ${folderChildren}`)
    folderSettings.set_strv('folder-children', folderChildren);
}

function _migrateToV1(migrationSettings, _extensionSettings) {
    const folderSettings = new Gio.Settings({
        schema_id: 'org.gnome.desktop.app-folders',
    });

    const itemsPerPage =
        Main.overview._overview.controls.appDisplay._grid.itemsPerPage;
    const pages = [];

    const appSys = Shell.AppSystem.get_default();
    const installedApps = appSys.get_installed().sort((a, b) =>
        a.get_name().localeCompare(b.get_name()));
    const installedAppsSet = new Set(installedApps.map(app => app.get_id()));

    const iconGridLayout =
        new IconGridLayout.IconGridLayout(migrationSettings);
    const desktopIcons =
        iconGridLayout.getIcons(IconGridLayout.DESKTOP_GRID_ID);

    // AppDisplay._ensureDefaultFolders() adds two hard-coded folders before
    // this extension has a chance to override it. However,
    // imports.ui.appDisplay's DEFAULT_FOLDERS constant is not exported.
    const DEFAULT_FOLDERS = {
        "X-GNOME-Utilities.directory": "Utilities",
        "suse-yast.directory": "YaST",
    };
    let DEFAULT_FOLDERS_KEYS = Object.keys(DEFAULT_FOLDERS);

    let index = 0;
    const addedItems = new Set();

    for (const itemId of desktopIcons) {
        const isFolder = iconGridLayout.iconIsFolder(itemId);

        let id = itemId;
        if (isFolder) {
            // Remove duplicated default folder. So, it does not interfere with
            // EOS icon grid defaults mechanism.
            if (DEFAULT_FOLDERS_KEYS.indexOf(itemId) != -1) {
                _removeFolder(folderSettings, DEFAULT_FOLDERS[itemId]);
            }

            const folderIcons = iconGridLayout.getIcons(itemId);
            let translatedName =
                Shell.util_get_translated_folder_name(itemId);

            if (!translatedName)
                translatedName = GS_('Unnamed Folder');

            id = _createFolder(folderSettings, translatedName, folderIcons);
        } else if (!installedAppsSet.has(itemId)) {
            continue;
        }

        _addIcon(pages, id, index++, itemsPerPage);
        addedItems.add(itemId);
    }

    // Switch to the next page
    index = itemsPerPage * Math.ceil(index / itemsPerPage);

    // Retrieve apps inside folders
    const appsInsideFolders = new Set();
    folderSettings.get_strv('folder-children').forEach(id => {
        const path = `${folderSettings.path}folders/${id}/`;
        const folder = new Gio.Settings({
            schema_id: 'org.gnome.desktop.app-folders.folder',
            path,
        });

        const folderApps = _getAppsInsideFolder(installedApps, folder);
        folderApps.forEach(appId => appsInsideFolders.add(appId));
    });

    for (const app of installedApps) {
        const appId = app.get_id();

        if (!app.should_show() ||
            addedItems.has(appId) ||
            appsInsideFolders.has(appId))
            continue;

        _addIcon(pages, appId, index++, itemsPerPage);
    }

    // Store the new page layout
    const packedPages = [];

    // Pack the icon properties as a GVariant
    for (const page of pages) {
        const pageData = {};
        for (const [appId, properties] of Object.entries(page))
            pageData[appId] = new GLib.Variant('a{sv}', properties);
        packedPages.push(pageData);
    }

    const variant = new GLib.Variant('aa{sv}', packedPages);
    global.settings.set_value('app-picker-layout', variant);
}

function applyMigration() {
    const migrationSettings = _getMigrationSettings();
    const extensionSettings = ExtensionUtils.getSettings();

    const migrationVTable = [
        _migrateToV1,
    ];

    let migrationVersion = extensionSettings.get_uint('migration-version');
    if (migrationVersion > migrationVTable.length - 1)
        return;

    while (migrationVersion < CURRENT_VERSION) {
        const migrationFunc = migrationVTable[migrationVersion];

        migrationFunc(migrationSettings, extensionSettings);
        migrationVersion++;

        extensionSettings.set_uint('migration-version', migrationVersion);
    }
}

function migrate() {
    return new Promise(resolve => {
        if (GLib.getenv('XDG_CURRENT_DESKTOP').toLowerCase().indexOf('endless') === -1) {
            resolve();
            return;
        }

        const parentalControls = ParentalControlsManager.getDefault();

        if (parentalControls.initialized) {
            applyMigration();
            resolve();
            return;
        }

        // Wait for parental controls to be ready, otherwise we
        // get an empty set of icons
        const id =
            parentalControls.connect('app-filter-changed', () => {
                if (!parentalControls.initialized)
                    return;

                applyMigration();
                parentalControls.disconnect(id);
                resolve();
            });
    });
}
