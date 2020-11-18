/* exported enable, disable */

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

const { Shell } = imports.gi;

let overriden = false;

function enable() {
    const appSystem = Shell.AppSystem.get_default();
    if (!appSystem.lookup_alias) {
        appSystem.lookup_alias = appSystem.lookup_app;
        overriden = true;
    }
}

function disable() {
    const appSystem = Shell.AppSystem.get_default();
    if (overriden) {
        delete appSystem.lookup_alias;
        overriden = false;
    }
}
