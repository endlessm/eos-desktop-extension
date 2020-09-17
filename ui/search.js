/* exported enable, disable */
/*
 * Copyright 2020 Endless OS Foundation LLC
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

const { Clutter, St } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();

const InternetSearch = DesktopExtension.imports.ui.internetSearch;
const LayoutOverrides = DesktopExtension.imports.ui.layout;
const Main = imports.ui.main;
const ParentalControlsManager = imports.misc.parentalControlsManager;
const Search = imports.ui.search;
const Utils = DesktopExtension.imports.utils;

function addCloseButton() {
    const searchResults = Main.overview.viewSelector._searchResults;

    if (searchResults._closeButton)
        return;

    const closeButton = new St.Button({
        style_class: 'search-results-close-button',
        child: new St.Icon({ icon_name: 'window-close-symbolic' }),
        x_expand: true,
        x_align: Clutter.ActorAlign.END,
        y_expand: false,
        y_align: Clutter.ActorAlign.START,
    });

    closeButton.connect('clicked', () => {
        Main.overview.viewSelector.reset();
    });

    searchResults.insert_child_below(closeButton, null);
    searchResults._closeButton = closeButton;
}

function removeCloseButton() {
    const searchResults = Main.overview.viewSelector._searchResults;

    if (!searchResults._closeButton)
        return;

    searchResults._closeButton.destroy();
    delete searchResults._closeButton;
}

function addMaxWidthBoxInSearch() {
    const { viewSelector } = Main.overview;

    viewSelector._searchPage.remove_child(viewSelector._searchResults);

    const maxWidthBox = new Search.MaxWidthBox({
        name: 'searchResultsBox',
        x_expand: true,
    });
    maxWidthBox.add_child(viewSelector._searchResults);

    viewSelector._searchPage.child = maxWidthBox;
    viewSelector._searchResults.x_expand = true;
}

function removeMaxWidthBoxFromSearch() {
    const { viewSelector } = Main.overview;

    const maxWidthBox = viewSelector._searchResults.get_parent();
    maxWidthBox.remove_child(viewSelector._searchResults);

    viewSelector._searchPage.child = viewSelector._searchResults;
    maxWidthBox.destroy();

    viewSelector._searchResults.x_expand = false;
}

// Internet search provider

let parentalControlsSignalId = 0;
let internetSearchProvider = null

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

        const searchView = Main.overview.viewSelector._searchResults;

        searchView._registerProvider(provider);
        internetSearchProvider = provider;

        searchView._reloadRemoteProviders();

        // Update the search entry text
        const entry = Main.overview.searchEntry;
        const searchEngine = InternetSearch.getSearchEngineName();
        if (searchEngine)
            entry.hint_text = _('Search %s and more…').format(searchEngine);
        else
            entry.hint_text = _('Search the internet and more…');

        LayoutOverrides.setSearchHint(entry.hint_text);
    }
}

function unregisterInternetSearchProvider() {
    if (!internetSearchProvider)
        return;

    const searchView = Main.overview.viewSelector._searchResults;
    searchView._unregisterProvider(internetSearchProvider);
    internetSearchProvider = null;

    searchView._reloadRemoteProviders();

    // Reset the search entry text
    Main.overview.searchEntry.hint_text = _('Type to search');
    LayoutOverrides.setSearchHint(_('Type to search'));
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
                    unregisterInternetSearchProvider()
                else
                    registerInternetSearchProvider();
            });
    } else {
        // Simplest case: disabling only removes the search provider period
        unregisterInternetSearchProvider();
    }
}

function enable() {
    Utils.override(Search.ProviderInfo, '_init', function(provider) {
        const original = Utils.original(Search.ProviderInfo, '_init');
        original.bind(this)(provider);

        this._content.vertical = true;
        for (const label of this._content.get_child_at_index(1))
            label.x_align = Clutter.ActorAlign.CENTER;
    });

    Utils.overrideProperty(Search.ProviderInfo, 'PROVIDER_ICON_SIZE', {
        get: function() { return 64 },
    });

    setInternetSearchProviderEnable(true);
    addMaxWidthBoxInSearch();
    addCloseButton();
}

function disable() {
    Utils.restore(Search.ProviderInfo);

    setInternetSearchProviderEnable(false);
    removeMaxWidthBoxFromSearch();
    removeCloseButton();
}
