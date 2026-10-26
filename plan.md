# DevisNord — Plan produit & économique

## Idée (décision figée)

**DevisNord** : devis IA ultra-simple, mobile-first, pour artisans solo au Québec (déneigement, entretien, petite rénov).  
Wedge vs SubmitX / QuoteAI / BatiCore : **voix + caméra → devis pro en ~1 min**, taxes **TPS 5 % + TVQ 9,975 %**, PDF/partage, freemium pas cher.

Pas un ERP. Pas de comptabilité complète. Juste sortir un devis soigné sur iPhone pendant que le client est encore là.

## Concurrentiel (note courte)

| Acteur | Position | Notre angle |
|--------|----------|-------------|
| SubmitX / QuoteAI | Devis IA plus généralistes / anglophones | Québec FR + taxes QC + UX terrain |
| BatiCore / ERP construction | Complets, lourds, chers | Solo : 3 gestes, pas de formation |
| Word / Excel | Gratuit mais lent | 1 minute, PDF brandé |

## Architecture MVP livrée

- Landing FR + tarifs + app mobile (création texte/voix/photo, lignes éditables, profil, historique)
- API Express + Groq/OpenAI-compatible → JSON devis structuré
- Taxes QC automatiques, PDF (pdfkit)
- Auth email/mot de passe (JSON fichier) — **limitation** : pas de reset email ; sur Render free le disque est **éphémère** (données perdues au redéploiement). Pour durcir : disque persistant Render ou Postgres.
- Stripe Checkout **stubs** (env PRICE ids) — n’envoie pas de débit sans clés

## Coûts estimés (CAD, ordres de grandeur)

| Poste | Conservateur | Notes |
|-------|--------------|-------|
| Groq (llama / qwen) | ~0–15 $/mois | Souvent gratuit/crédits au début ; ~0,001–0,01 $ / devis |
| OpenAI (si bascule gpt-4o-mini) | ~5–40 $/mois | Selon volume |
| Render web free | 0 $ | Cold start ; passer Starter ~7 USD/mois si besoin |
| Domaine .ca / .com | ~15–20 $/an | Optionnel au début (URL onrender.com OK) |
| Stripe | 2,9 % + 0,30 $ / txn | Seulement si clients paient |
| Temps Lucas | iPhone seulement | Clés + Stripe + partage lien |

**Pas de garantie de revenus.** Les scénarios ci-dessous sont des hypothèses pour planifier, pas des prévisions.

## Scénarios de revenus (hypothèses)

Hypothèses de prix : Gratuit 0 $ · Pro 29 $/mois · Business 79 $/mois.

### Conservateur
- 40 inscrits gratuits, **3 Pro**, 0 Business  
- CA mensuel ≈ 87 $  
- Coûts ≈ 10–25 $ (IA + éventuel Render)  
- Marge ≈ faible / validation d’intérêt

### Base
- 150 inscrits, **20 Pro**, **2 Business**  
- CA ≈ 20×29 + 2×79 = **738 $/mois**  
- Coûts ≈ 40–80 $  
- Marge brute indicative ≈ 650 $/mois

### Optimiste
- 500 inscrits, **80 Pro**, **10 Business**  
- CA ≈ 80×29 + 10×79 = **3 110 $/mois**  
- Coûts ≈ 150–300 $ (IA + hébergement + Stripe)  
- Marge indicative ≈ 2 800 $/mois

Ces chiffres **ne sont pas garantis**. Ils dépendent d’acquisition réelle (Facebook groupes artisans QC, bouche-à-oreille déneigement, partenaires quincaillerie).

## Étapes restantes pour Lucas (iPhone)

1. **Ouvrir l’URL publique** sur Safari iPhone → créer un compte → générer un devis test.  
2. **Clé Groq** (déjà possible via compte groq.com) : Dashboard Render → Environment → `OPENAI_API_KEY` (ou `OPENAI_API_KEY_P0` + `P1` si limite de longueur MCP).  
   - `OPENAI_BASE_URL=https://api.groq.com/openai/v1`  
   - `OPENAI_MODEL=llama-3.3-70b-versatile` (ou modèle Groq actuel)  
3. **Stripe** (quand prêt à monétiser) : compte Stripe → produits Pro/Business → coller `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`.  
4. **Domaine** (optionnel) : pointer un domaine vers le service Render.  
5. **Persistance** : passer sur plan avec disque ou Postgres avant d’avoir des clients payants (sinon historique effacé au redeploy).  
6. **Acquisition** : messages dans `marketing.md` — groupes FB « entrepreneurs Québec », « déneigement », Marketplace services.

## Clés / secrets à fournir

| Variable | Obligatoire ? | Rôle |
|----------|---------------|------|
| `OPENAI_API_KEY` (+ split P0..Pn) | Pour IA réelle | Groq ou OpenAI |
| `OPENAI_BASE_URL` / `OPENAI_MODEL` | Recommandé | Endpoint + modèle |
| `SESSION_SECRET` | Recommandé prod | Cookie sessions |
| `STRIPE_SECRET_KEY` | Non (stub) | Paiements |
| `STRIPE_PRICE_PRO` / `BUSINESS` | Non (stub) | Price IDs |
| Domaine + DNS | Non | Marque |

## Prochaines itérations produit

- Vision réelle (envoyer l’image au modèle multimodal)  
- Magic link / Apple Sign-In  
- Envoi devis par SMS/courriel  
- Templates métier (déneigement saison vs visite)  
- Postgres + backups  
