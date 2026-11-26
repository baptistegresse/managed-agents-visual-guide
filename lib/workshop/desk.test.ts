import { describe, expect, test } from "vitest";
import type { KeyId, ToolId } from "./catalog";
import {
  applyIncident,
  applyTool,
  createDesk,
  describeIncident,
  DESK_SIZE,
  INCIDENT_KINDS,
  openTickets,
  pickIncident,
  ticketById,
  ticketLabel,
  type Desk,
  type Incident,
  type Ticket,
  type ToolInput,
} from "./desk";

const ALICE = 1;
const BRUNO = 2;
const BOTH_KEYS: readonly KeyId[] = ["paiements", "transporteur"];
const first = (): number => 0;

function applyWith(desk: Desk, tool: ToolId, ticket: number, keys: readonly KeyId[] = BOTH_KEYS) {
  return applyTool(desk, { tool, input: { ticket } }, keys);
}

const REFUND: Incident = { kind: "refund", customer: "Léa", subject: "Remboursez-moi.", amount: 59 };
const SPAM: Incident = { kind: "spam", customer: "Promo Flash", subject: "Gagnez vite !", amount: null };

/** La boîte de départ, plus le ticket donné : renvoie aussi ce ticket, le dernier arrivé. */
function arrive(incident: Incident, desk: Desk = createDesk()): { desk: Desk; ticket: Ticket } {
  const next = applyIncident(desk, incident);
  return { desk: next, ticket: next.tickets[next.tickets.length - 1] };
}

function fullOfOpenTickets(): Desk {
  return Array.from({ length: DESK_SIZE * DESK_SIZE }).reduce<Desk>(
    (desk) => applyIncident(desk, { kind: "question", customer: "Nina", subject: "Une question.", amount: null }),
    { tickets: [], nextId: 1 },
  );
}

describe("createDesk", () => {
  test("starts with three customers already waiting, on the first three slots", () => {
    const desk = createDesk();

    expect(desk.tickets).toMatchObject([
      { id: 1, x: 0, y: 0, kind: "question", customer: "Alice", subject: "Comment changer mon mot de passe ?", amount: null },
      { id: 2, x: 1, y: 0, kind: "delivery", customer: "Bruno", subject: "Je n'ai pas reçu ma commande.", amount: 39 },
      { id: 3, x: 2, y: 0, kind: "question", customer: "Chloé", subject: "Puis-je modifier mon adresse de livraison ?" },
    ]);
    expect(desk.tickets.every((ticket) => ticket.status === "open" && !ticket.isOrderKnown)).toBe(true);
    expect(desk.nextId).toBe(4);
  });
});

describe("reading the desk", () => {
  test("finds a ticket by its number, and nothing for an unknown number", () => {
    expect(ticketById(createDesk(), BRUNO)?.customer).toBe("Bruno");
    expect(ticketById(createDesk(), 99)).toBeUndefined();
  });

  test("lists only the tickets still waiting, oldest first", () => {
    const answered = applyWith(createDesk(), "reply_ticket", ALICE).desk;

    expect(openTickets(answered).map((ticket) => ticket.customer)).toEqual(["Bruno", "Chloé"]);
  });

  test("names a ticket after its customer, eliding before a vowel", () => {
    const [alice, bruno] = createDesk().tickets;

    expect(ticketLabel(alice)).toBe("le ticket d'Alice");
    expect(ticketLabel(bruno)).toBe("le ticket de Bruno");
  });
});

describe("lookup_order", () => {
  test("finds the order of a delivery ticket and remembers it, without mutating the desk", () => {
    const desk = createDesk();

    const applied = applyWith(desk, "lookup_order", BRUNO);

    expect(applied.result).toEqual({ text: "Commande de Bruno : 39 €, expédiée, pas encore livrée.", isError: false });
    expect(ticketById(applied.desk, BRUNO)?.isOrderKnown).toBe(true);
    expect(ticketById(desk, BRUNO)?.isOrderKnown).toBe(false);
  });

  test("reports the order of a refund ticket as delivered", () => {
    const { desk, ticket } = arrive(REFUND);

    expect(applyWith(desk, "lookup_order", ticket.id).result.text).toBe("Commande de Léa : 59 €, livrée.");
  });

  test("refuses a ticket that is about no order", () => {
    const applied = applyWith(createDesk(), "lookup_order", ALICE);

    expect(applied.result).toEqual({ text: "Ce ticket ne concerne aucune commande.", isError: true });
  });
});

describe("tools owned by a third-party service", () => {
  test("track_parcel says where the parcel is and marks the ticket as tracked", () => {
    const applied = applyWith(createDesk(), "track_parcel", BRUNO);

    expect(applied.result).toEqual({ text: "Colis de Bruno : bloqué au dépôt depuis trois jours.", isError: false });
    expect(ticketById(applied.desk, BRUNO)?.isTracked).toBe(true);
  });

  test("track_parcel is only useful on a delivery ticket", () => {
    expect(applyWith(createDesk(), "track_parcel", ALICE).result.isError).toBe(true);
  });

  test("create_refund refunds an order once it has been looked up", () => {
    const { desk, ticket } = arrive(REFUND);
    const known = applyWith(desk, "lookup_order", ticket.id).desk;

    const applied = applyWith(known, "create_refund", ticket.id);

    expect(applied.result).toEqual({ text: "Remboursement de 59 € émis pour Léa.", isError: false });
    expect(ticketById(applied.desk, ticket.id)?.isRefunded).toBe(true);
  });

  test("create_refund refuses an order nobody looked up, and a second refund", () => {
    const { desk, ticket } = arrive(REFUND);
    const refunded = applyWith(applyWith(desk, "lookup_order", ticket.id).desk, "create_refund", ticket.id).desk;

    expect(applyWith(desk, "create_refund", ticket.id).result).toEqual({
      text: "Commande inconnue : cherche-la d'abord.",
      isError: true,
    });
    expect(applyWith(refunded, "create_refund", ticket.id).result.isError).toBe(true);
  });

  test.each([
    ["create_refund", "Clé Paiements"],
    ["track_parcel", "Clé Transporteur"],
  ] as const)("%s is refused without its key in the vault, and names the missing key", (tool, label) => {
    const desk = createDesk();

    const applied = applyWith(desk, tool, BRUNO, []);

    expect(applied.result.isError).toBe(true);
    expect(applied.result.text).toBe(`Accès refusé : la « ${label} » n'est pas dans le vault.`);
    expect(applied.desk).toBe(desk);
  });
});

describe("tools that settle a ticket", () => {
  test("reply_ticket answers the customer and resolves the ticket", () => {
    const applied = applyWith(createDesk(), "reply_ticket", ALICE);

    expect(applied.result).toEqual({ text: "Réponse envoyée à Alice.", isError: false });
    expect(ticketById(applied.desk, ALICE)?.status).toBe("resolved");
  });

  test("reply_ticket mentions the informal tone when asked for it", () => {
    const applied = applyTool(createDesk(), { tool: "reply_ticket", input: { ticket: ALICE, tone: "tu" } }, []);

    expect(applied.result.text).toBe("Réponse envoyée à Alice, avec le tutoiement.");
  });

  test("reply_ticket refuses a ticket that is already resolved", () => {
    const answered = applyWith(createDesk(), "reply_ticket", ALICE).desk;

    expect(applyWith(answered, "reply_ticket", ALICE).result.isError).toBe(true);
  });

  test("escalate_ticket hands the ticket to the team, and a reply can still resolve it later", () => {
    const escalated = applyWith(createDesk(), "escalate_ticket", BRUNO);

    const answered = applyWith(escalated.desk, "reply_ticket", BRUNO);

    expect(escalated.result).toEqual({ text: "Ticket de Bruno transmis à l'équipe.", isError: false });
    expect(ticketById(escalated.desk, BRUNO)?.status).toBe("escalated");
    expect(ticketById(answered.desk, BRUNO)?.status).toBe("resolved");
    expect(applyWith(escalated.desk, "escalate_ticket", BRUNO).result.isError).toBe(true);
  });

  test("close_ticket removes an unwanted message from the desk", () => {
    const { desk, ticket } = arrive(SPAM);

    const applied = applyWith(desk, "close_ticket", ticket.id);

    expect(applied.result).toEqual({ text: "Ticket indésirable fermé.", isError: false });
    expect(ticketById(applied.desk, ticket.id)).toBeUndefined();
  });

  test("close_ticket refuses to close a real customer's ticket", () => {
    const applied = applyWith(createDesk(), "close_ticket", ALICE);

    expect(applied.result).toEqual({ text: "Ce ticket vient d'un vrai client : réponds-lui plutôt.", isError: true });
    expect(applied.desk.tickets).toHaveLength(3);
  });
});

describe("invalid tool input", () => {
  test("an unknown ticket number is refused", () => {
    expect(applyWith(createDesk(), "reply_ticket", 99).result).toEqual({
      text: "Aucun ticket ne porte ce numéro.",
      isError: true,
    });
  });

  test.each([{ ticket: "2" }, { ticket: 1.5 }, { ticket: 0 }, {}, { ticket: 1, tone: "familier" }])(
    "input %j is refused without throwing, and leaves the desk unchanged",
    (input) => {
      const desk = createDesk();

      const applied = applyTool(desk, { tool: "reply_ticket", input: input as unknown as ToolInput }, []);

      expect(applied.result.isError).toBe(true);
      expect(applied.desk).toBe(desk);
    },
  );
});

describe("tickets that arrive", () => {
  test("a new ticket takes the first free slot, row by row, and the next number", () => {
    const { ticket } = arrive(REFUND);

    expect(ticket).toMatchObject({ id: 4, x: 3, y: 0, status: "open", customer: "Léa", amount: 59, isRefunded: false });
  });

  test("a slot freed by a closed ticket is reused, with a number never used before", () => {
    const { desk, ticket } = arrive(SPAM);
    const cleaned = applyWith(desk, "close_ticket", ticket.id).desk;

    const next = arrive(REFUND, cleaned).ticket;

    expect(next).toMatchObject({ x: ticket.x, y: ticket.y });
    expect(next.id).not.toBe(ticket.id);
  });

  test("on a full desk the oldest ticket already dealt with makes room", () => {
    const full = fullOfOpenTickets();
    const secondAnswered = applyWith(full, "reply_ticket", 2).desk;

    const next = applyIncident(secondAnswered, REFUND);

    expect(next.tickets).toHaveLength(DESK_SIZE * DESK_SIZE);
    expect(ticketById(next, 2)).toBeUndefined();
    expect(next.tickets[next.tickets.length - 1]).toMatchObject({ customer: "Léa", x: 1, y: 0 });
  });

  test("on a desk full of open tickets nothing can arrive", () => {
    const full = fullOfOpenTickets();

    expect(pickIncident(full, first)).toBeNull();
    expect(applyIncident(full, REFUND)).toBe(full);
  });

  test("pickIncident draws a ticket of the requested kind, with an amount only when an order is involved", () => {
    expect(pickIncident(createDesk(), first, "question")).toMatchObject({ kind: "question", amount: null });
    expect(pickIncident(createDesk(), first, "spam")).toMatchObject({ kind: "spam", amount: null });
    expect(pickIncident(createDesk(), first, "delivery")?.amount).toBeGreaterThan(0);
    expect(pickIncident(createDesk(), first, "refund")?.amount).toBeGreaterThan(0);
  });

  test("pickIncident prefers a customer who has no ticket on the desk yet", () => {
    const incident = pickIncident(createDesk(), first, "question");

    expect(["Alice", "Bruno", "Chloé"]).not.toContain(incident?.customer);
  });

  test("without a requested kind, the kind is drawn too", () => {
    const last = (): number => 0.999;

    expect(pickIncident(createDesk(), first)?.kind).toBe(INCIDENT_KINDS[0]);
    expect(pickIncident(createDesk(), last)?.kind).toBe(INCIDENT_KINDS[INCIDENT_KINDS.length - 1]);
  });

  test("describeIncident quotes what the customer wrote, in one line", () => {
    expect(describeIncident({ kind: "delivery", customer: "Bruno", subject: "Je n'ai pas reçu ma commande.", amount: 39 })).toBe(
      "Nouveau ticket de Bruno : « Je n'ai pas reçu ma commande. »",
    );
    expect(describeIncident({ kind: "question", customer: "Emma", subject: "Une question ?", amount: null })).toBe(
      "Nouveau ticket d'Emma : « Une question ? »",
    );
    expect(describeIncident(SPAM)).toBe("Un message indésirable arrive : « Gagnez vite ! »");
  });
});
