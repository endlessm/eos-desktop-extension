/* exported enable, disable */
/*
 * Copyright 2022 Endless OS Foundation LLC
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

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const InternetSearch = DesktopExtension.imports.ui.internetSearch;
const Main = imports.ui.main;
const Search = imports.ui.search;
const ParentalControlsManager = imports.misc.parentalControlsManager;
const Utils = DesktopExtension.imports.utils;

let parentalControlsSignalId = 0;
let internetSearchProvider = null;

function registerInternetSearchProvider() {
    if (internetSearchProvider)
        return;

    const parentalControls = ParentalControlsManager.getDefault();
    if (!parentalControls.initialized)
        return;

    const provider = InternetSearch.getInternetSearchProvider();

    if (provider) {
        // Don't register if parental controls doesn't allow us to
        if (!parentalControls.shouldShowApp(provider.appInfo))
            return;

        const overviewControls = Main.overview._overview.controls;
        const searchResults = overviewControls._searchController._searchResults;

        searchResults._registerProvider(provider);
        internetSearchProvider = provider;

        searchResults._reloadRemoteProviders();
    }
}

function unregisterInternetSearchProvider() {
    if (!internetSearchProvider)
        return;

    const overviewControls = Main.overview._overview.controls;
    const searchResults = overviewControls._searchController._searchResults;
    searchResults._unregisterProvider(internetSearchProvider);
    internetSearchProvider = null;

    searchResults._reloadRemoteProviders();
}

function setInternetSearchProviderEnable(enabled) {
    const parentalControls = ParentalControlsManager.getDefault();
    if (parentalControlsSignalId > 0) {
        parentalControls.disconnect(parentalControlsSignalId);
        parentalControlsSignalId = 0;
    }

    if (enabled) {
        registerInternetSearchProvider();

        // Monitor parental controls to either retry adding the search
        // provider, or remove if it the browser is filtered out
        parentalControlsSignalId =
            parentalControls.connect('app-filter-changed', () => {
                if (!parentalControls.initialized)
                    return;

                if (internetSearchProvider &&
                    !parentalControls.shouldShowApp(internetSearchProvider.appInfo))
                    unregisterInternetSearchProvider();
                else
                    registerInternetSearchProvider();
            });
    } else {
        // Simplest case: disabling only removes the search provider period
        unregisterInternetSearchProvider();
    }
}

function enable() {
    Utils.override(Search.SearchResult, function activate() {
        const original = Utils.original(Search.SearchResult, 'activate');
        original.call(this);
        // The original activate() calls Main.overview.toggle(), which hides
        // the overview, but (due to our customizations in overview.js) only if
        // windows are visible. We expect a window to appear whenever a search
        // result is activated, so we will force the overview to hide.
        Main.overview.hide(true);
    });

    Utils.override(Search.ListSearchResults, function _init(provider, resultsView) {
        const original = Utils.original(Search.ListSearchResults, '_init');
        original.call(this, provider, resultsView);
        this.providerInfo.connect('clicked', () => {
            Main.overview.hide(true);
        });
    });

    setInternetSearchProviderEnable(true);
}

function disable() {
    Utils.restore(Search.SearchResult);
    Utils.restore(Search.ListSearchResults);
    setInternetSearchProviderEnable(false);
}
