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
    // PRESSURE voice: the one hard sound, the rescue whoosh, ignition, exit.
    hurt: 'sfx-hurt',
    disappear: 'sfx-disappear',
    /** The combo tier stinger — pitched up the pentatonic ladder per tier. */
    magic: 'sfx-magic',
    /** The bank tally voice — the detune-then-tally phrase's coins. */
    coin: 'sfx-coin',
} as const;

/** Runtime-generated textures (no files) — keys still live in the manifest. */
export const Gen = {
    dust: 'gen-dust',
    streak: 'gen-streak',
    /** Vertical white gradient (bright bottom, clear top) — PRESSURE's glow bands. */
    glowBand: 'gen-glow-band',
    /** Soft radial glow — the combo ladder's earned character light. */
    glow: 'gen-glow',
    /** Opaque white-to-near-black vertical falloff — tinted per act, it is
     *  the consumed zone: the world ending from below (pressure.md). */
    consumeGradient: 'gen-consume-gradient',
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

/** The five Kenney character colors — RETURN's five characters. */
export const CHARACTER_COLORS = ['beige', 'green', 'pink', 'purple', 'yellow'] as const;

export type CharacterFrameSet = { [K in keyof typeof CharFrame]: string };

/** Per-color frame set, same shape as CharFrame (the Beige default above).
 *  Unknown colors fail loud — a frame typo is a bug, never a blank sprite. */
export function characterFrames(color: string): CharacterFrameSet {
    if (!(CHARACTER_COLORS as readonly string[]).includes(color)) {
        throw new Error(`assets: unknown character color "${color}"`);
    }
    return {
        idle: `character_${color}_idle`,
        walkA: `character_${color}_walk_a`,
        walkB: `character_${color}_walk_b`,
        jump: `character_${color}_jump`,
        duck: `character_${color}_duck`,
        front: `character_${color}_front`,
    };
}

/** Frame names inside the tiles atlas used by the act-1 sandbox. */
export const TileFrame = {
    platformLeft: 'terrain_grass_horizontal_left',
    platformMiddle: 'terrain_grass_horizontal_middle',
    platformRight: 'terrain_grass_horizontal_right',
    groundTop: 'terrain_grass_block_top',
    groundFill: 'terrain_grass_block_center',
    wallColumn: 'terrain_grass_vertical_middle',
    // PRESSURE: the exit door and the act-1 grass-fire skin.
    doorBottom: 'door_open',
    doorTop: 'door_open_top',
    fireEdge: 'lava_top',
    fireball: 'fireball',
    // IDENTITY: coin pickups and the four timed-powerup spawns.
    coinGold: 'coin_gold',
    powerupSpring: 'spring',
    powerupCoinStorm: 'block_coin',
    powerupGhost: 'gem_blue',
    powerupOverdrive: 'star',
} as const;

/** HUD frames inside the tiles atlas (pack `hud_*` sprites before custom art). */
export const HudFrame = {
    heartFull: 'hud_heart',
    heartEmpty: 'hud_heart_empty',
    coin: 'hud_coin',
} as const;

/** CHOICE: node-type icons on the map's glowing windows (tiles atlas). The
 *  silhouette carries the shape; cards carry the detail (map-modifiers.md). */
export const MapIconFrame = {
    coinRush: 'coin_gold',
    challenge: 'bomb',
    elite: 'saw',
    shop: 'sign',
    mystery: 'star',
    boss: 'flag_red_a',
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
    load.audio(Sfx.hurt, 'Sounds/sfx_hurt.ogg');
    load.audio(Sfx.disappear, 'Sounds/sfx_disappear.ogg');
    load.audio(Sfx.magic, 'Sounds/sfx_magic.ogg');
    load.audio(Sfx.coin, 'Sounds/sfx_coin.ogg');
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
    if (!scene.textures.exists(Gen.glowBand)) {
        // Stepped alpha bands read as a smooth gradient once tinted/scaled.
        const g = scene.add.graphics();
        const bands = 16;
        for (let i = 0; i < bands; i += 1) {
            g.fillStyle(0xffffff, ((i + 1) / bands) ** 2);
            g.fillRect(0, i * 4, 32, 4);
        }
        g.generateTexture(Gen.glowBand, 32, bands * 4);
        g.destroy();
    }
    if (!scene.textures.exists(Gen.glow)) {
        // Concentric falloff — a soft radial glow without gradient support.
        const g = scene.add.graphics();
        for (let r = 32; r >= 4; r -= 4) {
            g.fillStyle(0xffffff, 0.1 * (1 - r / 40));
            g.fillCircle(32, 32, r);
        }
        g.generateTexture(Gen.glow, 64, 64);
        g.destroy();
    }
    if (!scene.textures.exists(Gen.consumeGradient)) {
        // Opaque brightness falloff, white at the top to near-black at the
        // bottom: tint multiplies, so per-act consumption palettes are one
        // setTint away (grass-fire orange now; sandstorm/void later).
        const g = scene.add.graphics();
        const bands = 64;
        for (let i = 0; i < bands; i += 1) {
            // Steep falloff: the consumption reads within half a screen —
            // edge-bright at the front, near-black by the time it matters.
            const v = Math.round(Math.max(0.04, (1 - i / bands) ** 2.6) * 255);
            g.fillStyle((v << 16) | (v << 8) | v, 1);
            g.fillRect(0, i * 4, 32, 4);
        }
        g.generateTexture(Gen.consumeGradient, 32, bands * 4);
        g.destroy();
    }
}
