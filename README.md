# Dual SSH

SSH terminals for up to 4 servers at once (1 server = full window, 2 = side by side, 3-4 = grid).
Servers can be added, edited and removed inside the app; settings are saved per user.

## Run from source
    npm install
    npm start

## Build the installers
Mac (.dmg + .pkg), run on a Mac:   double-click `build-mac.command`  (or `npm run dist:mac`)
Windows (.exe), run on Windows:    double-click `build-windows.bat`  (or `npm run dist:win`)
Both, no local setup:              push this folder to GitHub, then Actions > "Build installers" > Run workflow.
                                   Download the files from the run's "Artifacts".

Installers include everything: users do not need Node.js.

## First launch on a Mac (unsigned app)
macOS asks you to approve apps without an Apple Developer ID. Right-click the app > Open > Open,
or run: xattr -dr com.apple.quarantine "/Applications/Dual SSH.app"

## Windows
SmartScreen may say "Windows protected your PC": More info > Run anyway.
