import { event } from "@/lib/workshop/effects";
import { hop, type CodeFile, type Lesson } from "../../types";
import { agentReply, BACK_TO_BED, openingStep, SETUP, SETUP_HEAD, userMessage } from "./shared";

const ALLOWED_DOMAIN = "carrier.example";
const TRACKING_URL = `https://${ALLOWED_DOMAIN}/tracking/AB123`;
const OTHER_DOMAIN = "parcel-reviews.example";
const OTHER_URL = `https://${OTHER_DOMAIN}/delays`;

const SETUP_FILE: CodeFile = {
  name: SETUP,
  blocks: [
    SETUP_HEAD,
    {
      id: "environment",
      lines: [
        "// The environment's network stays closed, except to the carrier's site.",
        "const environment = await client.beta.environments.create({",
        '  name: "support",',
        "  config: {",
        '    type: "cloud",',
        `    networking: { type: "limited", allowed_hosts: ["${ALLOWED_DOMAIN}"] },`,
        "  },",
        "});",
        "",
      ],
    },
    {
      id: "agent",
      lines: [
        "const agent = await client.beta.agents.create({",
        '  name: "Support assistant",',
        '  model: "claude-haiku-5-5",',
        '  system: "You answer support customers.",',
        "  tools: [",
        "    REPLY_TICKET_TOOL,",
        "    {",
        '      type: "agent_toolset_20260401",',
        '      default_config: { enabled: true, permission_policy: { type: "auto" } },',
      ],
    },
    {
      id: "web-tools",
      lines: [
        "      configs: [",
        "        // The web tools run on Anthropic's servers, not in the container.",
        "        // allowed_domains: the only sites they can reach.",
        `        { name: "web_search", enabled: true, allowed_domains: ["${ALLOWED_DOMAIN}"] },`,
        `        { name: "web_fetch", enabled: true, allowed_domains: ["${ALLOWED_DOMAIN}"] },`,
        "      ],",
        "    },",
        "  ],",
        "});",
      ],
    },
  ],
};

/** The web tools run at Anthropic, and only see the sites you list. */
export const WEB_LESSON: Lesson = {
  id: "web",
  title: "The web tools",
  summary: "Search and read the web, from Anthropic's servers, only on the sites you allow.",
  files: [SETUP_FILE],
  steps: [
    openingStep({
      id: "tools",
      title: "Reading the web without leaving the room",
      text: [
        "“web_search” searches the web, “web_fetch” reads a page. They are part of the built-in toolset.",
        "But they do not run in the container. Anthropic's servers go and get the page, and the agent only receives its content.",
      ],
      code: { file: SETUP, blocks: ["agent", "web-tools"] },
      session: {
        extraToolLines: [`web_search, web_fetch: run on Anthropic's servers, limited to ${ALLOWED_DOMAIN}`],
      },
    }),
    {
      id: "domains",
      title: "A list of allowed sites",
      text: [
        "“allowed_domains” limits each tool to the sites you list: here, the carrier's.",
        "The environment's network is “limited”. The same site must therefore also appear in its “allowed_hosts”.",
      ],
      code: { file: SETUP, blocks: ["environment", "web-tools"] },
    },
    {
      id: "fetch",
      title: "An allowed call",
      text: [
        "Your backend asks where Alice's parcel is, and passes two links: its tracking page, and a link she mentioned.",
        "The agent asks for “web_fetch” on the tracking page. This tool only opens addresses that already appeared in the session: that is why your backend provides it.",
        "The call goes out to the web from Anthropic's servers. Neither your backend nor the container takes part in it.",
      ],
      code: { file: SETUP, blocks: ["web-tools"] },
      actions: [
        ...userMessage(`Where is Alice's parcel AB123? Its tracking page: ${TRACKING_URL}. She also mentions ${OTHER_URL}.`),
        event("agent.tool_use", `web_fetch: ${TRACKING_URL}`, "agent"),
        hop("agent", "web", "web_fetch", "call"),
        { type: "mood", mood: "waiting" },
      ],
    },
    {
      id: "page",
      title: "The page comes back into the stack",
      text: [
        "The site is in the list: the page is read, and its content comes back with “agent.tool_result”.",
        "As with bash, your backend sees these events go by in the stream, but has nothing to do: the call was judged safe.",
      ],
      code: { file: SETUP, blocks: ["web-tools"] },
      actions: [
        hop("web", "agent", "result", "result"),
        event("agent.tool_result", "Parcel AB123: out for delivery, expected tomorrow.", "web"),
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "refused",
      title: "A refused call",
      text: [
        "The agent also wants to read the link Alice mentioned. This site is not in the list.",
        "The page is never read: the result comes back as an error, with the code “url_not_allowed”.",
        "The session itself goes on.",
      ],
      code: { file: SETUP, blocks: ["web-tools"] },
      actions: [
        event("agent.tool_use", `web_fetch: ${OTHER_URL}`, "agent"),
        hop("agent", "web", "url_not_allowed", "error"),
        event("agent.tool_result", `url_not_allowed: ${OTHER_DOMAIN} is not in the allowed list.`, "web", true),
        { type: "mood", mood: "stunned" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "done",
      title: "The agent answers with what it has",
      text: [
        "The agent answers with the page it managed to read, and points out the one it could not open.",
        "A link mentioned by a customer is text you do not control. The list of sites decides what the agent can read, whatever is written to it.",
      ],
      code: { file: SETUP, blocks: ["environment", "web-tools"] },
      actions: [
        ...agentReply("Alice's parcel arrives tomorrow. I could not open the other page: its site is not allowed."),
        ...BACK_TO_BED,
      ],
    },
  ],
};
