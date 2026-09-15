/*
 * The app does not always live at the server root: a war dropped into a standalone Tomcat
 * is served under a context path taken from its file name. So API URLs are resolved against
 * this module's own location instead of "/".
 *
 * import.meta.url is the absolute URL of this file, which makes the base correct even when
 * the page was opened without a trailing slash - where a plain relative path would resolve
 * one directory too high.
 */
const BASE = new URL('.', import.meta.url);

export function apiUrl(path) {
	return new URL(path, BASE).href;
}
