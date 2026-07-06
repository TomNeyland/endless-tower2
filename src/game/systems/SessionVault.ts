/**
 * Where saved sessions live and how they leave the machine: a localStorage
 * ring of the last five sessions (the "that run just now!" case needs no
 * foresight) and the export path — a downloaded JSON file, copied to the
 * clipboard when small enough. No server, no accounts; a file the player
 * can hand over is the whole design.
 */
import type { SessionRecording } from '../../core/input/session';

const STORAGE_KEY = 'et2:sessions:v1';
const RING_SIZE = 5;
/** Above this many characters the clipboard copy is skipped (file only). */
const CLIPBOARD_MAX_CHARS = 262144;

export interface SessionSummary {
    index: number;
    startedAt: string;
    savedAt: string;
    endReason: SessionRecording['endReason'];
    seed: number;
    ticks: number;
    seconds: number;
    markers: number;
}

export class SessionVault {
    /** Newest first. Throws on corrupt storage — fail loud, never shrug. */
    private read(): SessionRecording[] {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) {
            return [];
        }
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            throw new Error(`session vault: ${STORAGE_KEY} is not an array`);
        }
        return parsed as SessionRecording[];
    }

    push(session: SessionRecording): void {
        const ring = this.read();
        ring.unshift(session);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ring.slice(0, RING_SIZE)));
    }

    list(): SessionSummary[] {
        return this.read().map((s, index) => ({
            index,
            startedAt: s.startedAt,
            savedAt: s.savedAt,
            endReason: s.endReason,
            seed: s.seed,
            ticks: s.ticks,
            seconds: Math.round((s.ticks / 60) * 10) / 10,
            markers: s.markers.length,
        }));
    }

    get(index: number): SessionRecording {
        const ring = this.read();
        const session = ring[index];
        if (session === undefined) {
            throw new Error(`session vault: no session at index ${index} (have ${ring.length})`);
        }
        return session;
    }

    /** Download a session as et2-session-<timestamp>.json (+clipboard when small). */
    download(session: SessionRecording): void {
        const json = JSON.stringify(session);
        const stamp = session.savedAt.replace(/[:.]/g, '-');
        const name = `et2-session-${stamp}.json`;

        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        URL.revokeObjectURL(url);

        if (json.length <= CLIPBOARD_MAX_CHARS && navigator.clipboard !== undefined) {
            // Auxiliary channel by design ("copies to clipboard when small
            // enough") — a focus-loss rejection must not kill the download
            // path that already succeeded, but it is reported, not swallowed.
            navigator.clipboard.writeText(json).catch((err: unknown) => {
                console.warn('et2: session copied to file only; clipboard failed:', err);
            });
        }
        console.log(`et2: exported ${name} (${json.length} chars)`);
    }
}
