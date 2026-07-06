import type { Loader, Scene } from 'phaser';

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
    backgroundHills: 'bg-hills',
    backgroundHillsFade: 'bg-hills-fade',
    backgroundClouds: 'bg-clouds',
    backgroundGrass: 'bg-grass',
} as const;

export const Sfx = {
    select: 'sfx-select',
    jump: 'sfx-jump',
    jumpHigh: 'sfx-jump-high',
    bump: 'sfx-bump',
    gem: 'sfx-gem',
} as const;

/** Runtime-generated textures (no files) — keys still live in the manifest. */
export const Gen = {
    dust: 'gen-dust',
    streak: 'gen-streak',
} as const;

/** Frame names inside the character atlas — swappable with the art. */
export const CharFrame = {
    idle: 'character_beige_idle',
    walkA: 'character_beige_walk_a',
    walkB: 'character_beige_walk_b',
    jump: 'character_beige_jump',
    duck: 'character_beige_duck',
    front: 'character_beige_front',
} as const;

/** Frame names inside the tiles atlas used by the act-1 sandbox. */
export const TileFrame = {
    platformLeft: 'terrain_grass_horizontal_left',
    platformMiddle: 'terrain_grass_horizontal_middle',
    platformRight: 'terrain_grass_horizontal_right',
    groundTop: 'terrain_grass_block_top',
    groundFill: 'terrain_grass_block_center',
    wallColumn: 'terrain_grass_vertical_middle',
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
    load.image(Img.backgroundHills, 'Sprites/Backgrounds/Default/background_color_hills.png');
    load.image(Img.backgroundHillsFade, 'Sprites/Backgrounds/Default/background_fade_hills.png');
    load.image(Img.backgroundClouds, 'Sprites/Backgrounds/Default/background_clouds.png');
    load.image(Img.backgroundGrass, 'Sprites/Backgrounds/Default/background_solid_grass.png');
    load.audio(Sfx.select, 'Sounds/sfx_select.ogg');
    load.audio(Sfx.jump, 'Sounds/sfx_jump.ogg');
    load.audio(Sfx.jumpHigh, 'Sounds/sfx_jump-high.ogg');
    load.audio(Sfx.bump, 'Sounds/sfx_bump.ogg');
    load.audio(Sfx.gem, 'Sounds/sfx_gem.ogg');
}

/** Create the tiny procedural particle textures once per game. */
export function ensureGeneratedTextures(scene: Scene): void {
    if (!scene.textures.exists(Gen.dust)) {
        const g = scene.add.graphics();
        g.fillStyle(0xffffff, 1);
        g.fillCircle(4, 4, 4);
        g.generateTexture(Gen.dust, 8, 8);
        g.destroy();
    }
    if (!scene.textures.exists(Gen.streak)) {
        const g = scene.add.graphics();
        g.fillStyle(0xffffff, 1);
        g.fillRect(0, 0, 18, 2);
        g.generateTexture(Gen.streak, 18, 2);
        g.destroy();
    }
}
