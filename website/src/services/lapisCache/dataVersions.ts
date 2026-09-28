/**
 * Polls each organism's LAPIS data version (`GET <lapis>/sample/info`), so cached pages and responses can be tied to
 * the version they were rendered from. A new version is reported through `onChange`.
 */
export type ObservedVersion = {
    version: string;
    /** When this process first saw this version: at most one poll interval after it appeared. */
    since: number;
};

export type DataVersionSource = {
    current(organism: string): ObservedVersion | undefined;
    snapshot(): ReadonlyMap<string, ObservedVersion>;
};

export class DataVersionTracker implements DataVersionSource {
    private readonly known = new Map<string, ObservedVersion>();
    private readonly unavailable = new Set<string>();
    private timer: ReturnType<typeof setInterval> | undefined;

    constructor(
        private readonly organisms: string[],
        private readonly fetchVersion: (organism: string) => Promise<string>,
        private readonly options: {
            now?: () => number;
            onChange?: (organism: string, previous: string, next: string) => void;
            onError?: (message: string) => void;
        } = {},
    ) {}

    private now() {
        return (this.options.now ?? Date.now)();
    }

    /** Undefined while the organism's version is unknown or its last poll failed: nothing may be cached then. */
    public current(organism: string): ObservedVersion | undefined {
        return this.unavailable.has(organism) ? undefined : this.known.get(organism);
    }

    public snapshot(): ReadonlyMap<string, ObservedVersion> {
        return new Map(
            this.organisms.flatMap((organism) => {
                const observed = this.current(organism);
                return observed === undefined ? [] : [[organism, observed] as const];
            }),
        );
    }

    public async poll(): Promise<void> {
        await Promise.all(
            this.organisms.map(async (organism) => {
                let version: string;
                try {
                    version = await this.fetchVersion(organism);
                } catch (e) {
                    if (!this.unavailable.has(organism)) {
                        this.options.onError?.(
                            `website cache: data version of ${organism} unavailable: ${(e as Error).message}`,
                        );
                    }
                    this.unavailable.add(organism);
                    return;
                }
                this.unavailable.delete(organism);
                const previous = this.known.get(organism);
                if (previous?.version === version) {
                    return;
                }
                this.known.set(organism, { version, since: this.now() });
                if (previous !== undefined) {
                    this.options.onChange?.(organism, previous.version, version);
                }
            }),
        );
    }

    public start(intervalMs: number) {
        void this.poll();
        this.timer = setInterval(() => void this.poll(), intervalMs);
        this.timer.unref();
    }

    public stop() {
        clearInterval(this.timer);
    }
}
