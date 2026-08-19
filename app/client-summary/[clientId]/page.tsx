import { fetchClientInfo, fetchOnboardingItems } from '@/lib/monday';
import type { ClientInfo, OnboardingItem } from '@/lib/types';
import { PrintButton } from './print-button';
import { SUMMARY_CSS } from './styles';

// Always render with fresh Monday data — this is generated on demand, per client.
export const dynamic = 'force-dynamic';

// ── Small pure helpers ──────────────────────────────────────────────────────

type Row = { dt: string; dd: string };

/** Keep only pairs whose value is non-empty; trim for display. */
function rows(pairs: Array<[string, string | undefined | null]>): Row[] {
  return pairs
    .filter(([, v]) => v && String(v).trim())
    .map(([dt, v]) => ({ dt, dd: String(v).trim() }));
}

/** Join defined, non-empty parts with a separator. */
function join(parts: Array<string | undefined | null>, sep: string): string {
  return parts.map((p) => (p ?? '').trim()).filter(Boolean).join(sep);
}

const has = (v: string | undefined | null) => !!(v && String(v).trim());
const isDone = (v: string | undefined | null) => /\b(done|yes|complete|completed|signed|sent)\b/i.test(v ?? '');

/** Format a Monday date string ("2026-08-26") into "August 26, 2026". */
function fmtDate(raw: string | undefined | null): string {
  if (!raw) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!m) return raw.trim();
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return raw.trim();
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const stepValue = (item: OnboardingItem | null, id: string): string =>
  item?.checklist.find((s) => s.id === id)?.value ?? '';

// ── Checklist item model ────────────────────────────────────────────────────

type Check = {
  label: string;
  done: boolean;
  detail: string;
  link?: { text: string; href: string };
};

function buildChecklist(info: ClientInfo, item: OnboardingItem | null): Check[] {
  const contract = stepValue(item, 'color_mktr9afd'); // "Sign Contract" — Done / Pending
  const mapShip = stepValue(item, 'color_mktra6z8'); // "Map Shipping Methods" — Done / Pending
  const addlCall = stepValue(item, 'color_mm278h2v'); // "Additional Call Required" — Yes / No
  const paid = isDone(info.paymentOnFile);

  const list: Check[] = [
    {
      label: 'Service Agreement',
      done: isDone(contract),
      detail: isDone(contract) ? 'Signed & on file' : 'Please review & sign your service agreement',
    },
    {
      // The summary is sent after the first call, so this is always complete.
      label: 'First Onboarding Call',
      done: true,
      detail: 'Completed — see this summary',
    },
    {
      // "Additional Call Required = No" means no second call/tech demo is needed.
      label: 'Tech Demo (2nd call)',
      done: /^\s*no\s*$/i.test(addlCall),
      detail: /^\s*no\s*$/i.test(addlCall) ? 'No additional call needed' : 'Book your tech demo:',
      link: /^\s*no\s*$/i.test(addlCall)
        ? undefined
        : { text: 'shipbots.com/onboarding', href: 'https://www.shipbots.com/onboarding' },
    },
    {
      label: 'Map Shipping Methods',
      done: isDone(mapShip),
      detail: isDone(mapShip) ? 'Configured with your team' : 'In progress with your onboarding team',
    },
    {
      label: 'Complete Billing Profile',
      done: paid,
      detail: paid ? 'Payment method on file' : 'Add your payment method:',
      link: paid ? undefined : { text: 'shipbots.com/ach', href: 'https://www.shipbots.com/ach' },
    },
  ];

  // Initial inventory — genuinely part of onboarding and balances the grid.
  // Always shown as complete (scheduling/receiving is handled by the team).
  const delivered = item?.deliveredDate;
  const estDate = item?.estimatedDeliveryDate || info.initialInventoryDate;
  if (delivered || estDate) {
    list.push({
      label: 'Initial Inventory',
      done: true,
      detail: delivered ? `Received ${fmtDate(delivered)}` : `Arriving ${fmtDate(estDate)}`,
    });
  }

  return list;
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function ClientSummaryPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const [info, onboardingItems] = await Promise.all([
    fetchClientInfo(clientId),
    fetchOnboardingItems().catch(() => [] as OnboardingItem[]),
  ]);
  const item = onboardingItems.find((i) => i.clientBoardItemId === clientId) ?? null;

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Discussion buckets ------------------------------------------------------
  const receiving = rows([
    ['Delivery method', info.initialInventoryMethod],
    ['Quantity', info.initialInventoryQty],
    ['Est. arrival', fmtDate(info.initialInventoryDate)],
    ['Items barcoded', info.itemsBarcoded],
    ['Pre-storage needs', info.preStorageNeeds],
    ['Storage', info.initialInventoryStoringNeeds],
  ]);
  const receivingNotes = join([info.notesForReceiving, info.notesOnInitialInventory], ' ');

  const packing = rows([
    ['Platforms', info.ecommercePlatforms],
    ['SKU count', info.skuCount],
    ['Current fulfillment', info.currentFulfillmentMethod],
    ['Packaging', info.packaging],
    ['Order inserts', join([info.orderInserts, info.orderInsertDetails], ' — ')],
    ['Kits / bundles', info.kitsOrBundles],
    ['Overnight', info.overnightDelivery],
    ['International', join([info.internationalFulfillment, info.internationalShippingDDUDDP], ' · ')],
    ['Amazon FBA', info.amazonFBA],
    ['Shipping method', info.shippingMethod],
    ['Wholesale', info.wholesaleDetails],
    ['Outbound LTL', info.outboundLTL],
  ]);
  const packingNotes = join([info.notesForPacking, info.additionalShippingNotes], ' ');

  const returns = rows([
    ['Process', info.returnsProcess],
    ['New condition', info.returnsNewCondition],
    ['Used condition', info.returnsUsedCondition],
    ['Damaged', info.returnsDamagedCondition],
    ['Incomplete', info.returnsIncompleteCondition],
  ]);
  const returnsNotes = info.notesForReturns;

  const general = rows([
    ['Legal entity', info.legalEntity],
    ['Product category', info.productCategory],
    ['Warehouse', join([info.warehouseLocation, info.subWarehouse], ' — ')],
    ['Business HQ', info.businessHQ],
    ['Manufacturing', info.manufacturingLocation],
  ]);

  // Access / login ----------------------------------------------------------
  const portalTokens = (info.portalDropdown || '').toLowerCase();
  const isPortal = portalTokens.includes('portal');
  const isAppDot = portalTokens.includes('appdot') || portalTokens.includes('app dot');
  const username = (info.portalEmail || info.contactEmail || '').trim();

  const loginMethods: Array<{ label: string; url: string; href: string }> = [];
  if (isPortal)
    loginMethods.push({ label: 'ShipBots Portal', url: 'shipbots.com/portal', href: 'https://www.shipbots.com/portal' });
  if (isAppDot)
    loginMethods.push({ label: 'AppDot (ShipHero)', url: 'shipbots.com/login', href: 'https://www.shipbots.com/login' });

  const helpDesks: Array<{ url: string; href: string }> = [];
  if (isAppDot) helpDesks.push({ url: 'help.shipbots.com', href: 'https://help.shipbots.com' });
  if (isPortal) helpDesks.push({ url: 'helpportal.shipbots.com', href: 'https://helpportal.shipbots.com' });

  // Contacts ----------------------------------------------------------------
  const contacts = [
    { role: 'Main Contact', name: info.contactName, email: info.contactEmail, phone: info.contactPhone },
    { role: 'Contact', name: info.contact2Name, email: info.contact2Email, phone: info.contact2Phone },
    { role: 'Contact', name: info.contact3Name, email: info.contact3Email, phone: info.contact3Phone },
  ].filter((c) => has(c.name) || has(c.email));

  const checklist = buildChecklist(info, item);

  // Card renderer — plain function (not a component) so it renders inline
  // without remounting and steers clear of nested-component lint rules.
  const card = (emoji: string, title: string, data: Row[], notes?: string) => {
    if (data.length === 0 && !has(notes)) return null;
    return (
      <div className="os-card" key={title}>
        <h3>
          <span className="os-e">{emoji}</span> {title}
        </h3>
        {data.length > 0 && (
          <dl className="os-kv">
            {data.map((r) => (
              <div key={r.dt} className="os-kv-row">
                <dt>{r.dt}</dt>
                <dd>{r.dd}</dd>
              </div>
            ))}
          </dl>
        )}
        {has(notes) && (
          <div className="os-notes">
            <b>Notes:</b> {notes}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SUMMARY_CSS }} />
      <div className="os-overlay">
        <PrintButton />
        <div className="os-sheet">
          {/* Header */}
          <div className="os-head">
            <div className="os-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/shipbots-icon.png" alt="ShipBots" />
              <div className="os-name">
                Ship<span>Bots</span>
              </div>
            </div>
            <div className="os-rt">
              <div className="os-t">Onboarding Summary</div>
              <div className="os-s">
                {info.name}
                {' · '}
                {today}
              </div>
            </div>
          </div>

          <p className="os-welcome">
            Thanks for onboarding with <b>ShipBots</b>! Here&apos;s a recap of everything we covered on your onboarding
            call, your account access, and the next steps to get your fulfillment live. Keep this handy — it&apos;s your
            after-onboarding reference.
          </p>

          {/* Checklist */}
          <div className="os-sec-title">Onboarding Checklist</div>
          <div className="os-checklist">
            {checklist.map((c) => (
              <div key={c.label} className={`os-ci ${c.done ? 'done' : 'pending'}`}>
                <div className="os-icon">{c.done ? '✓' : '!'}</div>
                <div className="os-txt">
                  <div className="os-l">{c.label}</div>
                  <div className="os-d">
                    {c.detail}{' '}
                    {c.link && (
                      <a href={c.link.href}>{c.link.text}</a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Body */}
          <div className="os-body">
            <div className="os-main">
              <div className="os-sec-title">What We Discussed</div>
              {card('📦', 'Receiving Needs', receiving, receivingNotes)}
              {card('🚚', 'Shipping & Packing Needs', packing, packingNotes)}
              {card('↩️', 'Returns', returns, returnsNotes)}
              {card('🏢', 'General Info', general)}
            </div>

            <div className="os-rail">
              <div className="os-sec-title">Your Account</div>

              {(loginMethods.length > 0 || username) && (
                <div className="os-box accent">
                  <h4>🔐 Login &amp; Access</h4>
                  {loginMethods.map((m) => (
                    <div key={m.label} className="os-li">
                      <b>{m.label}:</b> <a href={m.href}>{m.url}</a>
                    </div>
                  ))}
                  {username && (
                    <div className="os-li" style={{ marginTop: 4 }}>
                      <b>Username:</b> {username}
                    </div>
                  )}
                  {helpDesks.length > 0 && (
                    <div className="os-li" style={{ marginTop: 5 }}>
                      <b>Help desk:</b>{' '}
                      {helpDesks.map((h, i) => (
                        <span key={h.url}>
                          {i > 0 ? ' · ' : ''}
                          <a href={h.href}>{h.url}</a>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {contacts.length > 0 && (
                <div className="os-box">
                  <h4>👤 Your Contacts</h4>
                  {contacts.map((c, i) => (
                    <div key={i} className="os-contact">
                      <div className="os-role">{c.role}</div>
                      {has(c.name) && <div className="os-nm">{c.name}</div>}
                      <div className="os-dd">{join([c.email, c.phone], ' · ')}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="os-box">
                <h4>🛟 ShipBots Support</h4>
                <div className="os-sup-row">
                  <span className="os-k">Warehouse line</span>
                  <span className="os-v">
                    424-410-3384
                    <br />
                    support@shipbots.com
                  </span>
                </div>
                <div className="os-sup-row">
                  <span className="os-k">Receiving</span>
                  <span className="os-v">receiving@shipbots.com</span>
                </div>
                <div className="os-sup-row">
                  <span className="os-k">Billing</span>
                  <span className="os-v">billing@shipbots.com</span>
                </div>
                {helpDesks.length > 0 && (
                  <div className="os-sup-row">
                    <span className="os-k">ShipHero help</span>
                    <span className="os-v">{helpDesks.map((h) => h.url).join(' · ')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="os-foot">
            <span>
              Questions? Reach your onboarding team any time at <b>support@shipbots.com</b>.
            </span>
            <span>ShipBots · Onboarding Summary</span>
          </div>
        </div>
      </div>
    </>
  );
}
