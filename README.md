# 🌲 Hollow Pines

Koop-Horror im Browser für **1–4 Spieler**. Ihr schuldet Mr. Crane 40.000 $ und sollt das verlassene
Ferienlager Camp Hollow Pines ausräumen. Jede Nacht gilt eine Quote, und um 4 Uhr müsst ihr weg sein.
Im Wald ist etwas, und es hört zu.

## Features
- **Eigene 3D-Engine** auf Three.js: dynamische Auflösung und automatische Grafik-Stufen, damit es auch auf Schul-PCs (Core i3, Intel-Grafik) flüssig läuft
- **Physik** (cannon-es): Beute fällt, rollt und zerbricht, Stöße kosten Wert und machen Lärm
- **3 Inventar-Slots** wie in Minecraft (1/2/3 oder Mausrad)
- **3 Monster:** *Der Blasse* (jagt nach Geräuschen), *Die Puppe* (bewegt sich nur, wenn niemand hinsieht), *Der Kriecher*
- **Jump Scares**, zufällige Schreckmomente, Blutmond- und Nebelnächte
- **Mikrofon-Erkennung** (optional): Monster hören, wenn du sprichst; dazu Voice-Chat, bei dem du nahe Mitspieler lauter hörst
- **Server-Browser:** öffentliche Räume mit Namen, private Räume per Code, Max-Spieler, Kicken, Einstieg in laufende Spiele
- **Story-Intro**: läuft beim allerersten Spielen automatisch (ohne Überspringen), danach nur noch über „Story ansehen“
- **Shop mit Tages-Freischaltung**: jeder geschaffte Tag schaltet neue Gadgets frei (bis Tag 7), z. B. Item-Scanner, Polenböller, Crane-Deal (+Geld), Monster-Radar, Laufschuhe, Quote senken. Gadgets funktionieren erst, wenn sie gekauft sind (Regeln zentral in `js/game/shop.js`)
- **Verstecken in den Camp-Hütten**: in Hütten und der Lodge können dich die Monster nicht sehen, Geräusche dringen nur gedämpft nach draußen
- **Story**: Mr. Crane schreibt nach jeder Nacht eine SMS, seltene **Tonbänder von 1987** erzählen, was damals im Camp passiert ist
- **Van-Upgrade**: Discokugel, Kühlbox mit Energy-Drinks (Ausdauer lädt im Laderaum schnell), Radio mit 4 Sendern und Hupe als Monster-Köder
- **Geisterblick-Brille** (X): teures Premium-Gadget ab Tag 1, zeigt alle Monster rot durch Wände, 3 Stufen
- **Adrenalin-Spritze** (T): 8 s unendlich Ausdauer und +30 % Tempo
- **Spielstände**: Esc → 💾 Speichern (eigene Slots überschreiben/löschen/umbenennen), Hauptmenü → „Spiel laden“. Autosave zu jeder Nacht, alle 45 s und beim Verlassen/Schließen; „▶ Weiterspielen“ im Menü
- **Grafik ändern ohne Spielverlust**: „Übernehmen & neu laden“ speichert vorher und setzt das Spiel nach dem Neuladen genau dort fort
- **Eigene Tastenbelegung**: Steuerung → Taste anklicken → neue Taste drücken (doppelte Belegungen werden getauscht)
- **Editor** (Hauptmenü → 🛠 Editor): eigene Karten mit Hütten, Lodges, Schuppen, Kapellen, Friedhöfen, Wohnwagen, Zelten, Kisten, Steinkreisen, See, Beute- und Monster-Spawn-Punkten; beliebig viele Monster (bis 40); Van in Farbe, Größe (bis 2,5×), Ausstattung und Radiosender; Regeln (Quote, Nachtlänge, Startgeld, Beute, Nebel, Bäume). Speichern, Export/Import als Datei, 4 Vorlagen, „▶ Testen“
- **Eigene Karten im Mehrspieler**: in der Lobby wählt der Host Karte oder Spielstand – die Mitspieler bekommen die Karte automatisch
- **Easter Eggs**: ein paar Geheimnisse sind versteckt …
- **Polenböller** (V): 5× stärkere Explosion, verscheucht Monster im Umkreis
- **Van als Safe-Zone**: Schiebetür offen, im Laderaum können Monster dich weder sehen noch hören – mit Party-Lights und Party-Musik
- **Neue Sounds**: Fanfare bei geschafftem Tag, Van fährt weg, Shop-Musik, Radar-Piepen, große Explosion

## Auf Netlify veröffentlichen
Es ist **kein Build nötig**, die Seite ist rein statisch.

**Variante A (automatisch über GitHub):**
1. Auf [app.netlify.com](https://app.netlify.com) „Add new site“ → „Import an existing project“ → GitHub → `Horror-Game` wählen
2. Build command leer lassen, Publish directory `.`. Beides steht schon in `netlify.toml`.
3. „Deploy“. Bei jedem Push auf GitHub aktualisiert Netlify die Seite selbst.

**Variante B (ZIP):** `HollowPines-netlify.zip` entpacken und den Ordner auf [app.netlify.com/drop](https://app.netlify.com/drop) ziehen.

Mehrspieler funktioniert über das Internet, auch wenn ihr in **verschiedenen Netzwerken** seid. Spieler werden direkt
verbunden (WebRTC), bei Bedarf über Umleitungs-Server (TURN). Einstellbar in `js/config.js`.

## Windows-Version (.exe)
Unter **Releases** gibt es zwei Dateien:
- `HollowPines-Setup.exe` – Installer mit Desktop- und Startmenü-Verknüpfung (deinstallierbar über „Apps“)
- `HollowPines.exe` – portable Version ohne Installation. Doppelklick genügt.

Beide starten im Vollbild (F11 schaltet um). Neues Release ohne Git: GitHub → *Actions* → *Release (Windows .exe)* → *Run workflow* → Version eintragen.
Selbst bauen:
```bash
cd desktop
npm install
npm run dist
```
Die fertige Datei liegt dann in `desktop/dist/HollowPines.exe`.

## Lokal starten
```bash
node server.js
```
Dann http://localhost:5173 öffnen.

## Steuerung
| Taste | Aktion |
|---|---|
| WASD / Shift / Leertaste / C | Laufen / Sprinten / Springen / Ducken |
| E / G / Linksklick | Aufheben / Ablegen / Werfen |
| 1 2 3 / Mausrad | Slot wechseln |
| F | Taschenlampe |
| Q | Item-Scanner (zeigt Beute, erst im Shop kaufen) |
| B | Böller werfen (lockt Monster weg) |
| V | Polenböller werfen (5× Explosion, verscheucht Monster) |
| H (halten, am Van) | Abfahren |
| X | Geisterblick-Brille: alle Monster kurz durch Wände sehen (Shop, ab Tag 1) |
| T | Adrenalin-Spritze (Shop, ab Tag 2) |
| J (am Van) | Hupe: lockt alle Monster zum Van |
| R (am Van) | Van-Radio: Party FM, Synthwave 87, Spieluhr, Aus |
| M | Mikrofon stumm |
| Esc | Pause (Host: Spieler kicken) |
