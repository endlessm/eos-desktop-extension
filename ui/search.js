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

const Main = imports.ui.main;
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

function setSearchResultsXAlign(align) {
    const { viewSelector } = Main.overview;
    viewSelector._searchResults.x_align = align;
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

    setSearchResultsXAlign(Clutter.ActorAlign.CENTER);
    addCloseButton();
}

function disable() {
    Utils.restore(Search.ProviderInfo);

    setSearchResultsXAlign(Clutter.ActorAlign.FILL);
    removeCloseButton();
}
