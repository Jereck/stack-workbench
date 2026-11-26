export interface Entry<T> {
  index: number;
  value: T;
}

export interface Pair<T> {
  baseline?: Entry<T>;
  target?: Entry<T>;
  issue?: "missing-key" | "duplicate-key";
}

export function matchGroups<T>(
  baseline: readonly T[],
  target: readonly T[],
  key: (item: T) => string | undefined,
  unique: boolean,
): Pair<T>[] {
  const groups = new Map<
    string,
    { baseline: Entry<T>[]; target: Entry<T>[] }
  >();
  const pairs: Pair<T>[] = [];
  function collect(side: "baseline" | "target", items: readonly T[]) {
    items.forEach((value, index) => {
      const identifier = key(value);
      const entry = { value, index };
      if (identifier === undefined) {
        pairs.push({ [side]: entry, issue: "missing-key" });
        return;
      }
      let group = groups.get(identifier);
      if (!group) {
        group = { baseline: [], target: [] };
        groups.set(identifier, group);
      }
      group[side].push(entry);
    });
  }
  collect("baseline", baseline);
  collect("target", target);
  for (const group of groups.values()) {
    if (unique && (group.baseline.length > 1 || group.target.length > 1)) {
      for (const entry of group.baseline)
        pairs.push({ baseline: entry, issue: "duplicate-key" });
      for (const entry of group.target)
        pairs.push({ target: entry, issue: "duplicate-key" });
    } else {
      const length = Math.max(group.baseline.length, group.target.length);
      for (let index = 0; index < length; index++)
        pairs.push({
          baseline: group.baseline[index],
          target: group.target[index],
        });
    }
  }
  return pairs;
}

// The caller bounds candidate counts. Augment paths so a flexible match
// (for example numeric tolerance) cannot greedily consume another row's only match.
export function matchCandidates<T>(
  baseline: readonly T[],
  target: readonly T[],
  compatible: (left: T, right: T, baselineIndex: number) => boolean,
): Pair<T>[] {
  const candidates = baseline.map((left, index) =>
    target.flatMap((right, targetIndex) =>
      compatible(left, right, index) ? [targetIndex] : [],
    ),
  );
  const owners: (number | undefined)[] = new Array(target.length);
  function assign(index: number, visited: Set<number>): boolean {
    for (const candidate of candidates[index] ?? []) {
      if (visited.has(candidate)) continue;
      visited.add(candidate);
      const previous = owners[candidate];
      if (previous === undefined || assign(previous, visited)) {
        owners[candidate] = index;
        return true;
      }
    }
    return false;
  }
  baseline.forEach((_, index) => assign(index, new Set()));
  const assigned = new Map<number, Entry<T>>();
  const output: Pair<T>[] = [];
  target.forEach((value, index) => {
    const owner = owners[index];
    if (owner === undefined) output.push({ target: { value, index } });
    else assigned.set(owner, { value, index });
  });
  baseline.forEach((value, index) => {
    output.push({ baseline: { value, index }, target: assigned.get(index) });
  });
  return output;
}
