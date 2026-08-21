/**
 * Local task-due reminders. For every open task with a due date we schedule two
 * local notifications — the day before at 10:00 and the due day at 10:00 — that
 * deep-link to the task on tap. No push server needed (local scheduling works
 * in the standalone build, online or offline).
 */
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import type { Task } from '@/api/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let asked = false;
export async function ensureNotifPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('task-reminders', {
        name: 'Task reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (asked && !current.canAskAgain) return false;
    asked = true;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

const DONE = /(done|complete|finished)/i;
function parseYMD(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((s || '').trim());
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

/** Cancel + reschedule reminders for all open, dated tasks. */
export async function scheduleTaskReminders(tasks: Task[]): Promise<void> {
  const ok = await ensureNotifPermission();
  if (!ok) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    /* ignore */
  }
  const now = Date.now();
  for (const t of tasks) {
    if (DONE.test(t.status || '')) continue;
    const ymd = parseYMD(t.dueDate);
    if (!ymd) continue;
    const data = {
      taskId: t.id, name: t.name, status: t.status, dueDate: t.dueDate, clientName: t.clientName, notes: t.notes,
    };
    const client = t.clientName ? ` · ${t.clientName}` : '';
    const dueAt10 = new Date(ymd.y, ymd.m - 1, ymd.d, 10, 0, 0);
    const dayBefore = new Date(ymd.y, ymd.m - 1, ymd.d - 1, 10, 0, 0);
    if (dayBefore.getTime() > now) {
      await Notifications.scheduleNotificationAsync({
        content: { title: '📋 Task due tomorrow', body: `${t.name || 'A task'}${client} — just a reminder.`, data },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dayBefore },
      }).catch(() => {});
    }
    if (dueAt10.getTime() > now) {
      await Notifications.scheduleNotificationAsync({
        content: { title: '📋 Task due today', body: `${t.name || 'A task'}${client} — tap to open details.`, data },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dueAt10 },
      }).catch(() => {});
    }
  }
}

/** Opens the task detail when a reminder notification is tapped (warm + cold). */
export function useTaskReminderTaps(): void {
  const router = useRouter();
  const coldHandled = useRef(false);
  useEffect(() => {
    const open = (data: unknown) => {
      const d = data as Record<string, unknown> | null;
      if (!d?.taskId) return;
      router.push({
        pathname: '/task/[id]',
        params: {
          id: String(d.taskId), name: String(d.name ?? ''), status: String(d.status ?? ''),
          dueDate: String(d.dueDate ?? ''), clientName: String(d.clientName ?? ''), notes: String(d.notes ?? ''),
        },
      });
    };
    const sub = Notifications.addNotificationResponseReceivedListener(r => open(r.notification.request.content.data));
    Notifications.getLastNotificationResponseAsync()
      .then(r => { if (r && !coldHandled.current) { coldHandled.current = true; open(r.notification.request.content.data); } })
      .catch(() => {});
    return () => sub.remove();
  }, [router]);
}
