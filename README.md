# DevisNord

Devis IA mobile-first pour artisans du Québec (déneigement, entretien, petite rénov).

## Démarrage local

```bash
cp .env.example .env   # ajouter OPENAI_API_KEY (Groq recommandé)
npm install
npm start              # http://localhost:3850
```

Sans clé API : **mode démo** (devis estimatifs mock + PDF + auth).

## Fonctionnalités MVP

- Landing + tarifs (FR)
- App : notes, micro (Web Speech), photo, lignes éditables, profil, historique
- IA Groq/OpenAI-compatible → JSON devis
- TPS 5 % + TVQ 9,975 %
- PDF téléchargeable
- Auth email/mot de passe (stockage JSON — voir limitations dans plan.md)
- Stripe Checkout stubs

## Deploy

Render web service + repo GitHub `Freeze545/devisnord`. Voir `plan.md`.
