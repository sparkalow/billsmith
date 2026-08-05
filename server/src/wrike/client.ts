/**
 * Wrike timelog client — a port of the legacy src/get-wrike-time.js.
 *
 * Differences from the original, all deliberate:
 *   - the token comes from the environment instead of being a string literal in source
 *   - the contact id comes from settings instead of being hardcoded
 *   - taskId, the timelog id, and the raw decimal hours are all preserved; the legacy
 *     script threw them away at line 72, keeping only a lossy "H:MM" string
 */

export interface WrikeTimelog {
    id: string;
    taskId?: string;
    userId?: string;
    hours: number;
    trackedDate: string;
    comment?: string;
    createdDate?: string;
    updatedDate?: string;
}

export class WrikeError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = 'WrikeError';
    }
}

const API_BASE = 'https://www.wrike.com/api/v4';

export function wrikeToken(): string {
    const token = process.env.WRIKE_TOKEN?.trim();
    if (!token) {
        throw new WrikeError(
            'WRIKE_TOKEN is not set. Add it to server/.env (see .env.example).',
        );
    }
    return token;
}

/** Fetch timelogs for a contact over an inclusive date range (YYYY-MM-DD). */
export async function fetchTimelogs(
    contactId: string,
    start: string,
    end: string,
    signal?: AbortSignal,
): Promise<WrikeTimelog[]> {
    const tracked = encodeURIComponent(JSON.stringify({ start, end }));
    const url = `${API_BASE}/contacts/${encodeURIComponent(contactId)}/timelogs?trackedDate=${tracked}`;

    let response: Response;
    try {
        response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${wrikeToken()}`,
                'Content-Type': 'application/json',
            },
            signal: signal ?? AbortSignal.timeout(30_000),
        });
    } catch (err) {
        if (err instanceof WrikeError) throw err;
        throw new WrikeError(`Could not reach Wrike: ${(err as Error).message}`);
    }

    if (!response.ok) {
        const body = await response.text();
        let detail = response.statusText;
        try {
            const parsed = JSON.parse(body) as { errorDescription?: string; error?: string };
            detail = parsed.errorDescription ?? parsed.error ?? detail;
        } catch {
            // Non-JSON error body; the status text will have to do.
        }
        throw new WrikeError(`Wrike returned ${response.status}: ${detail}`, response.status);
    }

    const payload = (await response.json()) as { data?: WrikeTimelog[] };
    return payload.data ?? [];
}
