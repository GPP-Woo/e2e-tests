/**
 * The shared lifecycle behind every test-owned resource fixture (categories,
 * organisaties, onderwerpen, publicaties, gebruikersgroepen).
 *
 * Each of those fixtures owns the `E2E `-prefixed rows a scenario creates: it
 * hands out unique names, remembers what was created or tracked, and deletes it
 * all in reverse order during teardown. That scaffolding was copy-pasted five
 * times in `fixture.ts`; this factory captures it once. A fixture supplies only
 * what is genuinely per-resource — how to create a row, how to delete one, and
 * (for the API-backed usergroups) how to check existence.
 */
export interface ResourceManagerConfig<Opts> {
  /** Playwright worker index, to keep names unique across parallel workers. */
  workerIndex: number
  /** Name prefix, e.g. `E2E `, `E2E pub `, `E2E groep `. All swept by `E2E `. */
  prefix: string
  /** Message thrown by `last()` when nothing has been created/tracked yet. */
  emptyMessage: string
  /** Create a row with this name. Omitted for resources created only through the UI. */
  create?: (name: string, opts?: Opts) => Promise<void>
  /** Delete a row by name (best-effort in teardown). */
  remove: (name: string) => Promise<void>
  /** Whether a row with this name exists. Only for resources with a read API. */
  exists?: (name: string) => Promise<boolean>
}

export interface ResourceManager<Opts> {
  /** Create a uniquely-named row (or with the given name); returns the name. */
  add: (name?: string, opts?: Opts) => Promise<string>
  /** Alias for {@link add}, read better where creation is "seeding a prerequisite". */
  seed: (name?: string) => Promise<string>
  /** Register a name created some other way (e.g. via Stagehand) so teardown deletes it. */
  track: (name: string) => string
  /** A fresh unique `${prefix}…` name, without creating anything. */
  freshName: () => string
  /** Name of the most recently added/tracked row (throws if none). */
  last: () => string
  /** Whether a row with this name exists (throws if no `exists` was configured). */
  exists: (name: string) => Promise<boolean>
}

export function makeResourceManager<Opts = unknown>(
  config: ResourceManagerConfig<Opts>,
): { manager: ResourceManager<Opts>, teardown: () => Promise<void> } {
  const created: string[] = []
  let seq = 0
  const freshName = () => `${config.prefix}${config.workerIndex}-${seq++}-${Date.now()}`

  const add = async (name?: string, opts?: Opts) => {
    if (!config.create)
      throw new Error(`This resource manager has no create step (prefix "${config.prefix}")`)
    const value = name ?? freshName()
    await config.create(value, opts)
    created.push(value)
    return value
  }

  const manager: ResourceManager<Opts> = {
    add,
    seed: name => add(name),
    track(name) {
      created.push(name)
      return name
    },
    freshName,
    last() {
      const name = created.at(-1)
      if (!name)
        throw new Error(config.emptyMessage)
      return name
    },
    exists(name) {
      if (!config.exists)
        throw new Error(`This resource manager has no exists check (prefix "${config.prefix}")`)
      return config.exists(name)
    },
  }

  // Teardown: remove everything this scenario created/tracked, newest first,
  // best-effort — the run-wide sweep in global-teardown catches any leftovers.
  const teardown = async () => {
    for (const name of [...created].reverse())
      await config.remove(name).catch(() => {})
  }

  return { manager, teardown }
}
