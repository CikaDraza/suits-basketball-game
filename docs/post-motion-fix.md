# Zagrađivanje i koraci

## Uzroci

- Inbound primalac je automatski dobijao dvoručnu pozu držanja lopte, čak i dok
  lopta čeka na aut liniji. Ta poza je prepisivala pokrete kolena i kukova.
- Faza hoda zavisila je od vremena i jačine komande. Nije uzimala u obzir stvarno
  pomeranje tela, zaustavljanje u kontaktu niti smer kretanja u odnosu na telo.
- Post stav zadržava lice okrenuto od koša. Isti ciklus hoda kao pri trčanju
  unapred zato je davao pogrešan pokret nogu tokom guranja unazad.

## Izmena

Bez lopte i bez Q stava ruke su u prirodnoj pozi. Q tokom prvih pet sekundi
inbounda uključuje/isključuje zagrađivanje. Q tokom prozora za dodavanje odmah
zahteva pas, prema izabranom rasporedu kontrola.

U stavu jedna savijena ruka štiti prostor uz odbranu, a druga traži loptu.
Kontaktna strana bira se iz položaja odbrane u lokalnim koordinatama igrača.
Mrtva zona oko sredine leđa sprečava treperenje leve/desne ruke pri sitnim
pomeranjima. Igrač u inbound stavu gleda ka izvođaču; post sa loptom zadržava
leđa ka košu. Postojeći fizički sudari i guranje ostaju aktivni.

Poza hvatanja koristi se kada lopta priđe ili kada je već u posedu. Dok su ruke
slobodne, fizički cilj za pas je prijem ispred grudi na trenutnoj poziciji tela.

Korak prati pređeno rastojanje Rapier tela. Oslonac pomera stopalo u odnosu na
telo suprotno stvarnom kretanju, a druga noga se podiže i vraća. Dvosegmentna IK
računa kuk–koleno–članak, zadržava dužine kostiju i orijentaciju stopala, uz
anatomski smer savijanja kolena. Isti postupak podržava hod napred, unazad i
bočno. Post koristi kraći i niži korak. Teleport i reset čiste fazu kretanja;
pauza je zamrzava. Kapsula se ne spušta niti menja visinu.

Proceduralni koraci i kontaktna ruka izdvojeni su u
`src/game/entities/locomotion.ts`. Parametri koraka su u sekciji `animation`
postojećeg `src/game/data/game-config.json`. Nema novih biblioteka ili izmene GLB-a.

## Provera

Unit testovi pokrivaju oslonac pri tri smera kretanja, promenu kontaktne strane
i IK pod rotiranim/skaliranim roditeljem bez promene dužina kostiju i rotacije
stopala. Browser scenariji za Shaqa i Chucka čitaju stvarne deformisane tabane i
pozicije kostiju: spuštene ruke, obe kontaktne strane, inbound korak, korak
unazad, podizanje stopala, oslonac i guranje. Postojeća regresija Q stava proverava
da kapsula ostane fiksna i da stopala ne propadaju.

Statičke provere, produkcioni build i svih **36 unit testova** prolaze.
Produkcioni browser scenariji za ruke i korake su u
`tests/browser/post-motion.spec.ts`, a screenshotovi u `playtest/post-motion-final/`.
Provereni su i postojeći lob/chest pas, kontakt sa tablom, presecanje na R,
aut/koš, CPU prijem i pravilo čekanja 5+5.
Ukupno prolaze **22/22 browser testa** nad produkcionim buildom: 4 nova scenarija,
2 za Q oslonac, 7 za inbound, 3 za igranje i 6 za tastaturu/touch kontrole.
