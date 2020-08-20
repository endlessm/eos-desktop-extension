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

const Main = imports.ui.main;

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
    setSearchResultsXAlign(Clutter.ActorAlign.CENTER);
    addCloseButton();
}

function disable() {
    setSearchResultsXAlign(Clutter.ActorAlign.FILL);
    removeCloseButton();
}
