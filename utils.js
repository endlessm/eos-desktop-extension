/* exported getSettings, override, overrideProperty,
   restore, original, tryMigrateSettings */

const { Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();

const Main = imports.ui.main;

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

function overrideProperty(object, propertyName, descriptor) {
    if (!object._desktopPropOverrides)
        object._desktopPropOverrides = {};

    const baseObject = object.prototype || object;
    const originalProperty =
        Object.getOwnPropertyDescriptor(baseObject, propertyName);
    object._desktopPropOverrides[propertyName] = originalProperty;
    Object.defineProperty(baseObject, propertyName, descriptor);
}

function restore(object) {
    const baseObject = object.prototype || object;
    if (object._desktopFnOverrides) {
        Object.keys(object._desktopFnOverrides).forEach(k => {
            baseObject[k] = object._desktopFnOverrides[k];
        });
        delete object._desktopFnOverrides;
    }
    if (object._desktopPropOverrides) {
        Object.keys(object._desktopPropOverrides).forEach(k => {
            Object.defineProperty(baseObject, k,
                object._desktopPropOverrides[k]);
        });
        delete object._desktopPropOverrides;
    }
}

function original(object, methodName) {
    return object._desktopFnOverrides[methodName];
}

function isExtensionEnabled(uuid) {
    const extension = Main.extensionManager.lookup(uuid);

    return extension &&
        extension.state === ExtensionUtils.ExtensionState.ENABLED;
}
