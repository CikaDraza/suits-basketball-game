# Dvoručni hvat i razdvajanje tapa od držanja

Dok igrač miruje u post stavu sa loptom, obe šake prate zajednički cilj uz loptu,
a laktovi ostaju otvoreni sa strane. Cilj se računa iz stvarnih položaja ramena,
smera tela i veličine lopte. Lopta prati ažuriranu tačku između dlanova. Ovo
ispravlja raniju pozu širokih ruku kod koje je lopta ostajala između udaljenih šaka.

Ruke i noge koriste zajedničku dvosegmentnu IK funkciju u `entities/limbIK.ts`.
Za ruke smer savijanja vodi laktove spolja; za noge zadržava anatomski smer kolena.
Izmena hvata važi za držanje lopte, dok poza post driblinga i traženje lopte bez
posedovanja zadržavaju svoje ponašanje.

Jab step počinje tek kada igrač otpusti kratak tap pravca. Ako pravac ostane
pritisnut, posle 0.1 s prepoznavanja počinju dribling i kretanje, bez prethodne
jab animacije i bez starog čekanja od 0.8 s. Promena pravca bez otpuštanja svih
aktivnih pravaca ne započinje novo čekanje.

Trajanje tastature i touch/joystick inputa meri se na događajima, pa tap ostaje
sačuvan i kada ceo pritisak prođe između dva fizička frejma. Više Rapier koraka
u jednom render frejmu ne uvećava trajanje držanja. Pauza, blur i reset brišu
nedovršene gestove. Gamepad i CPU koriste istu klasifikaciju kroz fizičke korake.
CPU tap za fintu skraćen je ispod novog praga.

Parametri su centralizovani u `handling.jabTapWindow`, `handling.postHoldDrop` i
`handling.postWristGap` u `src/game/data/game-config.json`. HUD prikazuje
`TAP = JAB · HOLD = DRIBBLE`.

Unit testovi pokrivaju tap tek na otpuštanju, direktan dribling pri držanju,
promenu pravca, tap između frejmova i otkazivanje. Browser testovi čitaju stvarne
šake/laktove oba modela, proveravaju udaljenost od lopte i prolaze putanju
tastaturnog inputa za tap, držanje i blur.

Prolaze statičke provere, produkcioni build, **40/40 unit testova** i **25/25
browser testova** nad produkcionim buildom. Screenshotovi oba hvata nalaze se u
`playtest/held-ball-production/`.
