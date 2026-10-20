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
- **Story-Intro**, Shop mit Upgrades, Rekorde

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
`HollowPines.exe` ist eine portable Version ohne Installation. Doppelklick genügt. Sie startet im Vollbild (F11 schaltet um).
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
| Q | Scanner (zeigt Beute) |
| B | Böller werfen (lockt Monster weg) |
| H (halten, am Van) | Abfahren |
| M | Mikrofon stumm |
| Esc | Pause (Host: Spieler kicken) |
