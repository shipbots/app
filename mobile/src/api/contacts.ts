import type { ClientDetail } from './types';

export interface ContactFieldRef {
  /** ClientDetail key (mirrors src/api/fields.ts). */
  key: string;
  /** Monday Clients-board column id. */
  columnId: string;
}

export interface ContactSlot {
  idx: number;
  role: string;
  name: ContactFieldRef;
  email: ContactFieldRef;
  phone: ContactFieldRef;
  /** Location for the primary contact; ShipHero access for contacts 2 & 3. */
  extra: ContactFieldRef & { label: string };
}

/**
 * The Clients board stores up to three contacts as three FIXED sets of text
 * columns — not a dynamic list. So "add a contact" means filling the first
 * empty slot, and "delete" means clearing a slot's columns back to blank.
 * Column ids are the same ones used in src/api/fields.ts.
 */
export const CONTACT_SLOTS: ContactSlot[] = [
  {
    idx: 0,
    role: 'Primary contact',
    name: { key: 'contactName', columnId: 'text_mktqq7h6' },
    email: { key: 'contactEmail', columnId: 'text_mktq6sr5' },
    phone: { key: 'contactPhone', columnId: 'text_mktqabcm' },
    extra: { label: 'Location', key: 'contactLocation', columnId: 'text_mktx8q74' },
  },
  {
    idx: 1,
    role: 'Contact 2',
    name: { key: 'contact2Name', columnId: 'text_mktr1evd' },
    email: { key: 'contact2Email', columnId: 'text_mktr2xmm' },
    phone: { key: 'contact2Phone', columnId: 'text_mktr8kve' },
    extra: { label: 'ShipHero access', key: 'contact2ShipHeroAccess', columnId: 'text_mktyakva' },
  },
  {
    idx: 2,
    role: 'Contact 3',
    name: { key: 'contact3Name', columnId: 'text_mktr4v7q' },
    email: { key: 'contact3Email', columnId: 'text_mktrt74r' },
    phone: { key: 'contact3Phone', columnId: 'text_mktrw0tb' },
    extra: { label: 'ShipHero access', key: 'contact3ShipHeroAccess', columnId: 'text_mktyankg' },
  },
];

export function slotFields(slot: ContactSlot): Array<ContactFieldRef & { label?: string }> {
  return [slot.name, slot.email, slot.phone, slot.extra];
}

/** A slot counts as "a contact" when any of its columns holds a value. */
export function contactHasData(c: ClientDetail, slot: ContactSlot): boolean {
  return slotFields(slot).some(f => (c[f.key] ?? '').trim() !== '');
}
