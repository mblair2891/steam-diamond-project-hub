import { addDays, daysBetween } from './dates';
import type { Task } from './types';

const DEFAULT_DURATION = 7;

/** Ensure startDate + durationDays are consistent with due */
export function normalizeTask(task: Task): Task {
  const duration =
    task.durationDays && task.durationDays > 0
      ? task.durationDays
      : task.startDate
        ? Math.max(1, daysBetween(task.startDate, task.due) + 1)
        : DEFAULT_DURATION;

  let startDate = task.startDate;
  if (!startDate) {
    startDate = addDays(task.due, -(duration - 1));
  }

  // Keep due as end; if start was after due, fix due
  let due = task.due;
  if (startDate > due) {
    due = addDays(startDate, duration - 1);
  } else {
    // Recompute duration from start→due if both present
    const computed = Math.max(1, daysBetween(startDate, due) + 1);
    return {
      ...task,
      startDate,
      due,
      durationDays: task.durationDays || computed,
      assigneeId: task.assigneeId || null,
      assigneeName: task.assigneeName || null,
      dependsOnId: task.dependsOnId || null
    };
  }

  return {
    ...task,
    startDate,
    due,
    durationDays: duration,
    assigneeId: task.assigneeId || null,
    assigneeName: task.assigneeName || null,
    dependsOnId: task.dependsOnId || null
  };
}

/**
 * Cascade schedules so every dependent task starts the day after its dependency ends.
 * Prevents circular dependency loops (skips edges that would cycle).
 */
export function cascadeTaskDependencies(tasks: Task[]): Task[] {
  const map = new Map(tasks.map((t) => [t.id, normalizeTask({ ...t })]));

  // Detect cycles: skip dependsOn if it creates a cycle
  function wouldCycle(taskId: string, dependsOnId: string | null | undefined): boolean {
    if (!dependsOnId) return false;
    let cur: string | null | undefined = dependsOnId;
    const seen = new Set<string>();
    while (cur) {
      if (cur === taskId) return true;
      if (seen.has(cur)) break;
      seen.add(cur);
      cur = map.get(cur)?.dependsOnId;
    }
    return false;
  }

  // Topological multi-pass
  for (let pass = 0; pass < map.size + 2; pass++) {
    let changed = false;
    for (const t of map.values()) {
      if (!t.dependsOnId || wouldCycle(t.id, t.dependsOnId)) continue;
      const dep = map.get(t.dependsOnId);
      if (!dep) continue;

      const minStart = addDays(dep.due, 1);
      const duration = t.durationDays && t.durationDays > 0 ? t.durationDays : DEFAULT_DURATION;
      const currentStart = t.startDate || t.due;

      if (currentStart < minStart) {
        t.startDate = minStart;
        t.due = addDays(minStart, duration - 1);
        t.durationDays = duration;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return tasks.map((t) => map.get(t.id) || normalizeTask(t));
}

/** Apply a saved task into the list and re-cascade all dependencies */
export function upsertTaskWithCascade(tasks: Task[], next: Task): Task[] {
  const normalized = normalizeTask(next);
  // Clear invalid dependsOn (self)
  if (normalized.dependsOnId === normalized.id) {
    normalized.dependsOnId = null;
  }
  const without = tasks.filter((t) => t.id !== normalized.id);
  return cascadeTaskDependencies([...without, normalized]);
}

export function getTaskStart(task: Task): string {
  return normalizeTask(task).startDate || task.due;
}

export function getTaskEnd(task: Task): string {
  return normalizeTask(task).due;
}
