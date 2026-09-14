# .tools/

`.tools/node/` is a standalone Node.js runtime pinned for this project only (currently v22.23.2), used because MediData's Angular version requires a newer Node than may be installed system-wide. It is not committed to git (see `.gitignore`) and does not affect Node on the rest of the machine.

Use it via the helper scripts in the project root instead of calling `node`/`npm`/`ng` directly:

```powershell
./dev.ps1              # npm start
./dev.ps1 run build    # npm run build
./dev.ps1 test         # npm test
```

If `.tools/node` is missing (e.g. after a fresh clone), re-download it:

```powershell
Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.23.2/node-v22.23.2-win-x64.zip" -OutFile ".tools/node.zip"
Expand-Archive -Path ".tools/node.zip" -DestinationPath ".tools" -Force
Remove-Item ".tools/node.zip"
Rename-Item ".tools/node-v22.23.2-win-x64" "node"
```
