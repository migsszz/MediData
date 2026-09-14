# Runs npm using this project's pinned local Node runtime (.tools/node),
# without touching the system-wide Node install.
# Usage: ./dev.ps1            -> npm start
#        ./dev.ps1 build      -> npm run build
#        ./dev.ps1 run test   -> npm test

param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$localNode = Join-Path $PSScriptRoot ".tools\node"
if (-not (Test-Path $localNode)) {
  Write-Error "Local Node runtime not found at $localNode. See .tools/README.md."
  exit 1
}

$env:PATH = "$localNode;$env:PATH"

if ($Args.Count -eq 0) {
  npm start
} else {
  npm @Args
}
