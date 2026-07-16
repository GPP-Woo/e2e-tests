/**
 * Order items so every item comes after the items it `dependsOn` (FK-safe
 * sweep order for `setup/global-teardown.ts`). Declaration order is preserved
 * between independent items. Throws on unknown labels and cycles — a wrong
 * dependency should fail loudly, not silently skip a sweep.
 */
export function sortByDependsOn<T extends { label: string, dependsOn?: string[] }>(items: T[]): T[] {
  const byLabel = new Map(items.map(item => [item.label, item]))
  const done = new Set<string>()
  const visiting = new Set<string>()
  const sorted: T[] = []
  const visit = (item: T): void => {
    if (done.has(item.label))
      return
    if (visiting.has(item.label))
      throw new Error(`dependsOn cycle involving "${item.label}"`)
    visiting.add(item.label)
    for (const dep of item.dependsOn ?? []) {
      const target = byLabel.get(dep)
      if (!target)
        throw new Error(`"${item.label}" dependsOn unknown label "${dep}"`)
      visit(target)
    }
    visiting.delete(item.label)
    done.add(item.label)
    sorted.push(item)
  }
  items.forEach(visit)
  return sorted
}
