# Atelier d'agent

Une page pour comprendre [Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview)
et, surtout, **comment on branche un agent à un backend**. On suit un seul scénario, étape par
étape, en cliquant pour avancer. L'exemple est un support client : quelqu'un demande de répondre
au ticket d'Alice.

Le site existe en **français** (`/`) et en **anglais** (`/en`). Le sélecteur FR / EN, en haut à
droite, change de langue sans quitter l'étape en cours.

## Ce qu'on voit à chaque étape

- **À gauche, le texte de l'étape** : ce qui se passe, et ce qu'il faut en retenir.
- **Au centre, la pièce de l'agent**, en vue isométrique : c'est la session, chez Anthropic, avec
  l'agent, sa fenêtre de contexte et le vault. L'établi au fond est le conteneur de la session, et
  la trappe au-dessus de lui sa sortie réseau. Les appels sortent de la pièce par la gauche quand
  ils vont vers ton backend, par la droite quand ils vont vers un service extérieur.
- **À droite, le code du backend** : le fichier en entier, coloré, avec les blocs dont parle
  l'étape éclairés. Les lignes longues passent à la ligne : pas de défilement horizontal.
- **Dessous, le flux d'événements** de la session, avec qui a émis chacun.

## Les bases

Cinq chapitres, dans l'ordre, qui s'enchaînent sur la même scène :

1. **Un agent, c'est quoi ?** Un modèle, des outils, une boucle ; et ce que Managed Agents fait
   tourner à ta place.
2. **L'environnement** : le conteneur où l'agent travaille, et son réseau.
3. **Les outils** : les tiens, ceux du conteneur, ceux d'un service tiers.
4. **La session** : le branchement à ton backend. Une demande arrive sur ta route, ton backend
   ouvre une session, ouvre son flux, envoie le message, exécute l'outil que l'agent réclame,
   renvoie le résultat, et répond quand la session repasse « idle ».
5. **Le vault** : les clés que l'agent ne voit jamais.

La fenêtre de contexte est la pile à côté de l'agent : elle grandit à chaque message, appel et
résultat, et s'éclaire quand le modèle la relit.

## Les annexes

Elles n'apparaissent qu'une fois les bases terminées (ou avec le lien « Les afficher maintenant »).
Un sujet chacune :

- **Démarrer un tour autrement** : le webhook, le déploiement planifié.
- **Faire vivre une session** : une conversation en plusieurs tours, reprendre après une coupure,
  interrompre l'agent.
- **Outils et secrets** : ton accord avant un appel sensible, le conteneur (bash et fichiers), un
  secret pour le conteneur, les outils web, les skills.
- **Limites** : le budget, la pile pleine (compaction), les pannes.
- **Aller plus loin** : la mémoire entre deux sessions, la délégation, les objectifs notés, les
  versions d'un agent.

## C'est une illustration

Tout tourne dans le navigateur, **sans aucun appel à l'API**. Les étapes sont écrites à la main
(`lib/lesson/`) et le code affiché suit les formes réelles du SDK, mais rien n'est exécuté.

Le contenu a été relu contre la [documentation officielle](https://platform.claude.com/docs/en/managed-agents/overview)
le 26 novembre 2026 : noms d'événements, champs, appels du SDK, et ce qui tourne où. Managed Agents
est en bêta : à revérifier quand la doc change.

Simplifications assumées :

- La fenêtre de contexte fait 1 500 tokens, et les tokens sont estimés à la louche.
- Le résumé produit par la compaction est inventé : la plateforme ne dit pas ce qu'elle garde.
- Le flux affiché est allégé : les événements `span.*` et le `session.usage` qui précède chaque
  passage à « idle » n'y figurent pas (sauf dans l'annexe sur le budget).
- La pile ne montre que l'outil `reply_ticket`, même quand l'agent de la leçon en a d'autres.
- Le code des annexes appelle des fonctions à toi (`findSessionId`, `runToolAndSendResult`,
  `markInterrupted`…) sans les écrire : seuls les appels au SDK sont montrés en entier.

## Lancer

```bash
pnpm dev
```

```bash
pnpm test
```

## Organisation

- `lib/lesson/` : les leçons en français (`base/` pour les cinq chapitres, `extras/` pour les
  annexes), le code affiché, sa coloration et la lecture pas à pas, testés.
- `lib/lesson/en/` : les mêmes leçons en anglais, fichier pour fichier. `parity.test.ts` vérifie
  que les deux langues ont les mêmes étapes, le même code et le même déroulé à l'écran : toute
  modification d'une leçon se fait dans les deux arbres.
- `lib/i18n/` : les langues, et le texte de l'interface dans chacune.
- `lib/workshop/` : l'état de la session et de la pièce (événements, fenêtre de contexte, positions).
- `lib/iso/` : la projection isométrique.
- `components/lesson/` : la page (texte de l'étape, code, flux, sommaire).
- `components/workshop/scene/` : le dessin de la pièce de l'agent.
- `archive/` : deux versions abandonnées (l'arène, puis l'atelier interactif), ni compilées ni testées.
