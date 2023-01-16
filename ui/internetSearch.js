/* exported getInternetSearchProvider, getSearchEngineName */

const { GLib, Gio, Json, Shell } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const DesktopExtension = ExtensionUtils.getCurrentExtension();
const _ = DesktopExtension.imports.utils.gettext;

// http://stackoverflow.com/questions/4691070/validate-url-without-www-or-http
const _searchUrlRegexp = new RegExp(
    '^([a-zA-Z0-9]+(\.[a-zA-Z0-9]+)+.*)\\.+[A-Za-z0-9\.\/%&=\?\-_]+$',
    'gi');

const supportedSearchSchemes = ['http', 'https', 'ftp'];

const FALLBACK_BROWSER_ID = 'org.chromium.Chromium.desktop';
const GOOGLE_CHROME_ID = 'google-chrome.desktop';

// _findSearchUrls:
// @terms: list of searchbar terms to find URLs in
// @maxLength: maximum number of characters in each non-URI term to match against, defaults
//             to 32 characters to prevent hogging the CPU with too long generic strings.
//
// Similar to "findUrls", but adapted for use only with terms from the searchbar.
//
// In order not to be too CPU-expensive, this function is implemented in the following way:
//   1. If the term is a valid URI in that it's possible to parse at least
//      its scheme and host fields, it's considered a valid URL "as-is".
//   2. Else, if the term is a generic string exceeding the maximum length
//      specified then we simply ignore it and move onto the next term.
//   3. In any other case (non-URI term, valid length) we match the term
//      passed against the regular expression to determine if it's a URL.
//
// Note that the regex for these URLs matches strings such as "google.com" (no need to the
// specify a preceding scheme), which is why we have to limit its execution to a certain
// maximum length, as the term can be pretty free-form. By default, this maximum length
// is 32 characters, which should be a good compromise considering that "many of the world's
// most visited web sites have domain names of between 6 - 10 characters" (see [1][2]).
//
// [1] https://www.domainregistration.com.au/news/2013/1301-domain-length.php
// [2] https://www.domainregistration.com.au/infocentre/info-domain-length.php
//
// Return value: the list of URLs found in the string
function _findSearchUrls(terms, maxLength = 32) {
    const res = [];
    let match;
    for (const term of terms) {
        if (GLib.uri_parse_scheme(term)) {
            let supportedScheme = false;
            for (let scheme of supportedSearchSchemes) {
                if (term.startsWith('%s://'.format(scheme))) {
                    supportedScheme = true;
                    break;
                }
            }

            // Check that there's a valid host after the scheme part.
            if (supportedScheme && term.split('://')[1]) {
                res.push(term);
                continue;
            }
        }

        // Try to save CPU cycles from regexp-matching too long strings.
        if (term.length > maxLength)
            continue;

        while ((match = _searchUrlRegexp.exec(term)))
            res.push(match[0]);
    }
    return res;
}

function _getBrowserId() {
    const app =
        Gio.app_info_get_default_for_type('x-scheme-handler/http', true);
    return app ? app.get_id() : FALLBACK_BROWSER_ID;
}

function _getBrowserApp() {
    const id = _getBrowserId();
    const appSystem = Shell.AppSystem.get_default();
    return appSystem.lookup_app(id);
}

function _getJsonSearchEngine(configDir, folder) {
    const parser = new Json.Parser();
    const path = GLib.build_filenamev([
        configDir,
        folder,
        'Default',
        'Preferences',
    ]);

    /*
     * Translators: this is the name of the search engine that shows in the
     * Shell's desktop search entry.
     */
    let defaultString = _('Google');

    try {
        parser.load_from_file(path);
    } catch (e) {
        if (e.matches(GLib.FileError, GLib.FileError.NOENT))
            return defaultString;

        logError(e, 'error while parsing %s'.format(path));
        return null;
    }

    const root = parser.get_root().get_object();

    const searchProviderDataNode = root.get_member('default_search_provider_data');
    if (!searchProviderDataNode || searchProviderDataNode.get_node_type() !== Json.NodeType.OBJECT)
        return defaultString;

    const searchProviderData = searchProviderDataNode.get_object();
    if (!searchProviderData)
        return defaultString;

    const templateUrlDataNode = searchProviderData.get_member('template_url_data');
    if (!templateUrlDataNode || templateUrlDataNode.get_node_type() !== Json.NodeType.OBJECT)
        return defaultString;

    const templateUrlData = templateUrlDataNode.get_object();
    if (!templateUrlData)
        return defaultString;

    const shortNameNode = templateUrlData.get_member('short_name');
    if (!shortNameNode || shortNameNode.get_node_type() !== Json.NodeType.VALUE)
        return defaultString;

    return shortNameNode.get_string();
}

function getSearchEngineName() {
    const browser = _getBrowserId();

    if (browser === FALLBACK_BROWSER_ID) {
        const configDir = GLib.build_filenamev([GLib.get_home_dir(),
            '.var', 'app', 'org.chromium.Chromium', 'config']);
        return _getJsonSearchEngine(configDir, 'chromium');
    }

    if (browser === GOOGLE_CHROME_ID)
        return _getJsonSearchEngine(GLib.get_user_config_dir(), 'google-chrome');

    return null;
}

// Returns a plain URI if the user types in
// something like "facebook.com"
function getURIForSearch(terms) {
    const searchedUris = _findSearchUrls(terms);
    // Make sure search contains only a uri
    // Avoid cases like "what is github.com"
    if (searchedUris.length === 1 && terms.length === 1) {
        const uri = searchedUris[0];
        // Ensure all uri has a scheme name
        if (!GLib.uri_parse_scheme(uri))
            uri = 'http://'.format(uri);

        return uri;
    } else {
        return null;
    }
}

function getInternetSearchProvider() {
    const browserApp = _getBrowserApp();

    if (!browserApp)
        return null;

    return new InternetSearchProvider(browserApp);
}

var InternetSearchProvider = class {
    constructor(browserApp) {
        this.id = 'internet';
        this.appInfo = browserApp.get_app_info();
        this.canLaunchSearch = true;
        this.isRemoteProvider = false;

        this._engineNameParsed = false;
        this._engineName = null;

        this._networkMonitor = Gio.NetworkMonitor.get_default();
    }

    _getEngineName() {
        if (!this._engineNameParsed) {
            this._engineNameParsed = true;
            this._engineName = getSearchEngineName();
        }

        return this._engineName;
    }

    _launchURI(uri) {
        try {
            this.appInfo.launch_uris([uri], null);
        } catch (e) {
            logError(e, 'error while launching browser for uri: %s'.format(uri));
        }
    }

    getResultMetas(results, callback) {
        const metas = results.map(resultId => {
            let name;
            if (resultId.startsWith('uri:')) {
                const uri = resultId.slice('uri:'.length);
                name = _('Open "%s" in browser').format(uri);
            } else if (resultId.startsWith('search:')) {
                const query = resultId.slice('search:'.length);
                const engineName = this._getEngineName();

                if (engineName) {
                    /* Translators: the first placeholder is the search engine name, and the second
                     * is the search string. For instance, 'Search Google for "hello"'.
                     */
                    name = _('Search %1$s for "%2$s"').format(engineName, query);
                } else {
                    name = _('Search the internet for "%s"').format(query);
                }
            }

            return {
                id: resultId,
                name,
                // We will already have an app icon next to our result,
                // so we don't need an individual result icon.
                createIcon() {
                    return null;
                },
            };
        });
        callback(metas);
    }

    filterResults(results, maxNumber) {
        return results.slice(0, maxNumber);
    }

    getInitialResultSet(terms, callback, _cancellable) {
        const results = [];

        log(`Internet search, terms: ${terms}`);

        if (this._networkMonitor.network_available) {
            const uri = getURIForSearch(terms);
            const query = terms.join(' ');
            if (uri)
                results.push('uri:%s'.format(query));
            else
                results.push('search:%s'.format(query));
        }

        callback(results);
    }

    getSubsearchResultSet(previousResults, terms, callback, cancellable) {
        this.getInitialResultSet(terms, callback, cancellable);
    }

    activateResult(metaId) {
        if (metaId.startsWith('uri:')) {
            const uri = metaId.slice('uri:'.length);
            uri = getURIForSearch([uri]);
            this._launchURI(uri);
        } else if (metaId.startsWith('search:')) {
            const query = metaId.slice('search:'.length);
            this._launchURI('? '.concat(query));
        }
    }

    launchSearch(terms) {
        this.getInitialResultSet(terms, results => {
            if (results)
                this.activateResult(results[0]);
        });
    }
};
