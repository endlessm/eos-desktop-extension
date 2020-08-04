/* exported override, restore, original, overrideProperty,
   isExtensionEnabled */

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;

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
