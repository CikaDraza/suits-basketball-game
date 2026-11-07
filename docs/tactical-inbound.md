# Taktičko ubacivanje lopte

## Ponašanje

Svaki koš, aut i prekršaj vremena vraća loptu na postojeću levu aut liniju
`{ x: 5.2, y: 1, z: 7.85 }`. Ostaje 5 sekundi za pozicioniranje, zatim 5 sekundi
za zahtev za dodavanje preko Q / touch dugmeta / gamepada. Rano pritiskanje se
obrađuje kao uključivanje/isključivanje stava za zagrađivanje tokom pozicioniranja;
ne ostaje sačuvano kao dodavanje za kasniji prozor. Q u otvorenom prozoru odmah
traži dodavanje, bez dodatnog pritiska za stav.

Dodavanje uzima stvarni položaj tela iz Rapiera i poslednji animirani položaj
šaka, preveden na trenutni položaj tela. Primalac i šake moraju biti unutar
terena. Cilj se određuje pri izbačaju: lopta potom leti fizički, pa pomeranje
primaoca može dovesti do promašenog hvatanja.
Dok su ruke spuštene ili jedna traži loptu, cilj je tačka prijema ispred grudi,
izračunata iz stvarne pozicije tela. Poza hvatanja uključuje se tek kada lopta
priđe primaocu. To sprečava dodavanje prema spuštenim šakama ili zamišljeno
držanje lopte tokom cele inbound faze.

| Situacija pri izbačaju                                              | Rezultat                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Otvorena linija, uključujući odbranu između primaoca i koša         | Brzo dodavanje u grudi, uz kompenzaciju gravitacije         |
| Odbrana zatvara liniju između aut linije i primaoca, blizu primaoca | Visoki lob preko odbrane                                    |
| Zatvorena linija i primalac unutar 2 m od obruča                    | Neprecizan lob prema tabli, fizički odskok i borba za loptu |

Duboki lob zadržava tačan položaj primaoca u dijagnostičkom `target`, dok se
`aim` namerno prebacuje iza ravni table. Lopta se sudara sa stvarnim colliderima
table/obruča i zadržava brzinu koju izračuna Rapier. Nema automatskog hvatanja
rizičnog loba. Zaštita obuhvata ceo domet zakucavanja i uključuje se i kada
primalac tokom leta utrči u tu zonu. Otvoreno dodavanje u grudi pod košem ostaje
dozvoljeno.

Odbrana preseca pritiskom na R: prozor traje 0.25 s od novog pritiska i zahteva
aktivno dugme i prelazak lopte kroz stvarni domet ruku. Provera koristi ceo
pređeni segment lopte i kretanje odbrambenog igrača između dva fizička koraka,
sa ograničenjem po visini. Dugo držanje R ne produžava taj prozor. Visoki lob
izvan dometa ne može biti presečen samo zbog poklapanja XZ koordinata.

## Odgovornosti u kodu

- `state/gameStore.ts`: numerisani zahtev za dodavanje; pauza i reset čiste zahtev.
  Autoritativni sat, položaj i fazu proverava simulacija.
- `simulation/tacticalPass.ts`: projekcija odbrane na putanju, izbor dodavanja,
  rešavanje početne brzine i provere pređenih segmenata. Nema zavisnosti od Reacta.
- `simulation/inboundPassController.ts`: lansiranje, hvatanje, presecanje, aut i
  obrada kontakta odmah nakon svakog Rapier koraka.
- `physics/ballCollision.ts`: trenutni sensor/collision-group režim. Dodavanja
  fizički udaraju u okruženje; kontakt sa igračima proveravaju dometi šaka i R.
- `entities/DuelArena.tsx`: simulacija pre svakog fiksnog fizičkog koraka, obrada
  leta posle koraka; `useFrame` ostaje za vizuelne efekte.
- `entities/Character.tsx`: poza za prijem i relativni položaj šaka.

Brzina se rešava iz `target = source + velocity * time + gravity * time² / 2`.
Za lob trajanje proizlazi iz uspona i pada oko izračunatog vrha putanje.
Posle lansiranja nema prepisivanja pozicije lopte ili navođenja prema igraču.
Promašaj zadržava fizičku brzinu i postaje slobodna lopta; hvatanje vraća postojeći
dvoručni hvat. Kratak otpušten tap pravca aktivira jab step, a držanje pravca
direktno započinje dribling posle kratkog praga prepoznavanja od 0.1 s.

Parametri su centralizovani u `src/game/data/game-config.json`, sekcija
`inbound.passing`. Nisu dodate biblioteke, novi cache/provider ili izmene GLB-a.

## Provera

`tests/inbound-passing.test.ts` proverava precizan 3D cilj, izbor putanje, granice
terena, visinu presecanja, vremenski prozor R i fizički let/odskok u stvarnom Rapier
svetu. Pokriva i utrčavanje pod koš nakon izbačaja.

`tests/browser/inbound.spec.ts` proverava čekanje 5+5, promenu položaja pre
izbačaja, hvatanje otvorenog dodavanja i loba, stvaran kontakt sa tablom/obručem,
presecanje na R i vraćanje na istu aut liniju posle koša ili auta.
Poseban scenario uključuje CPU kontrole i proverava da CPU sam zatraži dodavanje
i ide ka mestu prijema tokom fizičkog leta.

Završne statičke provere i produkcioni build prolaze; svih **33 unit testa** su
zelena. Svih **7 inbound browser scenarija** prolaze nad produkcionim buildom,
kao i **9 regresija igranja i kontrola** i **2 regresije Q stava**: ukupno **18/18**
browser testova. Screenshotovi letova i fizičkog odskoka su u
`playtest/tactical-inbound/`.
