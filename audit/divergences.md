# Divergences Codex ↔ Opus — arbitrage motivé

Ce document expose les cas où les deux audits divergent significativement sur l'existence ou la sévérité d'un finding. Pour chaque cas, l'arbitrage final est justifié contextuellement (Clever Cloud : usage interne, données prospects, OAuth Google Workspace + Pipedrive sensibles).

---

## 1. SEC-001 (PBAC stub IDOR) — Codex absent

- **Codex** : non détecté.
- **Opus** : P0, IDOR cross-tenant sur 10 procedures tRPC.
- **Arbitrage** : **P0 confirmé** — vulnérabilité validée dynamiquement en PoC (attaquant non-membre a delete un event team via HTTP 200). Codex a manqué ce finding probablement car il est introduit par le commit de relicensing MIT (suppression PBAC EE remplacée par un stub no-op) plutôt qu'inhérent au code upstream Cal.com. Le finding est inhérent à la fork cal.diy.

## 2. SEC-100 / Codex SEC-003 (AES-CBC) — Sévérité divergente

- **Codex** : P2 (mineur), modèle de menace = "écriture DB hors scope".
- **Opus** : P1.
- **Arbitrage** : **P1** retenu. Contexte Clever Cloud : les credentials OAuth (Google Workspace, Pipedrive, CalDAV, etc.) sont les "bijoux de la couronne". Tout vecteur de malléabilité ou padding-oracle sur ces secrets justifie P1, même si l'écriture DB est considérée comme moins probable. La justification Codex tient pour un produit générique, pas pour un déploiement qui gère des prospects/concurrents.

## 3. BUG-001 (double-booking) — Sévérité divergente

- **Codex** : P1.
- **Opus** : P0.
- **Arbitrage** : **P0** retenu. RDV commerciaux qui se chevauchent = incident client direct visible immédiatement par deux prospects. Confirmé en PoC : 7 bookings PENDING simultanés sur le même slot quand `requiresConfirmation=true`. La sévérité Codex P1 s'applique à un produit SaaS générique avec recovery manuel possible ; en contexte Clever Cloud, l'impact business est immédiat.

## 4. SEC-200 (rate-limit fail-open) — Codex absent

- **Codex** : non détecté.
- **Opus** : P0 si `UNKEY_ROOT_KEY` absent.
- **Arbitrage** : **P0** retenu et confirmé par PoC (200/200 POST `/api/auth/callback/credentials` passés, 0 × 429). Le `UNKEY_ROOT_KEY` est documenté comme "optionnel" dans la config self-host, donc le fail-open est l'état par défaut. À vérifier sur l'instance Clever — si la var est set, redescendre à P2. Sans confirmation : P0 par précaution.

## 5. SEC-009 fusion — Codex SEC-007 + Opus SEC-008/009

- **Codex SEC-007** : vérification email (TOTP md5 réutilisable 15 min), P2.
- **Opus SEC-008** : 2FA TOTP sans anti-replay (≤ 30s), P2.
- **Opus SEC-009** : backup codes 2FA chiffrés réversibles, P2.
- **Arbitrage** : **fusion en SEC-009** (P2) — trois vecteurs sur la même classe de problème (preuves de possession faibles, pas d'anti-replay, stockage réversible). Garder 3 IDs séparés diluerait la priorisation alors qu'un fix cohérent (refactor du module verification + 2FA) adresse les trois.

## 6. SEC-101 fusion — Codex SEC-001 vs Opus SEC-101 + SEC-102

- **Codex SEC-001** : `NONCE_EXEMPT_APPS` (Stripe, Basecamp, Dub, Webex, Tandem) sans nonce CSRF, P1.
- **Opus SEC-101** : même finding, P1.
- **Opus SEC-102** : `state === undefined` ignoré sur Zoom/Office365/Feishu/Lark/Google, P2.
- **Arbitrage** : SEC-102 maintenu **séparé** de SEC-101 — vecteur différent (apps non-exemptes mais validation absente). Codex regroupait tout en P1 ; Opus distinguait avec raison.

## 7. SEC-103 fusion — Codex SEC-002 (IPv6-map metadata) plus précis qu'Opus

- **Codex SEC-002** : bypass `http://[::ffff:169.254.169.254]/` non-normalisé par `isPrivateIP`, P1. Détail technique non capturé par Opus.
- **Opus SEC-103** : DNS rebinding + pas de re-validation au send, P1.
- **Arbitrage** : **fusion conservant les deux preuves** — Codex apporte le détail IPv4-map IPv6, Opus apporte le DNS rebinding. Le correctif doit traiter les deux (normalisation IPv4-map + re-validation au send avec pinning IP).

## 8. SEC-017 (HMAC secret webhooks API v2) — Trouvaille unique Codex

- **Codex SEC-009** : DTO `webhook.output.ts` expose le champ `secret` en clair via GET API v2.
- **Opus** : non détecté (l'audit Opus n'a pas couvert `apps/api/v2/src/modules/webhooks/outputs/`).
- **Arbitrage** : **P3 retenu** — bonne trouvaille Codex, mais nécessite déjà une clé API valide pour le compte propriétaire. L'impact (rotation forcée des secrets en cas de fuite de clé API) reste modeste. Conservé tel quel.

## 9. SEC-005 / Codex SEC-005 (CSP) — Couverture identique, mais Opus split

- **Codex SEC-005** : CSP uniquement sur login, P2.
- **Opus SEC-201** : même finding, P1.
- **Opus SEC-206** : `'unsafe-inline' https:` même sur la CSP qui s'applique, P2.
- **Arbitrage** : **P1 pour SEC-201** (sévérité Opus retenue — l'absence totale de CSP sur le booker public = surface XSS maximale) ; **SEC-205 séparé** (Opus SEC-206) car le fix est indépendant (retirer `'unsafe-inline' https:` peut être fait sans étendre le matcher).

## 10. SEC-007 / BUG-002 (reset password) — Findings complémentaires gardés séparés

- **Codex BUG-002** : race TOCTOU sur consommation du token reset.
- **Opus SEC-006** : token stocké en clair (cuid utilisé tel quel).
- **Arbitrage** : **gardés séparés** — vecteurs orthogonaux. Le fix Codex (consommer atomiquement) ne résout pas la fuite par lecture DB ; le fix Opus (hash + random bytes) ne résout pas la race. Les deux ont leur ID propre (SEC-007 + BUG-002).

---

## Synthèse

- **Findings unique Codex retenus** (4) : SEC-015 (avatar), SEC-016 (JSON.parse state), SEC-017 (HMAC API v2), PERF-011 (logo), BUG-002 (reset race).
- **Findings unique Opus retenus** (44) : majorité des findings auth/2FA, booking, CSP, perf — Opus a une couverture plus large.
- **Overrides contextuels Clever Cloud appliqués** : 3 (BUG-001 → P0, SEC-100 → P1, SEC-106 → P1).
- **Doublons fusionnés** : 5 paires (SEC-101+codex SEC-001, SEC-103+codex SEC-002, SEC-100+codex SEC-003, SEC-204+codex SEC-004, SEC-201+codex SEC-005), 1 triple (SEC-009 = codex SEC-007 + opus SEC-008,009).
- **Aucun finding perdu sans justification** — tous tracés dans `audit-final.md` ou cette annexe.
