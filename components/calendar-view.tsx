'use client';

import { useState, useMemo, useRef, useEffect, useCallback, createContext, useContext } from 'react';
import { OnboardingItem, CalendarEvent } from '@/lib/types';
import { ClientCard } from './client-card';

// True when the calendar is mounted in the Customer Service surface. Read by
// CalendarEventCard (so we don't thread the flag through WeekView / MonthView)
// to strip the onboarding-only chrome from the cards: progress %, checklist,
// the "summary email to the team" icon, and the days-inactive alert.
const CustomerServiceCardContext = createContext(false);
import { ChevronLeft, ChevronRight, Phone, Package, AlertTriangle } from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Parse "YYYY-MM-DD" in local time (avoids UTC offset shifting the date by a day)
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// True only for a non-empty, parseable "YYYY-MM-DD" value.
function isValidDateStr(s: string | null | undefined): boolean {
  if (!s || !s.trim()) return false;
  const d = parseLocalDate(s.trim());
  return !Number.isNaN(d.getTime());
}

// A delivery event whose expected date is in the past AND whose inventory
// hasn't been received yet (no Delivered Date). Used to flag stragglers in the
// onboarding calendar.
function isOverdueDelivery(event: CalendarEvent, today: Date): boolean {
  if (event.type !== 'delivery' || event.delivered) return false;
  if (isValidDateStr(event.item.deliveredDate)) return false; // already delivered
  return parseLocalDate(event.date).getTime() < today.getTime();
}

function shortDate(iso: string): string {
  const d = parseLocalDate(iso);
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Event type badge ─────────────────────────────────────────────────────────

function EventBadge({ event, overdue = false }: { event: CalendarEvent; overdue?: boolean }) {
  const isCall = event.type === 'kickoff';
  const isDelivered = event.type === 'delivery' && event.delivered;
  const label = isCall
    ? 'Onboarding Call'
    : isDelivered
      ? 'Delivered'
      : overdue
        ? 'Past-due Delivery'
        : 'Expected Delivery';
  const cls = isCall
    ? 'bg-orange-100 text-orange-700'
    : isDelivered
      ? 'bg-emerald-100 text-emerald-700'
      : overdue
        ? 'bg-red-100 text-red-700'
        : 'text-[#015280] bg-[#e6f8ff]';
  const Icon = isCall ? Phone : overdue ? AlertTriangle : Package;
  return (
    <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-t-md w-full ${cls}`}>
      <Icon className="w-2.5 h-2.5 flex-shrink-0" />
      <span>{label}</span>
      {event.time && (
        <span className="ml-auto font-normal opacity-80">{formatTime(event.time)}</span>
      )}
    </div>
  );
}

// ─── Full event card (badge + kanban card) ────────────────────────────────────

function CalendarEventCard({ event, agentEmail, onSelect, onDragStart, onDragEnd, overdue = false }: {
  event: CalendarEvent;
  agentEmail: string | null;
  onSelect: () => void;
  /** Fires when the rep starts dragging this card. Only delivery events
   *  are actually draggable; kickoffs aren't movable from here. */
  onDragStart?: (event: CalendarEvent) => void;
  onDragEnd?: () => void;
  /** Past-due, not-yet-delivered expected delivery. */
  overdue?: boolean;
}) {
  const customerService = useContext(CustomerServiceCardContext);
  // Past-due flagging is an onboarding concern only.
  const flagOverdue = overdue && !customerService;
  // Only ESTIMATED delivery events reschedule the Est. Delivery Date on drop.
  // Actual "Delivered" events are a record of fact, so they aren't draggable.
  const draggable = event.type === 'delivery' && !event.delivered && Boolean(event.item.clientBoardItemId);
  return (
    <div
      className={`mb-2 rounded-lg overflow-hidden shadow-sm ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${flagOverdue ? 'ring-1 ring-red-300' : ''}`}
      draggable={draggable}
      onDragStart={e => {
        if (!draggable) return;
        // dataTransfer needs *something* set or some browsers refuse the drag.
        e.dataTransfer.setData('text/plain', event.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(event);
      }}
      onDragEnd={() => onDragEnd?.()}
    >
      <EventBadge event={event} overdue={flagOverdue} />
      <ClientCard item={event.item} agentEmail={agentEmail} onClick={onSelect} customerService={customerService} />
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({ days, events, agentEmailMap, onSelectItem, onDragStart, onDragEnd, onDropOnDay, onDragOverDay, dragOverISO }: {
  days: Date[];
  events: CalendarEvent[];
  agentEmailMap: Record<string, string>;
  onSelectItem: (item: OnboardingItem) => void;
  onDragStart: (event: CalendarEvent) => void;
  onDragEnd: () => void;
  onDropOnDay: (day: Date) => void;
  onDragOverDay: (day: Date) => void;
  dragOverISO: string | null;
}) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Day name headers — sticky */}
      <div className="grid grid-cols-7 border-b border-gray-200 bg-white flex-shrink-0">
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          const dayCount = events.filter(e => isSameDay(parseLocalDate(e.date), day)).length;
          return (
            <div
              key={i}
              className={`px-3 py-2.5 text-center border-r border-gray-100 last:border-r-0 ${
                isToday ? 'bg-[#e6f8ff]' : ''
              }`}
            >
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {DAYS_SHORT[i]}
              </p>
              <div className={`text-xl font-bold mt-0.5 w-9 h-9 rounded-full flex items-center justify-center mx-auto ${
                isToday ? 'bg-blue-600 text-white' : 'text-gray-800'
              }`}>
                {day.getDate()}
              </div>
              {dayCount > 0 && (
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {dayCount} event{dayCount > 1 ? 's' : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Event columns — scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-7 h-full min-h-full">
          {days.map((day, i) => {
            const dayEvents = events
              .filter(e => isSameDay(parseLocalDate(e.date), day))
              .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
            const isToday = isSameDay(day, today);
            const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
            const isDragOver = dragOverISO === iso;
            return (
              <div
                key={i}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOverDay(day); }}
                onDrop={e => { e.preventDefault(); onDropOnDay(day); }}
                className={`border-r border-gray-100 last:border-r-0 p-2 transition-colors ${
                  isDragOver ? 'bg-[#43c7ff]/15 border-[#43c7ff]' : isToday ? 'bg-[#e6f8ff]/20' : 'bg-white'
                }`}
              >
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-gray-200 text-center pt-6 select-none">—</p>
                ) : (
                  dayEvents.map(event => (
                    <CalendarEventCard
                      key={event.id}
                      event={event}
                      agentEmail={
                        event.item.clientBoardItemId
                          ? (agentEmailMap[event.item.clientBoardItemId] ?? null)
                          : null
                      }
                      onSelect={() => onSelectItem(event.item)}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      overdue={isOverdueDelivery(event, today)}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({ days, currentMonth, events, agentEmailMap, onSelectItem, onDragStart, onDragEnd, onDropOnDay, onDragOverDay, dragOverISO }: {
  days: Date[];
  currentMonth: number;
  events: CalendarEvent[];
  agentEmailMap: Record<string, string>;
  onSelectItem: (item: OnboardingItem) => void;
  onDragStart: (event: CalendarEvent) => void;
  onDragEnd: () => void;
  onDropOnDay: (day: Date) => void;
  onDragOverDay: (day: Date) => void;
  dragOverISO: string | null;
}) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  return (
    <div className="flex-1 overflow-auto">
      {/* Day header row */}
      <div className="grid grid-cols-7 border-b border-gray-200 bg-white sticky top-0 z-10">
        {DAYS_SHORT.map(d => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100 last:border-r-0"
          >
            {d}
          </div>
        ))}
      </div>

      {/* 6-week grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const isCurrentMonth = day.getMonth() === currentMonth;
          const isToday = isSameDay(day, today);
          const dayEvents = events
            .filter(e => isSameDay(parseLocalDate(e.date), day))
            .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

          const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
          const isDragOver = dragOverISO === iso;
          return (
            <div
              key={i}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOverDay(day); }}
              onDrop={e => { e.preventDefault(); onDropOnDay(day); }}
              className={`border-b border-r border-gray-100 p-1.5 min-h-40 transition-colors ${
                isDragOver
                  ? 'bg-[#43c7ff]/15'
                  : isCurrentMonth
                    ? 'bg-white'
                    : 'bg-gray-50/70'
              } ${isDragOver ? 'outline outline-2 -outline-offset-2 outline-[#43c7ff]' : ''} ${i % 7 === 6 ? 'border-r-0' : ''}`}
            >
              {/* Date number */}
              <div className="flex items-center justify-end mb-1 px-0.5">
                <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday
                    ? 'bg-blue-600 text-white'
                    : isCurrentMonth
                    ? 'text-gray-700'
                    : 'text-gray-300'
                }`}>
                  {day.getDate()}
                </span>
              </div>

              {/* Events */}
              {dayEvents.map(event => (
                <CalendarEventCard
                  key={event.id}
                  event={event}
                  agentEmail={
                    event.item.clientBoardItemId
                      ? (agentEmailMap[event.item.clientBoardItemId] ?? null)
                      : null
                  }
                  onSelect={() => onSelectItem(event.item)}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  overdue={isOverdueDelivery(event, today)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main CalendarView export ─────────────────────────────────────────────────

interface CalendarViewProps {
  items: OnboardingItem[];
  agentEmailMap: Record<string, string>;
  onSelectItem: (item: OnboardingItem) => void;
  /** Optimistic field patch fired after a calendar drop saves to Monday.
   *  PipelineBoard merges this into itemOverrides so the kanban /
   *  calendar / side panel all reflect the new date. */
  onItemUpdate?: (itemId: string, patch: Partial<OnboardingItem>) => void;
  /** Which surface the calendar is mounted in. In 'customer-service' the event
   *  cards hide onboarding progress (% + checklist bar). Defaults to onboarding. */
  appMode?: 'onboarding' | 'customer-service';
}

type DraggedEvent = { item: OnboardingItem; originalDate: string };

function isoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CalendarView({ items, agentEmailMap, onSelectItem, onItemUpdate, appMode = 'onboarding' }: CalendarViewProps) {
  const [calMode, setCalMode] = useState<'month' | 'week'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const isCustomerService = appMode === 'customer-service';

  // Build sorted event list from all items
  const events = useMemo<CalendarEvent[]>(() => {
    const result: CalendarEvent[] = [];
    for (const item of items) {
      // Onboarding calls are an onboarding-only concern — Customer Service
      // doesn't track them, so they never appear on the CS calendar.
      if (item.kickoffDate && !isCustomerService) {
        result.push({
          id: `${item.id}-kickoff`,
          type: 'kickoff',
          date: item.kickoffDate,
          time: item.kickoffTime ?? null,
          item,
        });
      }
      // Delivery. Once the inventory has actually been received we plot the
      // real Delivered Date (item.deliveredDate) and drop the estimate — only
      // one of the two ever shows for a client. When the Delivered Date is
      // empty we fall back to the Initial Inventory Est. Delivery Date
      // (date_mktrzhyk). Applies to both surfaces.
      if (isValidDateStr(item.deliveredDate)) {
        result.push({
          id: `${item.id}-delivered`,
          type: 'delivery',
          date: item.deliveredDate as string,
          time: item.deliveredTime ?? null,
          item,
          delivered: true,
        });
      } else if (item.estimatedDeliveryDate) {
        result.push({
          id: `${item.id}-delivery`,
          type: 'delivery',
          date: item.estimatedDeliveryDate,
          time: item.estimatedDeliveryTime ?? null,
          item,
        });
      }
    }
    return result.sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : (a.time || '').localeCompare(b.time || '');
    });
  }, [items, isCustomerService]);

  const navigate = (dir: -1 | 1) => {
    const d = new Date(currentDate);
    if (calMode === 'month') d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir * 7);
    setCurrentDate(d);
  };

  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCurrentDate(d);
  };

  // Week days: Mon → Sun
  const weekDays = useMemo<Date[]>(() => {
    const monday = getMondayOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [currentDate]);

  // 6-week grid for month view
  const monthDays = useMemo<Date[]>(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const dow = firstDay.getDay(); // 0=Sun
    const startDay = new Date(firstDay);
    startDay.setDate(firstDay.getDate() - (dow === 0 ? 6 : dow - 1));
    const days: Date[] = [];
    const cur = new Date(startDay);
    for (let i = 0; i < 42; i++) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [currentDate]);

  // ── Drag-and-drop: move a delivery card to a different day ─────────────
  // We keep the dragged event in a ref because HTML5 dataTransfer is
  // string-only; the ref dodges the round-trip. dragOverISO drives the
  // drop-target highlight.
  const draggingRef = useRef<DraggedEvent | null>(null);
  const [dragOverISO, setDragOverISO] = useState<string | null>(null);

  // Past-due-deliveries dropdown (onboarding only). Closes on outside click.
  const [showOverdue, setShowOverdue] = useState(false);
  const overdueRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showOverdue) return;
    const onDown = (e: MouseEvent) => {
      if (overdueRef.current && !overdueRef.current.contains(e.target as Node)) setShowOverdue(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showOverdue]);

  const handleDragStart = useCallback((event: CalendarEvent) => {
    if (event.type !== 'delivery') return;
    draggingRef.current = { item: event.item, originalDate: event.date };
  }, []);

  const handleDragEnd = useCallback(() => {
    draggingRef.current = null;
    setDragOverISO(null);
  }, []);

  const handleDropOnDay = useCallback(async (day: Date) => {
    const dragged = draggingRef.current;
    draggingRef.current = null;
    setDragOverISO(null);
    if (!dragged) return;
    if (!dragged.item.clientBoardItemId) {
      console.warn('[calendar drop] item has no Clients-board link, cannot save');
      return;
    }
    const newDate = isoFromDate(day);
    if (newDate === dragged.originalDate) return;

    // Optimistic — push the new date into the parent's itemOverrides so
    // every consumer (kanban, calendar, side panel) sees it instantly.
    onItemUpdate?.(dragged.item.id, { estimatedDeliveryDate: newDate });

    try {
      const res = await fetch(`/api/client/${dragged.item.clientBoardItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: 'date_mktrzhyk', value: newDate, valueType: 'date' }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[calendar drop] save failed: ${res.status}`, body);
        throw new Error(`${res.status}`);
      }
    } catch (err) {
      console.error('[calendar drop] error, rolling back', err);
      onItemUpdate?.(dragged.item.id, { estimatedDeliveryDate: dragged.originalDate });
    }
  }, [onItemUpdate]);

  const label = useMemo(() => {
    if (calMode === 'month') {
      return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    const s = weekDays[0], e = weekDays[6];
    if (s.getMonth() === e.getMonth()) {
      return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    }
    return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  }, [calMode, currentDate, weekDays]);

  const callCount = events.filter(e => e.type === 'kickoff').length;
  const expectedCount = events.filter(e => e.type === 'delivery' && !e.delivered).length;
  const deliveredCount = events.filter(e => e.type === 'delivery' && e.delivered).length;

  // Onboarding: expected deliveries whose date has passed with no Delivered
  // Date yet — surfaced as a clickable "past-due" list so the team can chase
  // whoever's inventory is late.
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const overdueDeliveries = useMemo(
    () => (isCustomerService ? [] : events.filter(e => isOverdueDelivery(e, today))),
    [events, today, isCustomerService],
  );

  return (
    <CustomerServiceCardContext.Provider value={appMode === 'customer-service'}>
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">

      {/* ── Sub-header ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Today
          </button>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 hover:bg-gray-100 transition-colors border-r border-gray-200"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <button
              onClick={() => navigate(1)}
              className="p-1.5 hover:bg-gray-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
          <h2 className="text-base font-semibold text-gray-900 min-w-[220px]">{label}</h2>
        </div>

        <div className="flex items-center gap-5">
          {/* Legend / counts */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {/* Onboarding calls — hidden in Customer Service */}
            {!isCustomerService && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-400 flex-shrink-0" />
                {callCount} Onboarding Call{callCount !== 1 ? 's' : ''}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#43c7ff] flex-shrink-0" />
              {/* Customer Service shows the color key only — no counts. */}
              {isCustomerService ? 'Expected Deliveries' : `${expectedCount} Expected Deliver${expectedCount !== 1 ? 'ies' : 'y'}`}
            </span>
            {deliveredCount > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 flex-shrink-0" />
                {isCustomerService ? 'Delivered' : `${deliveredCount} Delivered`}
              </span>
            )}
            {/* Past-due deliveries — clickable list (onboarding only) */}
            {!isCustomerService && overdueDeliveries.length > 0 && (
              <div className="relative" ref={overdueRef}>
                <button
                  type="button"
                  onClick={() => setShowOverdue(o => !o)}
                  title="Clients whose expected delivery date has passed with no Delivered Date yet"
                  className="flex items-center gap-1.5 font-semibold text-red-600 hover:text-red-700 underline decoration-red-300 underline-offset-2"
                >
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {overdueDeliveries.length} past-due
                </button>
                {showOverdue && (
                  <div className="absolute right-0 top-full mt-1.5 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-30 max-h-80 overflow-y-auto">
                    <div className="px-3 py-2 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Past-due deliveries — not received
                    </div>
                    {overdueDeliveries.map(e => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => { onSelectItem(e.item); setShowOverdue(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-red-50 border-b border-gray-50 last:border-b-0 flex items-center justify-between gap-2"
                      >
                        <span className="text-[13px] text-gray-900 truncate">{e.item.name}</span>
                        <span className="text-[11px] font-medium text-red-600 flex-shrink-0">Exp {shortDate(e.date)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Month / Week toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
            <button
              onClick={() => setCalMode('week')}
              className={`px-3 py-1.5 transition-colors ${
                calMode === 'week' ? 'text-[#015280] font-semibold' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              style={calMode === 'week' ? { background: 'var(--brand-cyan)' } : undefined}
            >
              Week
            </button>
            <button
              onClick={() => setCalMode('month')}
              className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${
                calMode === 'month' ? 'text-[#015280] font-semibold' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              style={calMode === 'month' ? { background: 'var(--brand-cyan)' } : undefined}
            >
              Month
            </button>
          </div>
        </div>
      </div>

      {/* ── Calendar body ── */}
      {calMode === 'week' ? (
        <WeekView
          days={weekDays}
          events={events}
          agentEmailMap={agentEmailMap}
          onSelectItem={onSelectItem}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnDay={handleDropOnDay}
          onDragOverDay={day => setDragOverISO(isoFromDate(day))}
          dragOverISO={dragOverISO}
        />
      ) : (
        <MonthView
          days={monthDays}
          currentMonth={currentDate.getMonth()}
          events={events}
          agentEmailMap={agentEmailMap}
          onSelectItem={onSelectItem}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnDay={handleDropOnDay}
          onDragOverDay={day => setDragOverISO(isoFromDate(day))}
          dragOverISO={dragOverISO}
        />
      )}
    </div>
    </CustomerServiceCardContext.Provider>
  );
}
