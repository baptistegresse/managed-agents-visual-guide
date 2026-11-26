/**
 * Mise en place, à lancer une fois (puis à chaque changement du prompt ou des outils) :
 * crée l'environnement et l'agent Managed Agents, ou met à jour l'agent existant,
 * et range leurs identifiants dans `.env.local`. Les sessions, elles, sont créées
 * par l'application : une par visiteur.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { AGENT_DESCRIPTION, AGENT_NAME, SYSTEM_PROMPT } from "@/lib/agents/prompts";
import { AGENT_MODEL } from "@/lib/config";
import { toAgentTools } from "@/lib/tools/definitions";

const ENV_FILE = ".env.local";
const MODERATOR_KEY_BYTES = 24;

type EnvValues = Readonly<Record<string, string>>;

function readEnvFile(): EnvValues {
  if (!existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    readFileSync(ENV_FILE, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function writeEnvFile(values: EnvValues): void {
  const content = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  writeFileSync(ENV_FILE, `${content}\n`, { mode: 0o600 });
}

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function main(): Promise<void> {
  // Lit ANTHROPIC_API_KEY, ou à défaut le profil créé par `ant auth login`.
  const client = new Anthropic();
  const env = readEnvFile();

  const agentConfig = {
    name: AGENT_NAME,
    description: AGENT_DESCRIPTION,
    model: AGENT_MODEL,
    system: SYSTEM_PROMPT,
    // Uniquement des outils custom : ils s'exécutent sur notre serveur, pas dans le conteneur.
    tools: toAgentTools(),
  };

  const environmentId =
    env.ARENA_ENVIRONMENT_ID ??
    (
      await client.beta.environments.create({
        name: "arene-de-pixels",
        // Aucun accès réseau depuis le conteneur : les agents n'en ont pas besoin.
        config: { type: "cloud", networking: { type: "limited" } },
      })
    ).id;
  say(`${env.ARENA_ENVIRONMENT_ID ? "Environnement existant" : "Environnement créé"} : ${environmentId}`);

  const agent = env.ARENA_AGENT_ID
    ? await client.beta.agents.update(env.ARENA_AGENT_ID, agentConfig)
    : await client.beta.agents.create(agentConfig);
  say(`${env.ARENA_AGENT_ID ? "Agent mis à jour" : "Agent créé"} : ${agent.id} (version ${agent.version})`);

  writeEnvFile({
    ...env,
    ARENA_ENVIRONMENT_ID: environmentId,
    ARENA_AGENT_ID: agent.id,
    ARENA_MODERATOR_KEY: env.ARENA_MODERATOR_KEY ?? randomBytes(MODERATOR_KEY_BYTES).toString("base64url"),
  });
  say(`Identifiants écrits dans ${ENV_FILE}. La clé du modérateur s'y trouve (ARENA_MODERATOR_KEY).`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Échec de la mise en place : ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
