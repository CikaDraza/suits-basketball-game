# Dribling — korekcija posle vizuelne povratne informacije

Datum: 2026-11-07. Grana: `feat/biomechanics-controls-inbound`, osnova `82617bc`.
Ovaj zapis dopunjuje istorijski [S01 izveštaj](S01_IMPLEMENTATION_REPORT.md).
Korisnik je prijavio da prvi S01 i dalje izgleda ukočeno i izričito zatražio
prirodnije opružanje ruke, laktove uz telo i crossover. Dvoručni hold sa laktovima
spolja treba sačuvati.

## Uzrok i korekcija

Prvi S01 je dodao fazni rad šake, ali su amplituda 14/13 cm i bočni elbow pole
zadržali lakat previsoko i previše spolja. Dlan je mogao da dodiruje loptu dok je
ostatak ruke i dalje delovao ukočeno. Zato samo provera kontakta nije dovoljna.

`handContactPose.ts` sada koristi pole prema dole i blago iza trupa samo za
dribling. Hold/catch ciljevi i njihov raširen položaj laktova ostaju isti. Visina
vrha lopte i amplituda dlana su kalibrisane prema stvarnim dužinama oba riga:

| Profil | Vrh centra lopte | Spuštanje dlana | Povlačenje ka telu / kuku |
| ------ | ---------------: | --------------: | ------------------------: |
| Shaq   |           1,30 m |          0,27 m |             0,10 / 0,16 m |
| Chuck  |           1,20 m |          0,25 m |             0,08 / 0,14 m |

Šaka potiskuje loptu, nastavlja udobno opružanje nakon puštanja i vraća se za
sledeći kontakt. Ne prati loptu do poda. Veće probne amplitude 30/28 cm i 32/30 cm
aktivirale su limite dohvata; izabrano podešavanje ostaje pre tog ograničenja.
Palm socket-i, GLB, prsti i limiti zglobova nisu menjani. Lopta i dalje ima jednog
vlasnika transformacije i postojeću fazu odskoka; ruka nema zaseban sat.

Sačuvane lokalne palm socket pozicije (metri u prostoru hand kosti): Shaq L
`[-.001,.072,-.046]`, R `[.001,.069,-.046]`; Chuck L `[-.001,.060,-.036]`,
R `[.001,.053,-.034]`. Njihove zasebne orijentacije i nezavisni kosturi instanci
ostaju iz postojeće kalibracije u `palmSockets.ts`.

Crossover koristi postojeću kontinuiranu putanju: zahtev čeka sledeći vrh,
lopta prelazi preko tela, a aktivna ruka se predaje pri kontaktu sa podom. Desna
palica sada bira levu/desnu ruku i omogućava dribling u mestu. Podrazumevani
tasteri su Z/C; na telefonu ○/✕. Izbor ruke ostaje do sledećeg zahteva i sam ne
pomera telo. Kratki pritisci čuvaju se u jednom redu događaja do physics tick-a.

## Povezane korisničke korekcije

- Širi oslonac i duži obični koraci; Q stav koristi nižu karlicu, razmaknuta kolena
  i kraće korake i kada igrač slobodno ide ka lopti. Kapsula se ne spušta.
- Početak i New Duel počinju sa leve aut linije. Strelac zadržava posed; aut
  pripada protivniku poslednjeg igrača koji je dodirnuo loptu. Početno raspucavanje
  ostaje za kasnije.
- Pauza → Controls ima odvojene Offense/Defense i Gamepad/Keyboard/Mobile mape,
  učenje pritiskom i čuvanje u `suits.controls.v1`. Komanda učenja se čeka do
  puštanja; reset, odspajanje i neutralni položaj imaju regresije. Nestandardne
  trigger ose sa početkom −1 podržane su kroz eksplicitno dugme „Kalibriši neutralni
  položaj“. Kalibracija se čuva za model kontrolera i raspored osa. Ne nagađamo da
  je držana palica neutralna. Pauza/blur otkazuju pripremu šuta, umesto izbačaja pri nastavku.

Ovo su ograničene korekcije zatražene posle S01. Ne predstavljaju kompletan S02,
S03 ili S06: nema opšteg intent replay-a, novih tehnika balansa ili automatske
reakcije odbrane na crossover.

## Stvarno izvršene provere

Unit proba koristi stvarne GLB rigove, obe ruke, 20/30/60/120 Hz, mirovanje,
kretanje, okret, crossover i osam ponovljenih povrataka u hold. Nov test traži
više od 18 cm rada dlana, opružanje lakta ispod 40° i manje od 15 cm bočnog
izlaska lakta u odnosu na rame. Prethodni pragovi kontakta, penetracije, brzine,
zgloba i drifta ostaju aktivni.

| Izmereno kroz unit matricu            | Shaq          | Chuck         |
| ------------------------------------- | ------------- | ------------- |
| Rad dlana                             | 27 cm         | 25 cm         |
| Najispruženiji lakat L/R              | 28,4° / 33,3° | 26,7° / 36,5° |
| Najveći bočni izlazak lakta od ramena | <9,2 cm       | <9,2 cm       |
| Najveća IK target greška              | <0,18 mm      | <0,18 mm      |

Ove vrednosti su provere izolovanog riga, ne tvrdnja da je browser radio pri
120 FPS. Softverski WebGL i simulirani Gamepad API ne zamenjuju probu fizičkog
kontrolera na korisničkom uređaju.

Browser `slice2.spec.ts`: **4/4 PASS**, obe ruke/modela, hold, Q hold, mirovanje,
hod, okret i crossover; običan render i cap20. Stvarno opaženo 9,06–9,44 FPS na
softverskom WebGL-u, uz fiksnu Rapier simulaciju od 60 Hz. Izmereni render raspon
dlana: Shaq L/R 268–270 / 266–269 mm; Chuck L/R 250 / 246–250 mm. Registrovani
kontakti poda imaju centar na y=0,13 m. Uključene su provere oba dlana pri hold-u,
top kontakta i slobodnog odskoka pri crossover-u; postojeći wrist limit ostaje 65°.

Sačuvano je 40 faznih screenshot-ova i četiri kadra posle kretanja u
`playtest/dribble-feedback-visual/` i `playtest/dribble-feedback-visual-alt/`.
Svaka proba završena je sa `errors: []` za page/console/network. Uglovi su zamenjeni
u drugoj probi da telo ne zaklanja aktivnu desnu šaku. JSON observacije sadrže fazu,
socket-e i zglobove iz stvarne simulacije. Ovo su kadrovi pokreta, ne video ili mocap.

Pun browser run: **35/37 PASS** (`playtest/dribble-feedback-regression`, 8,5 min).
Sva četiri dribble testa, oba post-motion i oba Q-grounding profila prolaze.
Preostali padovi su dijagnostikovani i ispravljeni:

- Test mapiranja je tražio nejedinstven `role=status`: HTML `output` takođe ima
  tu ulogu. Selektor je ograničen na poruku učenja.
- Chuck @20Hz test odbrane uzorkovao je najmanje šest kadrova, pa je pri stvarnih
  oko 7 FPS igrač otišao na 3,35 i 3,67 m od protivnika, van `guardRange=3.2`.
  Ispravno je prešao u običan hod. Scenario sada koristi analogni intenzitet 0,45
  i proverava domet/stav u svakom kadru. Pragovi klasifikacije 0,8/0,4/0,5 nisu
  sniženi; sirovi kadrovi i izveštaji se čuvaju i pri neuspehu.

Posle korekcija ponovljeni su controls/input/locomotion: **14/14 PASS**, 3,7 min,
`playtest/dribble-feedback-final-input`. Obuhvaćena je i nova regresija otkazivanja
napunjenog šuta pri pauzi, stvarni remapirani touch ulaz, čuvanje posle reload-a,
kalibracija trigger-a na osi 2 i oba gait profila na običnom/cap20 renderu.
Pun paket od 38 testova nije ponovo pokretan; naveden je odvojeni puni run i tačan
opseg ponovljene provere, umesto tvrdnje da su svi prošli u jednom izvršavanju.

Završno: **78/78 unit PASS**, TypeScript, ESLint, Prettier i produkcioni build
PASS. Build zadržava postojeće upozorenje na velike Three/Rapier JS chunk-ove.
Logovi: `/tmp/suits-feedback-unit-complete.log`, `/tmp/suits-feedback-browser.log`,
`/tmp/suits-feedback-final-input.log`, `/tmp/suits-feedback-format-final.log`.

Korisničko prihvatanje izgleda ostaje odvojeno od zelenih testova. Fizički gamepad
nije bio dostupan; browser proba koristi jasno simuliran Gamepad API, uključujući
nestandardni kontroler sa trigger-om na osi 2 i neutralom −1.

## Promenjeni fajlovi

- `handContactPose.ts`, `game-config.json`: položaj lakta, vrh lopte i rad dlana.
- `Character.tsx`: širina oslonca i smer kolena, uz postojeće world planted feet.
- `Duel.ts`, `runtime.ts`, `types.ts`, `gameStore.ts`: izbor ruke u mestu, inbound
  lifecycle i pravilo poseda; reset input-a poništava napunjeni šut.
- `controlBindings.ts`, `gamepadInput.ts`, `controlContext.ts`, `inputStore.ts`,
  `controlSettingsStore.ts`, `useGamepadPause.ts`: zajedničko mapiranje i kalibracija.
- `ControlsSettings.tsx`, `useControlCapture.ts`, `useGamepadMonitor.ts`,
  `PauseMenu.tsx`, touch/keyboard adapteri, `useGameControls.ts`, `HelpScreen.tsx`
  i scoped CSS: UI i ulazi za postojeće akcije.
- Unit i browser regresije: ceo dribble ciklus i ekstenzija, kratki input događaji,
  mape/kalibracija, pauza, produkcioni inbound i domet odbrambenog scenarija.
