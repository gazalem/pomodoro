/**
 * URL prefix when the app is served from a sub-path, e.g. "/pomodoro" on
 * GitHub Pages (https://<user>.github.io/pomodoro). Empty at the domain root.
 * Next adds it to <Link> and bundled assets itself; use this for hand-written
 * URLs such as files in /public.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
