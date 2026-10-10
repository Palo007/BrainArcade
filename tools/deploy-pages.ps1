# Publish the Brain Arcade PWA to https://palo007.github.io/BrainArcade/ (GitHub Pages, repo Palo007/BrainArcade, branch gh-pages).
# Publishing is public: run it only on purpose. Run from PowerShell (Git Bash mangles VITE_BASE):
#   powershell -File tools\deploy-pages.ps1
# -Worktree builds another checkout (e.g. a clean temp worktree when this one has uncommitted work).
param([string]$Worktree = (Split-Path -Parent $PSScriptRoot),
      [string]$Repo = 'https://github.com/Palo007/BrainArcade.git')
$ErrorActionPreference = 'Stop'
$out = Join-Path $env:TEMP 'brainarcade-pages'
Remove-Item -Recurse -Force $out -ErrorAction SilentlyContinue
Push-Location $Worktree
try { $env:VITE_BASE = '/BrainArcade/'; npx vite build --outDir $out --emptyOutDir; if ($LASTEXITCODE) { throw 'build failed' } }
finally { Remove-Item Env:VITE_BASE -ErrorAction SilentlyContinue; Pop-Location }
Copy-Item (Join-Path $out 'index.html') (Join-Path $out '404.html')   # SPA deep-link fallback on GitHub Pages
New-Item -ItemType File -Force (Join-Path $out '.nojekyll') | Out-Null
Push-Location $out
git init -q -b gh-pages; git add -A; git commit -q -m 'Deploy Brain Arcade'
git remote add origin $Repo; git push -f origin gh-pages
Pop-Location
Write-Host 'Done: https://palo007.github.io/BrainArcade/'
