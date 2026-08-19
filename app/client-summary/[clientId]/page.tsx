/* eslint-disable @next/next/no-img-element */
import { fetchClientInfo, fetchOnboardingItems } from '@/lib/monday';
import type { ClientInfo, OnboardingItem } from '@/lib/types';
import { HELP_ARTICLES } from '@/lib/help-articles';
import { HELP_ARTICLE_KEYS } from '@/lib/help-article-list';
import { getCustomArticles } from '@/lib/custom-articles-store';
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
  detail?: string;
  neutral?: boolean; // agent-added item — renders with a neutral marker
  link?: { text: string; href: string };
};

function buildChecklist(
  info: ClientInfo,
  item: OnboardingItem | null,
  demoDate?: string,
  customItems: string[] = [],
): Check[] {
  const demo = (demoDate || '').trim();
  const contract = stepValue(item, 'color_mktr9afd'); // "Sign Contract" — Done / Pending
  const connect = stepValue(item, 'color_mktrpzz5'); // "Connect Your Store"
  const mapShip = stepValue(item, 'color_mktra6z8'); // "Map Shipping Methods" — Done / Pending
  const invSync = stepValue(item, 'color_mktrmpxj'); // "Enable Inventory Syncing" — Yes / Pending / No
  const returnsInt = stepValue(item, 'color_mkzembac'); // "Configure Returns" — Done / Loop Integration Pending / NA
  const techDemo = stepValue(item, 'color_mm278h2v'); // "Tech Demo Required" — Yes / No (No = not needed)
  const paid = isDone(info.paymentOnFile);

  const noStore = /not connecting/i.test(connect);
  const noDemo = /^\s*no\s*$/i.test(techDemo);
  const syncNo = /^\s*no\s*$/i.test(invSync);
  const returnsNA = /^\s*na\s*$/i.test(returnsInt) || !returnsInt.trim();

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
      label: 'Connect Your Platform',
      done: isDone(connect) || noStore,
      detail: noStore
        ? 'No online store to connect'
        : isDone(connect)
        ? 'Store connected & syncing'
        : 'Connect your e-commerce store to sync orders',
    },
    {
      label: 'Map Shipping Methods',
      done: isDone(mapShip),
      // If not yet mapped, it can be handled live on the tech demo call.
      detail: isDone(mapShip) ? 'Configured with your team' : 'Can be configured during your tech demo call',
    },
    {
      label: 'Turn On Inventory Syncing',
      done: isDone(invSync) || syncNo,
      detail: syncNo ? 'Not needed for your setup' : isDone(invSync) ? 'Enabled' : "We'll enable this during setup",
    },
    // Returns platform (Loop/Redo) — shown only when relevant to save space.
    ...(!returnsNA
      ? [
          {
            label: 'Integrate Returns Platform',
            done: isDone(returnsInt),
            detail: isDone(returnsInt)
              ? 'Returns platform connected'
              : 'Connecting your returns platform (Loop, Redo, etc.)',
          },
        ]
      : []),
    {
      // A date agreed on the call wins; else "Tech Demo Required = No" means
      // no second call is needed; otherwise prompt the client to book one.
      label: 'Tech Demo (2nd call)',
      done: noDemo || !!demo,
      detail: demo ? `Scheduled for ${fmtDate(demo)}` : noDemo ? 'No additional call needed' : 'Book your tech demo:',
      link: demo || noDemo ? undefined : { text: 'shipbots.com/onboarding', href: 'https://www.shipbots.com/onboarding' },
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

  // Agent-added items — rendered with a neutral marker (no done/pending state).
  for (const label of customItems) list.push({ label, done: false, neutral: true });

  return list;
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function ClientSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v || '').trim();
  // Optional agent input passed from the "generate" modal.
  const agentNote = str(sp.note);
  const demoDate = str(sp.demo);
  const nextSteps = str(sp.steps)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const customItems = str(sp.checkitems)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  // Which guides to attach as links. Absent (direct open) → all built-in.
  const csv = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v.join(',') : v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const selectedBuiltinKeys = sp.articles === undefined ? HELP_ARTICLE_KEYS : csv(sp.articles);
  const selectedCustomIds = csv(sp.custom);

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

  const tempPassword = (info.portalPassword || '').trim();
  const coordinator = { name: (info.supportAgent || '').trim(), email: (info.supportAgentEmail || '').trim() };

  // Getting-started guides — rendered on page 1 as hyperlinks (clients open
  // them online to see GIFs that can't print). Built-in guides resolve to the
  // client's platform URL; custom guides come from the team-shared store.
  const helpRoot = helpDesks[0] ?? { url: 'help.shipbots.com', href: 'https://help.shipbots.com' };
  const articlePlatform: 'appdot' | 'portal' = isPortal && !isAppDot ? 'portal' : 'appdot';
  const platformArticles = HELP_ARTICLES[articlePlatform];
  const builtinGuides = selectedBuiltinKeys
    .map((k) => platformArticles.find((a) => a.key === k))
    .filter((a): a is (typeof platformArticles)[number] => !!a)
    .map((a) => ({ title: a.title, href: a.url }));
  const customAll = selectedCustomIds.length ? await getCustomArticles() : [];
  const customGuides = selectedCustomIds
    .map((id) => customAll.find((c) => c.id === id))
    .filter((c): c is (typeof customAll)[number] => !!c)
    .map((c) => ({ title: c.name, href: c.url }));
  const selectedGuides = [...builtinGuides, ...customGuides];

  // Contacts ----------------------------------------------------------------
  const contacts = [
    { role: 'Main Contact', name: info.contactName, email: info.contactEmail, phone: info.contactPhone },
    { role: 'Contact', name: info.contact2Name, email: info.contact2Email, phone: info.contact2Phone },
    { role: 'Contact', name: info.contact3Name, email: info.contact3Email, phone: info.contact3Phone },
  ].filter((c) => has(c.name) || has(c.email));

  const checklist = buildChecklist(info, item, demoDate, customItems);

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
            {checklist.map((c, i) => (
              <div key={`${c.label}-${i}`} className={`os-ci ${c.done ? 'done' : c.neutral ? 'neutral' : 'pending'}`}>
                <div className="os-icon">{c.done ? '✓' : c.neutral ? '•' : '!'}</div>
                <div className="os-txt">
                  <div className="os-l">{c.label}</div>
                  {(c.detail || c.link) && (
                    <div className="os-d">
                      {c.detail}{' '}
                      {c.link && <a href={c.link.href}>{c.link.text}</a>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Body */}
          <div className="os-body">
            <div className="os-main">
              <div className="os-sec-title">What We Discussed</div>
              <div className="os-review-note">
                Please review the information below and contact your onboarding coordinator if any changes are needed.
              </div>
              {agentNote && (
                <div className="os-card" style={{ borderLeftColor: '#015280' }}>
                  <h3>
                    <span className="os-e">📝</span> A Note From Your Team
                  </h3>
                  <div style={{ fontSize: '9.7px', color: '#374151', lineHeight: 1.5 }}>{agentNote}</div>
                </div>
              )}
              {card('📦', 'Receiving Needs', receiving, receivingNotes)}
              {card('🚚', 'Shipping & Packing Needs', packing, packingNotes)}
              {card('↩️', 'Returns', returns, returnsNotes)}
              {card('🏢', 'General Info', general)}
              {nextSteps.length > 0 && (
                <div className="os-card" style={{ borderLeftColor: '#16a34a' }}>
                  <h3>
                    <span className="os-e">✅</span> Next Steps
                  </h3>
                  <ol className="os-steps">
                    {nextSteps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <div className="os-rail">
              <div className="os-sec-title">Your Account</div>

              {(loginMethods.length > 0 || username || tempPassword) && (
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
                  {tempPassword && (
                    <div className="os-li">
                      <b>Temporary password:</b> {tempPassword}
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

              {selectedGuides.length > 0 && (
                <div className="os-box">
                  <h4>📚 Getting Started Guides</h4>
                  {selectedGuides.map((g, i) => (
                    <div key={i} className="os-guide">
                      • <a href={g.href}>{g.title}</a>
                    </div>
                  ))}
                  <div className="os-li" style={{ marginTop: 5 }}>
                    <b>Help desk:</b> <a href={helpRoot.href}>{helpRoot.url}</a>
                  </div>
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
                {coordinator.name && (
                  <div className="os-sup-row">
                    <span className="os-k">Your coordinator</span>
                    <span className="os-v">
                      {coordinator.name}
                      {coordinator.email && (
                        <>
                          <br />
                          {coordinator.email}
                        </>
                      )}
                    </span>
                  </div>
                )}
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
