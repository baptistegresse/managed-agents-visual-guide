import { event } from "@/lib/workshop/effects";
import { WORKBENCH_STAND } from "@/lib/workshop/layout";
import type { CodeFile, Lesson } from "../types";
import {
  agentReply,
  BACK_TO_BED,
  LOOP_CLOSE,
  LOOP_OPEN,
  openingStep,
  ROUTE,
  SETUP,
  SETUP_HEAD,
  userMessage,
  WALK_MS,
} from "./shared";

const SETUP_FILE: CodeFile = {
  name: SETUP,
  blocks: [
    SETUP_HEAD,
    {
      id: "agent",
      lines: [
        "const agent = await client.beta.agents.create({",
        '  name: "Assistant support",',
        '  model: "claude-haiku-5-5",',
        '  system: "Tu réponds aux clients du support.",',
        "  tools: [",
        "    REPLY_TICKET_TOOL,",
      ],
    },
    {
      id: "toolset",
      lines: [
        "    // La boîte à outils intégrée : bash, read, write, edit, glob, grep.",
        "    // Ces outils s'exécutent dans le conteneur de la session, pas chez toi.",
        "    {",
        '      type: "agent_toolset_20260401",',
      ],
    },
    {
      id: "policy",
      lines: [
        '      // Qui décide qu\'un appel part : "always_allow", "always_ask" ou "auto".',
        '      default_config: { enabled: true, permission_policy: { type: "auto" } },',
      ],
    },
    {
      id: "web-off",
      lines: [
        "      // Les deux outils web restent éteints : ils ont leur propre chapitre.",
        "      configs: [",
        '        { name: "web_search", enabled: false },',
        '        { name: "web_fetch", enabled: false },',
        "      ],",
        "    },",
        "  ],",
        "});",
      ],
    },
  ],
};

const ROUTE_FILE: CodeFile = {
  name: ROUTE,
  blocks: [
    {
      id: "mount",
      lines: [
        "  // L'export de la semaine, déposé une fois avec l'API Files.",
        "  const upload = await client.files.upload({ file: await exportTickets() });",
        "",
        "  const session = await client.beta.sessions.create({",
        "    agent: AGENT_ID,",
        "    environment_id: ENVIRONMENT_ID,",
        "    // Monté à l'ouverture sous /mnt/session/uploads/ : l'agent le lit comme un fichier ordinaire.",
        '    resources: [{ type: "file", file_id: upload.id, mount_path: "/tickets.csv" }],',
        "  });",
        "",
      ],
    },
    LOOP_OPEN,
    {
      id: "on-builtin",
      lines: [
        "    // Les outils intégrés passent dans le flux. Rien à renvoyer, sauf si « auto » demande ton accord.",
        '    if (event.type === "agent.tool_use") logStep(event.name, event.input);',
        '    if (event.type === "agent.tool_result" && event.is_error) logError("Outil en échec", event.tool_use_id);',
        "",
      ],
    },
    LOOP_CLOSE,
    {
      id: "outputs",
      lines: [
        "",
        "  // Ce que l'agent a écrit dans /mnt/session/outputs/ se télécharge après le tour.",
        "  // Un fichier met parfois quelques secondes à apparaître : s'il manque, relance la liste.",
        '  const outputs = client.beta.files.list({ scope_id: session.id, betas: ["managed-agents-2026-04-01"] });',
        "  for await (const file of outputs) {",
        "    if (!file.downloadable) continue; // le fichier que tu as monté ne se télécharge pas",
        "    const content = await client.files.download(file.id);",
        "    await saveReport(file.filename, await content.text());",
        "  }",
      ],
    },
  ],
};

const COUNT_COMMAND = "tail -n +2 /mnt/session/uploads/tickets.csv | cut -d, -f3 | sort | uniq -c";
const COUNT_LINES = ["   4 colis cassé", "   2 remboursement", "   1 retard"];
const REPORT_PATH = "/mnt/session/outputs/bilan.md";
const REPORT_FILE = "bilan.md";
const JUDGED_SAFE = { type: "verdict", verdict: { text: "auto : jugé sûr", tone: "ok" } } as const;

/** Les outils intégrés tournent dans le conteneur de la session : aucun aller-retour vers ton backend. */
export const CONTAINER_LESSON: Lesson = {
  id: "container",
  title: "Le conteneur : bash et fichiers",
  summary: "Des outils qui s'exécutent dans la pièce de l'agent, sans aller-retour vers ton backend.",
  files: [SETUP_FILE, ROUTE_FILE],
  steps: [
    openingStep({
      id: "toolset",
      title: "Des outils qui tournent dans la pièce",
      text: [
        "Jusqu'ici, l'agent ne pouvait agir qu'à travers ton backend. La boîte à outils intégrée lui donne bash, un terminal, et des outils de fichiers.",
        "Ils s'exécutent dans le conteneur de la session, chez Anthropic : c'est l'établi, au fond de la pièce.",
        "Pour cette session, ton backend y a aussi monté un fichier : l'export des tickets de la semaine.",
      ],
      code: { file: SETUP, blocks: ["toolset", "web-off"] },
      adds: ["bench"],
      sets: { hasMountedFile: true },
      session: { extraToolLines: ["bash, read, write, edit, glob, grep : exécutés dans le conteneur de la session"] },
    }),
    {
      id: "policy",
      title: "Qui décide qu'un appel part ?",
      text: [
        "Chaque outil intégré suit une politique de permission. « always_allow » l'exécute sans rien demander.",
        "« always_ask » attend ton accord avant chaque appel, comme pour un outil de service tiers.",
        "« auto » laisse Anthropic juger chaque appel : il part, il est refusé, ou il attend ton accord.",
      ],
      code: { file: SETUP, blocks: ["policy"] },
    },
    {
      id: "bash",
      title: "L'agent passe à l'établi",
      text: [
        "Ton backend demande : « Compte les tickets de la semaine par motif. »",
        "L'agent demande « bash ». L'événement s'appelle « agent.tool_use », et il ne sort pas de la pièce : la commande s'exécute sur place.",
        "Sous « auto », Anthropic a d'abord jugé l'appel sûr.",
      ],
      code: { file: ROUTE, blocks: ["mount"] },
      actions: [
        ...userMessage("Compte les tickets de la semaine par motif."),
        event("agent.tool_use", `bash : ${COUNT_COMMAND}`, "agent"),
        JUDGED_SAFE,
        { type: "move", to: WORKBENCH_STAND, durationMs: WALK_MS },
        { type: "mood", mood: "working" },
        { type: "terminal", lines: [`$ ${COUNT_COMMAND}`] },
      ],
    },
    {
      id: "result",
      title: "Le résultat ne passe pas par toi",
      text: [
        "Le résultat rejoint la pile avec « agent.tool_result », et le modèle la relit.",
        "Ton backend voit passer les deux événements dans le flux. Mais il n'a rien exécuté et, l'appel ayant été jugé sûr, n'a rien à renvoyer : pas d'aller-retour.",
      ],
      code: { file: ROUTE, blocks: ["loop", "on-builtin"] },
      actions: [
        { type: "terminal", lines: [`$ ${COUNT_COMMAND}`, ...COUNT_LINES] },
        event("agent.tool_result", "4 colis cassé, 2 remboursement, 1 retard", "sandbox"),
        { type: "mood", mood: "thinking" },
        { type: "modelRequest" },
      ],
    },
    {
      id: "file",
      title: "L'agent écrit un fichier",
      text: [
        "Avec l'outil « write », l'agent enregistre son bilan dans « /mnt/session/outputs/ ».",
        "Tout ce qu'il écrit dans ce dossier est conservé. Ton backend peut le télécharger une fois le tour fini, parfois après quelques secondes d'attente.",
      ],
      code: { file: ROUTE, blocks: ["outputs"] },
      actions: [
        event("agent.tool_use", `write : ${REPORT_PATH}`, "agent"),
        JUDGED_SAFE,
        { type: "mood", mood: "working" },
        { type: "terminal", lines: [`write ${REPORT_PATH}`, "Fichier écrit."] },
        event("agent.tool_result", `Fichier écrit : ${REPORT_FILE}`, "sandbox"),
        { type: "file", name: REPORT_FILE },
        { type: "modelRequest" },
      ],
    },
    {
      id: "done",
      title: "Dans la pièce, pas chez toi",
      text: [
        "L'agent annonce que le bilan est prêt, et le tour se termine.",
        "Retiens où chaque chose s'exécute : un outil custom chez toi, un outil intégré dans le conteneur.",
        "Dans les deux cas, tout passe par le même flux d'événements.",
      ],
      code: { file: ROUTE, blocks: ["on-idle", "outputs"] },
      actions: [...agentReply("Le bilan est prêt : 4 colis cassés, 2 remboursements, 1 retard."), ...BACK_TO_BED],
    },
  ],
};
