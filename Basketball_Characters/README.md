# Shaq i Charles — verzija sa pravim mesh glavama

Glave su ponovo generisane u Tripo H3.1 iz četiri prikaza. Nos, usne, kapci, uši, vilica i potiljak imaju stvarnu 3D geometriju. Prethodne površine sa nalepljenim fotografijama uklonjene su. Telo i kostur su zadržani; Shaqu je stanjen donji rub sakoa.

| Lik              | Visina | Masa za fiziku | Trouglovi |
| ---------------- | -----: | -------------: | --------: |
| Shaquille O’Neal | 216 cm |         150 kg |    14,492 |
| Charles Barkley  | 198 cm |         138 kg |    14,629 |

Shaq ima izduženiju i jaču vilicu, normalan uži razmak očiju i tanku teksturu crnih/sedih dlačica uz kožu. Brada nema skup volumenski hair sistem. Charles ima širu, zaobljeniju glavu, kompaktniju bradu, šire oči sa blagim nagibom i naglašenim uglastim obrvama. Charles je bez brade i brkova. Garderoba je crno odelo sa belom košuljom i crnom kravatom za Shaqa, odnosno sivo odelo, bela košulja i tamna kravata za Charlesa.

Sličnost je stilizovana i približna. Ovo nisu 3D skenovi stvarnih osoba. Facijalne kontrole su osnovne; kompletan FACS, fonemi i automatski lip-sync nisu uključeni.

## Fajlovi

- `models/shaquille_oneal.glb` i `models/charles_barkley.glb`: kompletni likovi.
- `source_heads/`: originalne nove Tripo glave za dalju obradu. Ti izvorni fajlovi imaju Tripo koordinatni sistem i nisu verzije već uklopljene u telo.
- `previews/`: prednji i bočni prikazi, prikaz bez teksture, zajednička razmera i demonstracija mimike.
- `facial-controls.js`: mali funkcionalni kontroler za Three.js/React Three Fiber.
- `*_verification.json` i `*_rig_check.json`: stvarno izmerene provere.
- `Tripo_Credit_Report.md`: svih 19 Tripo zadataka i stvarni trošak.

## Jedinice, rig i materijali

Glavni modeli koriste metre, +Y nagore i +Z napred. Stopala su na podu; u aplikaciji počni sa scale=1. Shaq je 9,09% viši od Charlesa.

Oba modela imaju 65 kostiju sa Mixamo nazivima i hijerarhijom. Neutralna rest/bind poza je T-poza. Retargeting tuđih Mixamo body klipova i dalje treba prilagoditi konkretnom projektu.

Svaka ugrađena tekstura je 2048 × 2048. Telo i glava imaju PBR base-color, normal i roughness/metallic teksture. Usta, zubi i jezik koriste jednostavne PBR materijale. Metallic faktor je 0. Nisu potrebne dinamičke refleksije ili senke.

Mase 150/138 kg upisane su u metadata i manifest. GLB ne postavlja Rapier masu samostalno: postavi je u kontroleru i prilagodi spring/damping i kretanje težem telu. Za ecctrl podesi kapsulu prema trupu; automatski collider cele T-poze obuhvatio bi i ispružene ruke.

## Pokretanje lica

`FaceDemo` je četvorosekundni GLB klip za treptanje, pogled i vilicu. Sadrži samo morph animaciju lica. Nema transformacionih kanala kostiju tela, pa sam po sebi ne nameće T-pozu tokom hodanja. Idle/walk/run/jump klipovi nisu uključeni.

Za direktnu kontrolu koristi `createFaceController(clonedScene)`. Vratiće funkciju koju možeš pozivati u `useFrame`:

```js
const setFace = createFaceController(clonedScene);
setFace({ blinkLeft: 0, blinkRight: 0, jawOpen: 0.4, gazeX: 0.5, gazeY: 0 });
```

`blinkLeft`, `blinkRight` i `jawOpen` su od 0 do 1. `gazeX` i `gazeY` su od -1 do 1; pozitivan gazeX pomera pogled ka +X, a pozitivan gazeY nagore. Za nezavisne skinned instance koristi `SkeletonUtils.clone(scene)` i zaseban AnimationMixer.

Modeli izlažu `eyeBlinkLeft`, `eyeBlinkRight`, `eyeLookLeft`, `eyeLookRight`, `eyeLookUp`, `eyeLookDown` i `jawOpen`. Kontrole su raspoređene preko kože glave, izdvojenih mreža očiju i donjih delova usta. Kontroler pronalazi sve odgovarajuće morph targete i prigušuje pogled dok je oko zatvoreno.

Nemoj istovremeno voziti iste morph vrednosti ručno i kroz `FaceDemo` bez pravila prioriteta; AnimationMixer bi inače mogao da prepiše ručno zadate vrednosti. Za produkcijski prikaz obično koristi ručnu kontrolu, a FaceDemo služi za proveru.

Kontroler pri inicijalizaciji isključuje castShadow/receiveShadow na mesh-evima. U Canvas-u takođe isključi senke ako nisu potrebne. Ne dodaj reflektivne kamere ili screen-space reflection prolaze.

## Provereno

Provereni su GLB import, visine, broj trouglova, 2K slike, skin težine svih korišćenih vertex-a i neutralna poza. U nezavisnom Blender importu testirani su glava, oba lakta, potkolenice i stopala. Facijalni targeti imaju konačne, nenulte pomeraje, neutralne vrednosti su 0, a FaceDemo je ponovo uvezen i odigran.

Svi glavni modeli ostaju ispod 15.000 trouglova. Projekat React/Rapier/ecctrl nije dostavljen, pa runtime sudari, kretanje i retargetovani body klipovi nisu testirani u konkretnoj igri.

## Shaq — popravka šaka, 7. novembar 2026.

`models/shaquille_oneal.glb` sada sadrži popravljene `JOINTS_0`/`WEIGHTS_0` atribute
šaka i odgovara aktivnom primerku u igri. Geometrija, teksture, rig i FaceDemo nisu menjani.
Prethodni verification/rig-check izveštaji opisuju raniju proveru izvornog asset-a;
novi testovi dodatno pokrivaju pojedinačno savijanje prstiju i 324 stres poze.
Detalji i checksum-i: [izveštaj o popravci](../docs/shaq-finger-skinning-fix.md).
