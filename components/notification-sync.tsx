'use client';

/**
 * Wires contact-email edits to the e-mail notification popups.
 *
 * The contact-email input fields (EditField in client-info-tab, InlineField in
 * client-header) call `useNotificationSync().onContactEmailChanged(old, new)`
 * after they save, but only when the column is one of the three contact-email
 * columns. NotificationSyncProvider (wrapping the client detail panel) decides
 * whether that's an add/change (→ enroll popup) or a delete (→ remove popup)
 * and renders the dialog. When there's no linked client (no board id), the
 * handler is a no-op.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NotificationEnrollDialog, type EnrollMode } from './notification-enroll-dialog';
import { emailsEqual } from '@/lib/notifications';

/** Primary / Contact 2 / Contact 3 email columns on the Clients board. */
export const CONTACT_EMAIL_COLUMN_IDS = new Set(['text_mktq6sr5', 'text_mktr2xmm', 'text_mktrt74r']);
export function isContactEmailColumn(columnId: string): boolean {
  return CONTACT_EMAIL_COLUMN_IDS.has(columnId);
}

interface NotificationSyncValue {
  onContactEmailChanged: (oldEmail: string, newEmail: string) => void;
}

const NotificationSyncContext = createContext<NotificationSyncValue>({ onContactEmailChanged: () => {} });

export function useNotificationSync(): NotificationSyncValue {
  return useContext(NotificationSyncContext);
}

export function NotificationSyncProvider({
  clientBoardItemId,
  children,
}: {
  clientBoardItemId: string | null;
  children: React.ReactNode;
}) {
  const [dialog, setDialog] = useState<{ email: string; mode: EnrollMode } | null>(null);

  // Drop any open dialog when the panel switches to a different client.
  useEffect(() => { setDialog(null); }, [clientBoardItemId]);

  const onContactEmailChanged = useCallback((oldEmail: string, newEmail: string) => {
    if (!clientBoardItemId) return;
    const oldE = (oldEmail || '').trim();
    const newE = (newEmail || '').trim();
    if (newE && !emailsEqual(oldE, newE)) {
      // Added, or changed to a different address → offer to enroll the new one.
      setDialog({ email: newE, mode: 'enroll' });
    } else if (!newE && oldE) {
      // Cleared → offer to remove it from notifications.
      setDialog({ email: oldE, mode: 'remove' });
    }
  }, [clientBoardItemId]);

  return (
    <NotificationSyncContext.Provider value={{ onContactEmailChanged }}>
      {children}
      {dialog && clientBoardItemId && (
        <NotificationEnrollDialog
          email={dialog.email}
          mode={dialog.mode}
          clientBoardItemId={clientBoardItemId}
          onClose={() => setDialog(null)}
        />
      )}
    </NotificationSyncContext.Provider>
  );
}
