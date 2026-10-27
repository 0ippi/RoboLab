# Kopioi sivuston tarvitsemat hahmot sovelluksesta: robots.js ja hahmojen animaatiot styles.css:stä.
# Aja aina, kun hahmoja muutetaan:  powershell -ExecutionPolicy Bypass -File website\update-assets.ps1
$root = Split-Path $PSScriptRoot -Parent
$assets = Join-Path $PSScriptRoot "assets"
New-Item -ItemType Directory -Force $assets | Out-Null
Copy-Item (Join-Path $root "robots.js") (Join-Path $assets "robots.js") -Force
$css = Get-Content (Join-Path $root "styles.css") -Encoding UTF8 | Where-Object { $_ -match '^\.robot|^@keyframes rb-|^\[data-motion="reduced"\] \.robot' }
# rb-roam-animaatio on monirivinen: otetaan se kokonaan
$all = Get-Content (Join-Path $root "styles.css") -Encoding UTF8 -Raw
$roam = [regex]::Match($all, '@keyframes rb-roam \{[\s\S]*?\n\}').Value
$enc = New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText((Join-Path $assets "robots.css"), "/* Copied from the app's styles.css by update-assets.ps1 */`n" + (($css | Where-Object { $_ -notmatch '^@keyframes rb-roam' }) -join "`n") + "`n" + $roam + "`n", $enc)
Write-Host "Assets updated in $assets"
