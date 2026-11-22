/**
 * What is (or was) on screen during a ride — the media state, the recorder's record of it, and the saved ride's `media` field.
 * 'youtube' is the in-WebView player (scenic routes and guided rides); 'app' is any native media app launched behind the overlay
 * (Netflix, YouTube, Prime, Kindle, …), with its name in `title`. (Rides saved by older builds may still carry 'netflix'/'kindle';
 * read paths treat the kind as a plain string, so those still display.)
 */
export type MediaKind = 'none' | 'youtube' | 'app'
