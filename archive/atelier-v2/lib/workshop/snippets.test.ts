import { describe, expect, test } from "vitest";
import { entrySnippet, momentSnippet, snippetFor } from "./snippets";
import { createWorkshop, workshopReducer, type WorkshopAction } from "./state";

function stateAfter(actions: readonly WorkshopAction[]) {
  return actions.reduce(workshopReducer, createWorkshop());
}

describe("snippetFor", () => {
  test("environment shows the chosen name and networking", () => {
    const state = stateAfter([{ type: "environmentEdited", name: "serre", networking: "unrestricted" }]);

    const code = snippetFor("environment", state);

    expect(code).toContain("client.beta.environments.create");
    expect(code).toContain('name: "serre"');
    expect(code).toContain('type: "unrestricted"');
  });

  test("vault lists one credential per key, and none when the vault is empty", () => {
    const withKey = stateAfter([
      { type: "environmentCreated", id: "env_1" },
      { type: "keyToggled", key: "paiements" },
    ]);

    expect(snippetFor("vault", withKey)).toContain('mcp_server_url: "https://paiements.example/mcp"');
    expect(snippetFor("vault", withKey)).toContain("process.env.PAIEMENTS_API_KEY");
    expect(snippetFor("vault", createWorkshop())).not.toContain("credentials.create");
  });

  test("a tool owned by a third-party service is declared as that service's MCP toolset, not as a custom tool", () => {
    const state = stateAfter([
      { type: "environmentCreated", id: "env_1" },
      { type: "vaultCreated", id: "vlt_1" },
      { type: "toolToggled", tool: "track_parcel" },
    ]);

    const tools = snippetFor("tools", state);
    const agent = snippetFor("agent", state);

    expect(tools).not.toContain('name: "track_parcel"');
    expect(tools).toContain('{ type: "mcp_toolset", mcp_server_name: "transporteur"');
    expect(agent).toContain('{ type: "url", name: "transporteur", url: "https://transporteur.example/mcp" }');
  });

  test("the payment service keeps the default policy, so every refund waits for approval; the carrier is always allowed", () => {
    const state = stateAfter([
      { type: "environmentCreated", id: "env_1" },
      { type: "vaultCreated", id: "vlt_1" },
      { type: "toolToggled", tool: "create_refund" },
      { type: "toolToggled", tool: "track_parcel" },
    ]);

    const lines = snippetFor("tools", state).split("\n");
    const payments = lines.find((line) => line.includes('mcp_server_name: "paiements"')) ?? "";
    const carrier = lines.find((line) => line.includes('mcp_server_name: "transporteur"')) ?? "";

    expect(payments).not.toContain("permission_policy");
    expect(payments).toContain("chaque appel attend ton accord");
    expect(carrier).toContain('permission_policy: { type: "always_allow" }');
  });

  test("without any service tool the agent declares no MCP server", () => {
    expect(snippetFor("tools", createWorkshop())).not.toContain("mcp_toolset");
    expect(snippetFor("agent", createWorkshop())).not.toContain("mcp_servers");
  });

  test("tools declares only the enabled tools, as custom tools", () => {
    const state = stateAfter([
      { type: "environmentCreated", id: "env_1" },
      { type: "vaultCreated", id: "vlt_1" },
      { type: "toolToggled", tool: "escalate_ticket" },
    ]);

    const code = snippetFor("tools", state);

    expect(code).toContain('type: "custom"');
    expect(code).toContain('name: "lookup_order"');
    expect(code).not.toContain('name: "escalate_ticket"');
  });

  test("every custom tool takes a ticket number, and the reply can also set the tone", () => {
    const code = snippetFor("tools", createWorkshop());
    const toolBlocks = code.split("type: \"custom\"").slice(1);
    const reply = toolBlocks.find((block) => block.includes('name: "reply_ticket"')) ?? "";
    const lookup = toolBlocks.find((block) => block.includes('name: "lookup_order"')) ?? "";

    expect(toolBlocks.every((block) => block.includes('ticket: { type: "integer", minimum: 1 }'))).toBe(true);
    expect(toolBlocks.every((block) => block.includes('required: ["ticket"]'))).toBe(true);
    expect(reply).toContain('tone: { type: "string", enum: ["vous", "tu"] }');
    expect(lookup).not.toContain("tone");
  });

  test("agent uses the model, name and instructions", () => {
    const state = stateAfter([
      { type: "environmentCreated", id: "env_1" },
      { type: "vaultCreated", id: "vlt_1" },
      { type: "toolsConfirmed" },
      { type: "agentEdited", name: "Rosa", system: "Tu réponds en deux phrases." },
    ]);

    const code = snippetFor("agent", state);

    expect(code).toContain("client.beta.agents.create");
    expect(code).toContain('name: "Rosa"');
    expect(code).toContain("claude-haiku-5-5");
  });

  test("session attaches the environment and the vault", () => {
    const code = snippetFor("session", createWorkshop());

    expect(code).toContain("environment_id: environment.id");
    expect(code).toContain("vault_ids: [vault.id]");
    expect(code).toContain("user.message");
  });
});

describe("entrySnippet", () => {
  test("an API call and a webhook both end in an event sent to the session", () => {
    expect(entrySnippet("api")).toContain("sessions.events.send");
    expect(entrySnippet("webhook")).toContain("sessions.events.send");
    expect(entrySnippet("webhook")).toContain("signature");
    expect(entrySnippet("webhook")).toContain("boîte de support");
  });

  test("a cron is a scheduled deployment", () => {
    const code = entrySnippet("cron");

    expect(code).toContain("client.beta.deployments.create");
    expect(code).toContain('type: "cron"');
    expect(code).toContain("initial_events");
    expect(code).toContain("Relance programmée : traite les tickets restés sans réponse.");
  });
});

describe("options in the snippets", () => {
  const withOptions = stateAfter([
    { type: "environmentCreated", id: "env_1" },
    { type: "vaultCreated", id: "vlt_1" },
    { type: "sandboxChosen", policy: "always_ask" },
    { type: "toolsConfirmed" },
    { type: "delegationToggled" },
    { type: "agentCreated", id: "agent_1" },
    { type: "budgetChosen", cents: 25 },
    { type: "memoryToggled" },
  ]);

  test("the sandbox is the built-in toolset with its permission policy", () => {
    expect(snippetFor("tools", withOptions)).toContain("agent_toolset_20260401");
    expect(snippetFor("tools", withOptions)).toContain('type: "always_ask"');
    expect(snippetFor("tools", stateAfter([{ type: "environmentCreated", id: "e" }, { type: "vaultCreated", id: "v" }, { type: "sandboxChosen", policy: "off" }]))).not.toContain("agent_toolset");
  });

  test("delegation, budget and memory appear only when chosen", () => {
    expect(snippetFor("agent", withOptions)).toContain("multiagent_20261001");
    expect(snippetFor("agent", createWorkshop())).not.toContain("multiagent");
    expect(snippetFor("session", withOptions)).toContain('amount: "25"');
    expect(snippetFor("session", withOptions)).toContain("memory_store");
    expect(snippetFor("session", createWorkshop())).not.toContain("budget");
  });

  test("each special moment has its own call", () => {
    expect(momentSnippet("approval")).toContain("user.tool_confirmation");
    expect(momentSnippet("budget")).toContain("sessions.update");
    expect(momentSnippet("outcome")).toContain("user.define_outcome");
    expect(momentSnippet("outcome")).toContain("Une file vide : plus aucun ticket ouvert.");
  });
});

describe("MCP, skill, mounted file and versions in the snippets", () => {
  const full = stateAfter([
    { type: "environmentCreated", id: "env_1" },
    { type: "keyToggled", key: "paiements" },
    { type: "vaultCreated", id: "vlt_1" },
    { type: "sandboxChosen", policy: "always_allow" },
    { type: "toolToggled", tool: "create_refund" },
    { type: "toolsConfirmed" },
    { type: "skillToggled" },
    { type: "agentCreated", id: "agent_1" },
    { type: "planToggled" },
  ]);

  test("the MCP access is a bearer credential tied to the server address", () => {
    const vault = snippetFor("vault", stateAfter([{ type: "environmentCreated", id: "e" }, { type: "keyToggled", key: "transporteur" }]));

    expect(vault).toContain("static_bearer");
    expect(vault).toContain("mcp_server_url");
  });

  test("the agent declares the MCP server, its toolset and the skill", () => {
    expect(snippetFor("tools", full)).toContain("mcp_toolset");
    expect(snippetFor("agent", full)).toContain("mcp_servers");
    expect(snippetFor("agent", full)).toContain('skill_id: "skill_remboursement"');
  });

  test("the FAQ is uploaded then mounted as a file resource", () => {
    const session = snippetFor("session", full);

    expect(session).toContain("client.files.upload");
    expect(session).toContain('type: "file"');
    expect(session).toContain("/mnt/faq.md");
  });

  test("after a revision the session snippet pins the version", () => {
    const revised = [
      { type: "sessionStarted", id: "s" } as const,
      { type: "agentRevised", config: { enabledTools: ["reply_ticket"], sandbox: "always_allow", canDelegate: false, hasSkill: false, hasWeb: false } } as const,
    ].reduce(workshopReducer, full);

    expect(snippetFor("session", revised)).toContain("version: 2");
    expect(momentSnippet("version")).toContain("agents.update");
  });
});

describe("web tools and errors in the snippets", () => {
  test("web tools are switched on with their allowed domain, and stay off otherwise", () => {
    const web = stateAfter([
      { type: "environmentCreated", id: "e" },
      { type: "vaultCreated", id: "v" },
      { type: "sandboxChosen", policy: "auto" },
      { type: "webToggled" },
    ]);

    expect(snippetFor("tools", web)).toContain('allowed_domains: ["transporteur.example"]');
    expect(snippetFor("tools", web)).toContain('type: "auto"');
    const noWeb = stateAfter([
      { type: "environmentCreated", id: "e" },
      { type: "vaultCreated", id: "v" },
      { type: "sandboxChosen", policy: "always_allow" },
    ]);
    expect(snippetFor("tools", noWeb)).toContain('{ name: "web_search", enabled: false }');
    expect(snippetFor("tools", createWorkshop())).not.toContain("agent_toolset");
  });

  test("the error moment shows how the stream reports a failure", () => {
    expect(momentSnippet("error")).toContain("session.error");
    expect(momentSnippet("error")).toContain("session.status_terminated");
  });
});
