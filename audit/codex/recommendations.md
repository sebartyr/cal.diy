# Top 10 actions prioritaires

1. Corriger les callbacks OAuth sans nonce (`SEC-001`).
   Supprimer les exemptions, exiger un state signe ou stocke serveur, et refuser tout callback invalide avant l'echange de code.

2. Durcir la protection SSRF webhook (`SEC-002`).
   Bloquer metadata/link-local/loopback meme en self-host, normaliser IPv6-map, revalider DNS et redirects au moment de l'envoi.

3. Ajouter un verrou ou une contrainte contre le double booking (`BUG-001`).
   Court terme : advisory lock transactionnel par slot. Moyen terme : contrainte d'exclusion Postgres ou table de reservations avec expiration.

4. Retirer les secrets du build Docker (`SEC-004`).
   Utiliser des placeholders au build et injecter `NEXTAUTH_SECRET`/`CALENDSO_ENCRYPTION_KEY` uniquement au runtime.

5. Migrer les secrets chiffres vers AES-256-GCM avec version d'enveloppe (`SEC-003`).
   Lire l'ancien CBC, re-chiffrer progressivement en GCM, et ajouter detection d'integrite obligatoire.

6. Limiter les uploads avatar avant decode (`SEC-006`).
   Ajouter max length Zod, max bytes decode, magic bytes, limites de pixels et rejection rapide des formats inattendus.

7. Rendre les codes email single-use (`SEC-007`).
   Remplacer le TOTP deterministe par des tokens aleatoires hashes, scopes par objectif, consommes atomiquement.

8. Etendre la CSP progressivement (`SEC-005`).
   Commencer par `Report-Only` sur pages booking/profil/embed, corriger les violations, puis passer en enforcement.

9. Corriger les races de reset password (`BUG-002`).
   Consommer le token par `updateMany` conditionnel dans la meme transaction que le changement de mot de passe.

10. Reduire le cout de `/api/logo` (`PERF-001`).
    Plafonner les telechargements, valider les images, et cacher le rendu redimensionne par hash.
