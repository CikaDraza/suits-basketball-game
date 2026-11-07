# Gameplay Foundation v2 — ugovor akcija i input-a

Status: **Proposed**, dokumentacioni ugovor za S02 i naredne tehnike. S00 ne menja
komande. Polazni kod je `465f6e0`; [audit](FOUNDATION_AUDIT.md) beleži ograničenja.
Postojeći `inputStore`, keyboard/touch hookovi i gamepad čitanje u `Duel.ts`
ostaju dok im odgovornost ne bude preneta malim proverljivim zahvatom.

## Postojeće ponašanje

| Izvor/komanda        | Sadašnji smisao                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| WASD ili strelice    | Kretanje relativno kameri; kratak direction tap iz hold-a daje jab, zadržano kretanje prelazi u dribling                        |
| R ili Space / Square | ACTION_A: priprema/puštanje šuta u napadu; contest/steal u odbrani; postojeći triple-tap smash                                  |
| Q ili J / Triangle   | ACTION_B: post/spin, dupli tap flop; tokom inbound pozicioniranja stav/zagrađivanje, u pass prozoru odmah zahtev za dodavanje   |
| Escape               | Pauza/nastavak jednom po fizičkom pritisku                                                                                      |
| Touch                | Analogni joystick i Square/Triangle; Circle i Cross trenutno rezervisani i isključeni                                           |
| Gamepad              | Leva palica, `axes[0..1]`, Square/X `buttons[2]`, Triangle/Y `buttons[3]`; P1 gamepad 0, P2 gamepad 1 uz postojeći CPU fallback |

Keyboard/touch aliasi i izvori već imaju testove oslobađanja i blur/pause cleanup-a.
Gamepad još nema pun ugovor desne palice, trigger-a, profila i disconnect-a.
`inputStore` meri gestove event vremenom, gamepad u simulaciji; S02 mora to da
ujednači. Aktuelni jab tap prozor je **0,1 s**, ne stara dokumentovana granica 0,8 s.

## Predlog kontrola za S02

Kolona tastature za nove akcije je **predlog za proveru**, a ne izmena usvojene
mape. Ne menjati postojeće Q/R/Space alias-e usput. Konačnu mapu i konflikt između
fake/shot/smash potvrditi u slice-u koji ih uvodi.

| Semantička namera                 | Gamepad predlog                      | Tastatura predlog                                                    | Touch ekvivalent                          |
| --------------------------------- | ------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------- |
| Move                              | Leva palica, radijalna magnituda 0–1 | WASD/strelice, normalizovan vektor                                   | Postojeći joystick                        |
| SkillDirection                    | Desna palica, zaseban vektor i gest  | Konfigurabilan klaster ili pointer; izbor otvoren jer je J već alias | Drugi virtuelni stick/gest; oblik otvoren |
| Shoot / Contest                   | Square                               | R/Space, postojeće                                                   | Square                                    |
| Pivot / Post / contextual inbound | Triangle                             | Q/J, postojeće                                                       | Triangle                                  |
| Reach / Steal                     | Circle                               | E, predlog                                                           | Circle, aktivirati tek uz podržanu akciju |
| Jump / Rebound                    | Cross                                | F, predlog; Space ostaje shoot alias                                 | Cross, aktivirati uz S12                  |
| Brace / Body-up                   | L1                                   | C, predlog                                                           | Zaseban držani modifier, UX proveriti     |
| Protect / DefensiveStance         | L2, analogna jačina                  | X, digitalno 0/1, predlog                                            | Analog/digital modifier sa jasnim stanjem |
| Hustle / Drive                    | R1                                   | LeftShift, predlog                                                   | Modifier brzine/drive-a                   |
| Pause                             | Options                              | Escape                                                               | Postojeći pause UI                        |

R2 nema dodeljenu novu akciju. Ne pretpostavljati da različiti uređaji imaju iste
indekse bez `mapping`/profil provere. Nedostupne akcije moraju imati jasno definisan
fallback ili ostati nedostupne, bez tihog izvršavanja druge tehnike.

## Normalizovana namera

Predlog događaja, ne već implementiran TypeScript API:

```ts
type IntentEvent = {
  sequence: number;
  actor: 0 | 1;
  source: 'keyboard' | 'gamepad' | 'touch' | 'cpu' | 'replay';
  action: string; // zatvoren skup kada S02 usaglasi podržane akcije
  edge: 'pressed' | 'released' | 'cancelled';
  occurredAtMs: number; // zajednički monotoni sat
  observedTick: number;
  targetTick: number;
  vector?: { x: number; z: number };
  magnitude?: number;
};
```

Kontinuirane ose/modifier-i i diskretne ivice imaju odvojene kanale. Simulation
korak čita stabilan snapshot osa i red događaja; ne zavisi od broja render frejmova.
`sequence` daje stabilan poredak događaja istog vremena. Događaj između dva koraka
mora opstati i ako je tipka već puštena pre sledećeg koraka. CPU i replay šalju
isti legalni intent; ne postavljaju rezultat tehnike ili protivnički balans direktno.

Adapter prevodi izvor u nameru. Gameplay proverava posed, fazu, balans, energiju,
domet i recovery. Presentation čita ishod. Input ne gura telo, ne pomera loptu,
ne bira pogodak i ne rotira kosti.

## Vreme, magnitude i vlasništvo uređaja

- Mapirati monotoni timestamp na sledeći obradiv simulation tick, jednom. Ne vraćati
  već izvršene korake; definisati granicu starosti i logovati zakašnjele komande.
- Tap/hold/dupli/triple gest meri se istim vremenom za sve izvore. Pragovi su u
  postojećem config-u sa jedinicama; tačne granice/inclusive slučajeve testirati.
- Analogna palica: radijalni deadzone i remap pre magnitude 0–1. Digitalnu dijagonalu
  normalizovati da ne ubrzava √2. Input se registruje odmah; telo zatim ubrzava
  prema svom profilu i kapacitetu.
- Alias release ne gasi akciju koju drugi fizički taster ili izvor još drži.
  Keyboard auto-repeat ne pravi nove `pressed` događaje.
- Jedan aktivni upravljač po akteru. Izbor P1/P2 uređaja, takeover i CPU fallback
  moraju biti eksplicitni. Disconnect čisti ose i držane ivice; nova neutralna
  komanda ne poništava proizvoljno već committed tehniku.
- Pause, blur, promena meča i disconnect čiste input. Resume ne ponavlja stari tap.
  Meni uzima fokus pre gameplay-a. Replay uključuje seed, početni setup i tick-ove.

Sadašnji `__TEST__.step` čeka realno vreme. Nije dokaz tačno N koraka; minimalni
fixed-step/replay seam je planiran u S02, uz očuvanje postojećeg Rapier vlasnika.

## Prioritet, faze i prekid akcije

Redosled: meni/pauza → legalnost po lifecycle-u → committed akcija/recovery →
kontekst trenutnog poseda → nova namera. Q u inbound pass prozoru ostaje trenutni
zahtev; raniji Q tokom positioning-a ne zakazuje automatski kasnije dodavanje.

Svaka tehnika dokumentuje: preduslove, nameru, pripremu, prenos težine, izvođenje,
kontakt/release, fizički rezultat, recovery, cancel/interruption, cenu, animaciono
vlasništvo i testove. Tačni pragovi se određuju u odgovarajućem slice-u, bez
pravljenja svih novih mašina u S00. Nepodržanu nameru treba odbiti sa debug razlogom,
ne zameniti skrivenim potezom.

Tap za fake i triple-tap smash dele postojeći Square: S08/S14 moraju definisati
prioritet i trenutak commit-a. Ne odlagati svaki osnovni šut proizvoljno radi
prepoznavanja gesta. S05 mora razlikovati pivot od dribble direction tapa, a S06
handoff od naredne odluke za prodor.

## Ugovor vlasništva animacije i lopte

- Root položaj/brzina: fizičko telo; ograničeni cinematic izuzetak se izričito
  opisuje i testira. Karlica/noge/stopala koriste postojeći gait i jedan anchor.
- Bazna poza ili budući mixer izvodi se jednom; proceduralno držanje zatim noge IK,
  ruke IK, orijentacija šaka/prstiju i konačne matrice/socket evaluacija. Ako novi
  klip poseduje zglob, njegov mask/blend mora biti eksplicitan pre IK-a.
- Glavu pokreće `Character.tsx`, facial morph-e postojeći face controller; body klip ne prepisuje
  izraze slučajno. Nezavisni kosturi instanci ostaju obavezni.
- Tehnika traži vlasništvo nad konkretnim delovima tela, potom ga vraća u recovery-u.
  Ne uvoditi konkurentske `useFrame` upise u istu kost.
- HELD/DRIBBLING/PASSING/SHOT_RELEASE/FREE_FLIGHT/LOOSE/DEAD_BALL su konceptualne
  odgovornosti, mapirane na postojeći runtime. Svaki prelaz prenosi položaj/brzinu
  jednom. Nema dodatnog paralelnog ball state store-a, hominga ili ball→hand→ball
  kružne zavisnosti.

## Provera pre prihvatanja S02

Proširiti `tests/browser/input.spec.ts`, store/simulation testove i postojeći seam:
isti intent iz sva četiri izvora, tap između tick-ova, alias-i, deadzone/dijagonala,
trigger jačina, P1/P2 takeover, disconnect, pause/blur/reset, ponovljiv replay.
Proveriti i 30/60/120 render režime uz isti 60 Hz gameplay. Ne označiti gamepad
vizuelno proverenim bez stvarnog uređaja ili jasno označene simulacije API-ja.
