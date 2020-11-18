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
const _ = DesktopExtension.imports.utils.gettext;

const AppDisplay = imports.ui.appDisplay;
const IconGridLayout = DesktopExtension.imports.ui.iconGridLayout
const Main = imports.ui.main;
const ParentalControlsManager = imports.misc.parentalControlsManager;

const CURRENT_VERSION = 1;
const EOS_LINK_PREFIX = 'eos-link-';
const APP_CENTER_ID = 'org.gnome.Software.desktop';
const CLUBHOUSE_ID = 'com.hack_computer.Clubhouse.desktop';

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

function _migrateToV1(migrationSettings, extensionSettings) {
    const folderSettings = new Gio.Settings({
        schema_id: 'org.gnome.desktop.app-folders',
    });

    const itemsPerPage =
        Main.overview.viewSelector.appDisplay._grid.itemsPerPage;
    const pages = [];

    const appSys = Shell.AppSystem.get_default();
    const installedApps = appSys.get_installed().sort((a, b) =>
        a.get_name().localeCompare(b.get_name()));
    const installedAppsSet = new Set(installedApps.map(app => app.get_id()));

    const iconGridLayout =
        new IconGridLayout.IconGridLayout(migrationSettings);
    const desktopIcons =
        iconGridLayout.getIcons(IconGridLayout.DESKTOP_GRID_ID);

    let index = 0;
    const addedItems = new Set();

    // Add the clubhouse icon
    _addIcon(pages, CLUBHOUSE_ID, index++, itemsPerPage);
    addedItems.add(CLUBHOUSE_ID);

    for (const itemId of desktopIcons) {
        const isFolder = iconGridLayout.iconIsFolder(itemId);

        let id = itemId;
        if (isFolder) {
            const folderIcons = iconGridLayout.getIcons(itemId);
            const translatedName =
                Shell.util_get_translated_folder_name(itemId);

            if (translatedName)
                translatedName = _('Unnamed Folder');

            id = _createFolder(folderSettings, translatedName, folderIcons);
        } else if (!installedAppsSet.has(itemId)) {
            continue;
        }

        // If we have more than 24 icons, make sure that the app center icon
        // appended to the first page
        if (index === itemsPerPage - 1) {
            _addIcon(pages, APP_CENTER_ID, index++, itemsPerPage);
            addedItems.add(APP_CENTER_ID);
        }

        _addIcon(pages, id, index++, itemsPerPage);
        addedItems.add(itemId);
    }

    // Append the app center icon if it wasn't added in the loop above
    if (!addedItems.has(APP_CENTER_ID)) {
        _addIcon(pages, APP_CENTER_ID, index++, itemsPerPage);
        addedItems.add(APP_CENTER_ID);
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
            appsInsideFolders.has(appId) ||
            appId.startsWith(EOS_LINK_PREFIX))
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
