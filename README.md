# SUITS — The Last Dance

Browser košarkaška igra: React 19, React Three Fiber, Three.js, Rapier i Zustand.

Za razvoj i kompletne provere koristi Node.js 24 i npm. Build podržava Node.js 22.13+, ali test komanda koristi Node 24 opciju `--test-isolation=none`.

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
E za inbound, Escape za pauzu/nastavak. Na gamepadu je inbound zasebno ✕ / A,
Square/X šut, a Triangle/Y stav. Z/C biraju anatomsku levu/desnu ruku na tastaturi.
U odbrani desna palica prati telo i kameru: levo/desno otvara odgovarajuću ruku
sa dlanom napred, napred podiže obe, a dva brza poteza napred uključuju mahanje.
Držanje nazad postavlja obe podlaktice za kontakt; dva brza poteza nazad odguruju
protivnika ispred i u dometu. Između poteza vrati palicu u neutralu.
Neutralni položaj spušta ruke;
obe podignute ruke računaju se kao contest. Četiri Axis smera mogu se podesiti
odvojeno u napadu i odbrani.

Desna palica prati telo igrača i kameru: ka strani lopte daje dva brza bočna
odskoka istom rukom, na suprotnu stranu crossover, napred tri brza prebacivanja
ispred tela, nazad jedno iza leđa. Dva brza poteza nazad daju tri prebacivanja
iza leđa i završavaju na suprotnoj ruci od početne. Vrati palicu u sredinu između
poteza. Pun otklon leve palice pri ovim driblinzima nosi 90% rizika od gubitka
kontrole lopte. U gamepad podešavanjima postoje četiri smera desne palice,
svaki isključivo kao Axis; zasebno mapiranje leve/desne ruke je uklonjeno.
Na telefonu se koriste džojstik i □/△/○/✕ u landscape
prikazu. Mape za napad/odbranu i uređaje podešavaju se i pamte kroz Pause → Controls.

Svaki početak i restart ide sa leve aut linije. Ko postigne koš zadržava posed;
aut pripada protivniku poslednjeg igrača koji je dodirnuo loptu.

[Analiza strukture, primenjena pravila i rezultati provera](docs/code-review.md).

[Q stav: uzrok propadanja i ispravka oslonca stopala](docs/q-stance-fix.md).

[Shaq: popravka težina prstiju u GLB-u](docs/shaq-finger-skinning-fix.md).

[Taktičko ubacivanje: putanje, fizički odskoci i presecanje na R](docs/tactical-inbound.md).

[Zagrađivanje: kontaktna ruka, traženje lopte i koraci unazad](docs/post-motion-fix.md).

[Dvoručni hvat u post stavu i tap za jab step](docs/held-ball-fix.md).

[Gameplay Foundation v2: plan, status S00–S16 i regresioni baseline](plan.md).

[S01: ceo ciklus driblinga, kalibracija i stvarni rezultati provere](docs/gameplay/S01_IMPLEMENTATION_REPORT.md).

[Korekcija driblinga prema povratnoj informaciji: opružanje, laktovi i crossover](docs/gameplay/DRIBBLE_FEEDBACK_FIX.md).

[DRIBBLE-1: smer palice, trajni izbor ruke i zaštićeni post-up](docs/gameplay/DRIBBLE_1_IMPLEMENTATION.md).

Shaq sada podrazumevano koristi odobreni walking model; razvojni URL parametar
više nije potreban. [Arhiva modela, production/staging i provere release-a](docs/release-and-staging.md).
