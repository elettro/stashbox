# Package DEV v2 Lambda on Windows

These steps build the Lambda zip locally on Windows without changing AWS resources.

## Prerequisites

- Node.js and npm are installed.
- PowerShell is available.
- npm registry access works in your environment.

## Steps

From the repository root:

```powershell
cd radio-api
node --check index.mjs
npm install --omit=dev
New-Item -ItemType Directory -Force dist | Out-Null
if (Test-Path dist\stashbox-radio-api-dev-v2.zip) { Remove-Item dist\stashbox-radio-api-dev-v2.zip }
$items = @('index.mjs', 'package.json', 'node_modules')
if (Test-Path package-lock.json) { $items += 'package-lock.json' }
Compress-Archive -Path $items -DestinationPath dist\stashbox-radio-api-dev-v2.zip -Force
Write-Host "Created Lambda package: $(Resolve-Path dist\stashbox-radio-api-dev-v2.zip)"
```

## Required validation before deploy

Do not commit `dist\stashbox-radio-api-dev-v2.zip`.

Do not deploy the DEV Lambda until the zip contains `node_modules\pg`.

This packaging process must not run AWS commands or change Lambda, API Gateway, RDS, or S3.
