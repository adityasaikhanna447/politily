param([string]$Version = '3.3', [string]$ReleaseDate = '2026-09-22')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$bindingConfig = Get-Content -LiteralPath (Join-Path $root 'vite.config.ts') -Raw
if ($bindingConfig -match 'SITE_CREATOR_PLACEHOLDER_DATABASE_ID|43c380f8-2924-41a1-9bdb-707cba1c22fe') {
  throw 'Refusing to package the deleted D1 database binding. Confirm the current Database ID in Cloudflare first.'
}
if ($Version -notmatch '^\d+\.\d+$' -or $ReleaseDate -notmatch '^\d{4}-\d{2}-\d{2}$') { throw 'Invalid release name' }
$name = "Politily-Newsroom-$Version-$ReleaseDate"
$release = Join-Path $root "release\$name"
if (Test-Path -LiteralPath $release) { throw "Release already exists: $release" }
$upload = Join-Path $release 'UPLOAD_TO_GITHUB'
$mirror = Join-Path $root '_BEGINNER_UPLOAD_PACKAGE\01_UPLOAD_THIS_TO_GITHUB'
$paths = @('.env.example','.gitignore','cloudflare-env.d.ts','drizzle.config.ts','eslint.config.mjs','LICENSE','next.config.ts','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','postcss.config.mjs','README.md','tsconfig.json','vite.config.ts','docs\DEPLOYMENT.md','docs\RELEASE-NOTES-2026-09.md','docs\CLOUDFLARE-RECOVERY.md','docs\START-HERE-BEGINNER.md','scripts\package-release.ps1')
foreach ($dir in @('app','db','worker','public','tests')) {
  $paths += Get-ChildItem -LiteralPath (Join-Path $root $dir) -Recurse -File | ForEach-Object { [IO.Path]::GetRelativePath($root, $_.FullName) }
}
$paths = @($paths | Sort-Object -Unique)
$manifest = foreach ($path in $paths) {
  $source = Join-Path $root $path
  foreach ($base in @($upload, $mirror)) {
    $destination = Join-Path $base $path
    New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
    if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) { throw "Copy mismatch: $path" }
  }
  [pscustomobject]@{ Path = $path; SHA256 = (Get-FileHash -LiteralPath $source).Hash }
}
$manifest | Export-Csv -LiteralPath (Join-Path $release 'SHA256SUMS.csv') -NoTypeInformation
$previews = Join-Path $release 'PREVIEWS'
New-Item -ItemType Directory -Force -Path $previews | Out-Null
foreach ($preview in @('radar-1440.png','radar-390.png','issue-390.png','delivery-1440.png','quota-error-390.png')) {
  Copy-Item -LiteralPath (Join-Path $root "artifacts\$preview") -Destination $previews
}
Copy-Item -LiteralPath (Join-Path $root 'docs\START-HERE-BEGINNER.md') -Destination (Join-Path $release 'START-HERE.md')
Compress-Archive -LiteralPath $release -DestinationPath "$release.zip" -CompressionLevel Optimal
[pscustomobject]@{ Archive = "$release.zip"; SourceFiles = $paths.Count; Bytes = (Get-Item -LiteralPath "$release.zip").Length; MirroredTo = $mirror } | ConvertTo-Json
