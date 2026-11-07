# SUITS — The Last Dance

Browser košarkaška igra: React 19, React Three Fiber, Three.js, Rapier i Zustand.

Potrebni su Node.js 22.13+ i npm. Projekat je proveren i na Node.js 24.

```bash
npm ci
npm run dev
```

Development URL: `http://localhost:5173/game/`.

```bash
npm run check         # TypeScript, ESLint, unit testovi i formatiranje
npm run build         # produkcioni build u dist/
npm run test:browser  # browser regresije: input, igranje, resursi i mobilni prikaz
```

Za browser testove prvo instalirati Chromium: `npx playwright install chromium`.
Postojeći Chromium može se zadati preko `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
`PLAYWRIGHT_BASE_URL` omogućava iste testove nad pokrenutim produkcionim preview-om.
Playwright automatski pokreće lokalni server kada već nije pokrenut.

Kontrole: WASD/strelice za kretanje, Space/R za šut ili odbranu, Q/J za post/spin,
Escape za pauzu/nastavak. Na telefonu se koriste džojstik i dva dugmeta u landscape prikazu.

[Analiza strukture, primenjena pravila i rezultati provera](docs/code-review.md).

[Q stav: uzrok propadanja i ispravka oslonca stopala](docs/q-stance-fix.md).

[Shaq: popravka težina prstiju u GLB-u](docs/shaq-finger-skinning-fix.md).

[Taktičko ubacivanje: putanje, fizički odskoci i presecanje na R](docs/tactical-inbound.md).

[Zagrađivanje: kontaktna ruka, traženje lopte i koraci unazad](docs/post-motion-fix.md).

[Dvoručni hvat u post stavu i tap za jab step](docs/held-ball-fix.md).
