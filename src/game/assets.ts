import type { Loader } from 'phaser';

/**
 * Central asset manifest. Scenes load through this module and systems
 * reference these keys — raw path/key strings never appear elsewhere.
 */
export const KENNEY_ROOT = 'assets/kenney_new-platformer-pack-1.0';

export const Atlas = {
    characters: 'atlas-characters',
    tiles: 'atlas-tiles',
} as const;

export const Img = {
    backgroundSky: 'bg-sky',
} as const;

export const Sfx = {
    select: 'sfx-select',
} as const;

export function loadCoreAssets(load: Loader.LoaderPlugin): void {
    load.setPath(KENNEY_ROOT);
    load.atlasXML(
        Atlas.characters,
        'Spritesheets/spritesheet-characters-default.png',
        'Spritesheets/spritesheet-characters-default.xml',
    );
    load.atlasXML(
        Atlas.tiles,
        'Spritesheets/spritesheet-tiles-default.png',
        'Spritesheets/spritesheet-tiles-default.xml',
    );
    load.image(Img.backgroundSky, 'Sprites/Backgrounds/Default/background_solid_sky.png');
    load.audio(Sfx.select, 'Sounds/sfx_select.ogg');
}
