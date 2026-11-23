import { readFileSync } from "node:fs";

export const STAGES = ["lead", "qualified", "proposal", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  owner: string;
}

export interface Deal {
  id: string;
  contactId: string;
  title: string;
  amount: number;
  stage: Stage;
  updatedAt: string;
}

export interface Note {
  id: string;
  contactId: string;
  body: string;
  author: string;
  createdAt: string;
}

/**
 * Everything the MCP tools need from a CRM. The in-memory version below backs the
 * demo and the tests; a HubSpot, Salesforce or Pipedrive adapter implements the
 * same interface and the tools, policy and audit log stay unchanged.
 */
export interface CrmProvider {
  searchContacts(query: string, limit: number): Contact[];
  getContact(id: string): Contact | undefined;
  dealsForContact(contactId: string): Deal[];
  notesForContact(contactId: string, limit: number): Note[];
  listDeals(filter: { stage?: Stage; minAmount?: number }): Deal[];
  getDeal(id: string): Deal | undefined;
  addNote(contactId: string, body: string, author: string): Note;
  updateDealStage(dealId: string, stage: Stage): Deal;
}

interface Seed {
  contacts: Contact[];
  deals: Deal[];
  notes: Note[];
}

export class InMemoryCrm implements CrmProvider {
  private contacts: Map<string, Contact>;
  private deals: Map<string, Deal>;
  private notes: Note[];

  constructor(seed: Seed) {
    this.contacts = new Map(seed.contacts.map((c) => [c.id, { ...c }]));
    this.deals = new Map(seed.deals.map((d) => [d.id, { ...d }]));
    this.notes = seed.notes.map((n) => ({ ...n }));
  }

  static fromFile(path: string): InMemoryCrm {
    return new InMemoryCrm(JSON.parse(readFileSync(path, "utf8")) as Seed);
  }

  searchContacts(query: string, limit: number): Contact[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return [...this.contacts.values()]
      .filter((c) => [c.name, c.email, c.company].some((field) => field.toLowerCase().includes(q)))
      .slice(0, limit);
  }

  getContact(id: string): Contact | undefined {
    return this.contacts.get(id);
  }

  dealsForContact(contactId: string): Deal[] {
    return [...this.deals.values()].filter((d) => d.contactId === contactId);
  }

  notesForContact(contactId: string, limit: number): Note[] {
    return this.notes
      .filter((n) => n.contactId === contactId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  listDeals(filter: { stage?: Stage; minAmount?: number }): Deal[] {
    return [...this.deals.values()]
      .filter((d) => !filter.stage || d.stage === filter.stage)
      .filter((d) => filter.minAmount === undefined || d.amount >= filter.minAmount)
      .sort((a, b) => b.amount - a.amount);
  }

  getDeal(id: string): Deal | undefined {
    return this.deals.get(id);
  }

  addNote(contactId: string, body: string, author: string): Note {
    if (!this.contacts.has(contactId)) throw new Error(`No contact with id ${contactId}`);
    const note: Note = {
      id: `N-${this.notes.length + 1001}`,
      contactId,
      body,
      author,
      createdAt: new Date().toISOString(),
    };
    this.notes.push(note);
    return note;
  }

  updateDealStage(dealId: string, stage: Stage): Deal {
    const deal = this.deals.get(dealId);
    if (!deal) throw new Error(`No deal with id ${dealId}`);
    deal.stage = stage;
    deal.updatedAt = new Date().toISOString();
    return deal;
  }
}
