import { Alert, OnboardingItem } from './types';
import { ALERT_THRESHOLDS } from './constants';

function daysBetween(dateStr: string, now: Date): number {
  const date = new Date(dateStr);
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeAlerts(items: OnboardingItem[]): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date();

  for (const item of items) {
    // Skip completed items
    if (item.status === 'Done - Onboarding Complete, Inventory Arrived') continue;
    if (item.status === 'N/A') continue;

    // Contract unsigned for too long
    if (item.status === 'Needs Contract') {
      const daysInStatus = daysBetween(item.createdAt, now);
      if (daysInStatus >= ALERT_THRESHOLDS.contractUnsigned) {
        alerts.push({
          id: `contract-${item.id}`,
          type: 'contract',
          severity: daysInStatus >= 14 ? 'high' : 'medium',
          clientName: item.name,
          clientId: item.id,
          message: `Contract unsigned for ${daysInStatus} days`,
          daysOverdue: daysInStatus,
        });
      }
    }

    // Contract signed but onboarding not scheduled
    if (item.status === 'Contract Signed' && !item.kickoffDate) {
      const daysInStatus = daysBetween(item.updatedAt, now);
      if (daysInStatus >= ALERT_THRESHOLDS.callNotScheduled) {
        alerts.push({
          id: `scheduling-${item.id}`,
          type: 'scheduling',
          severity: daysInStatus >= 10 ? 'high' : 'medium',
          clientName: item.name,
          clientId: item.id,
          message: `Onboarding call not scheduled (${daysInStatus} days since contract signed)`,
          daysOverdue: daysInStatus,
        });
      }
    }

    // Inventory overdue
    if (item.status === 'Onboarded, Awaiting Inventory' || item.status === 'Inventory Late') {
      const daysWaiting = daysBetween(item.updatedAt, now);
      if (daysWaiting >= ALERT_THRESHOLDS.inventoryOverdue) {
        alerts.push({
          id: `inventory-${item.id}`,
          type: 'inventory',
          severity: item.status === 'Inventory Late' ? 'high' : 'medium',
          clientName: item.name,
          clientId: item.id,
          message: `Inventory ${item.status === 'Inventory Late' ? 'late' : 'pending'} for ${daysWaiting} days`,
          daysOverdue: daysWaiting,
        });
      }
    }

    // Stalled checklist (no progress in X days)
    if (item.progress > 0 && item.progress < 100) {
      const daysSinceUpdate = daysBetween(item.updatedAt, now);
      if (daysSinceUpdate >= ALERT_THRESHOLDS.checklistStalled) {
        alerts.push({
          id: `stalled-${item.id}`,
          type: 'stalled',
          severity: daysSinceUpdate >= 14 ? 'high' : 'medium',
          clientName: item.name,
          clientId: item.id,
          message: `Onboarding ${item.progress}% complete, no activity for ${daysSinceUpdate} days`,
          daysOverdue: daysSinceUpdate,
        });
      }
    }

    // Upcoming kickoff calls (in next 3 days)
    if (item.kickoffDate) {
      const kickoffDate = new Date(item.kickoffDate);
      const daysUntil = Math.floor((kickoffDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil >= 0 && daysUntil <= 3) {
        alerts.push({
          id: `upcoming-${item.id}`,
          type: 'upcoming',
          severity: daysUntil === 0 ? 'high' : 'low',
          clientName: item.name,
          clientId: item.id,
          message: daysUntil === 0
            ? `Kickoff call TODAY`
            : `Kickoff call in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`,
          date: item.kickoffDate,
        });
      }
    }
  }

  // Sort: high severity first, then by days overdue
  alerts.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity];
    }
    return (b.daysOverdue || 0) - (a.daysOverdue || 0);
  });

  return alerts;
}
