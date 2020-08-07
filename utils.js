/* exported getSettings, override, restore, original, tryMigrateSettings */

const { Gio } = imports.gi;

const Extension = imports.misc.extensionUtils.getCurrentExtension();

function getMigrationSettings() {
    const dir = Extension.dir.get_child('migration').get_path();
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

function getSettings() {
    const dir = Extension.dir.get_child('schemas').get_path();
    const source = Gio.SettingsSchemaSource.new_from_directory(dir,
        Gio.SettingsSchemaSource.get_default(), false);

    if (!source)
        throw new Error('Error Initializing the thingy.');

    const settingsSchema =
      source.lookup('com.endlessm.desktop-extension', false);

    if (!settingsSchema)
        throw new Error('Schema missing.');

    return new Gio.Settings({ settingsSchema });
}

function tryMigrateSettings() {
    const oldSettings = getMigrationSettings();

    log(`To be implemented: ${oldSettings}`);
}

function override(object, methodName, callback) {
    if (!object._desktopFnOverrides)
        object._desktopFnOverrides = {};

    const baseObject = object.prototype || object;
    const originalMethod = baseObject[methodName];
    object._desktopFnOverrides[methodName] = originalMethod;
    baseObject[methodName] = callback;
}

function restore(object) {
    const baseObject = object.prototype || object;
    if (object._desktopFnOverrides) {
        Object.keys(object._desktopFnOverrides).forEach(k => {
            baseObject[k] = object._desktopFnOverrides[k];
        });
        delete object._desktopFnOverrides;
    }
}

function original(object, methodName) {
    return object._desktopFnOverrides[methodName];
}
