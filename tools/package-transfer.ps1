param([switch]$IncludeLinuxDependencies, [switch]$SourceOnly, [string]$DataBackup, [string]$PlanFile)
if ($SourceOnly -and $IncludeLinuxDependencies) { throw 'SourceOnly cannot include installed dependencies.' }
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$taskRepo = Split-Path $PSScriptRoot -Parent
$taskOutput = Join-Path (Split-Path $taskRepo -Parent) ('transfer-packages-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (Test-Path -LiteralPath $taskOutput) { throw 'Output already exists.' }
New-Item -ItemType Directory -Path $taskOutput | Out-Null
$taskGit = & git -c "safe.directory=$($taskRepo.Replace('\','/'))" -C $taskRepo ls-files -z --cached --others --exclude-standard
if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate source files.' }
$taskFiles = @((($taskGit -join "`n").Split([char]0)) | Where-Object {
    $_ -and $_ -notmatch '(^|/)(\.git|\.tmp|\.codex|\.agents|node_modules|dist|logs|data|\.env[^/]*)(/|$)' -and
    $_ -notmatch '(?i)(^|/)(Capture\.PNG|service_account\.json|secrets\.toml)$|(?i)(backup[^/]*\.json|[^/]*[-_]backup\.json|[^/]*\.db|[^/]*\.sqlite3?|[^/]*\.pem|[^/]*\.key)$'
} | Sort-Object -Unique)
foreach ($taskFile in $taskFiles) {
    if ([IO.Path]::IsPathRooted($taskFile) -or $taskFile -match '(^|/)\.\.(/|$)') { throw 'Unsafe source path.' }
    if (!(Test-Path -LiteralPath (Join-Path $taskRepo $taskFile) -PathType Leaf)) { throw "Missing source file: $taskFile" }
}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskResults = [System.Collections.Generic.List[object]]::new()
function New-VerifiedZip([string]$Name, [string]$Root, [string[]]$Files) {
    $taskZipPath = Join-Path $taskOutput $Name
    $taskArchive = [IO.Compression.ZipFile]::Open($taskZipPath, [IO.Compression.ZipArchiveMode]::Create)
    $taskBytes = [long]0
    try {
        foreach ($taskRelative in $Files) {
            $taskInput = Join-Path $Root $taskRelative
            $taskBytes += (Get-Item -LiteralPath $taskInput).Length
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive, $taskInput, $taskRelative.Replace('\','/'), [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $taskArchive.Dispose() }
    # Read every compressed entry and compare SHA256 with its original file.
    $taskArchive = [IO.Compression.ZipFile]::OpenRead($taskZipPath)
    try {
        if ($taskArchive.Entries.Count -ne $Files.Count) { throw 'ZIP entry count mismatch.' }
        foreach ($taskEntry in $taskArchive.Entries) {
            $taskStream = $taskEntry.Open()
            $taskHash = [Security.Cryptography.SHA256]::Create()
            try { $taskActual = [BitConverter]::ToString($taskHash.ComputeHash($taskStream)).Replace('-','') }
            finally { $taskStream.Dispose(); $taskHash.Dispose() }
            $taskExpected = (Get-FileHash -LiteralPath (Join-Path $Root $taskEntry.FullName) -Algorithm SHA256).Hash
            if ($taskActual -ne $taskExpected) { throw "ZIP content mismatch: $($taskEntry.FullName)" }
        }
    } finally { $taskArchive.Dispose() }
    $taskResult = [pscustomobject]@{ Name=$Name; Files=$Files.Count; OriginalBytes=$taskBytes; ArchiveBytes=(Get-Item -LiteralPath $taskZipPath).Length; SHA256=(Get-FileHash -LiteralPath $taskZipPath -Algorithm SHA256).Hash; Validation='All ZIP entries SHA256 matched' }
    $taskResults.Add($taskResult)
    $taskResult | ConvertTo-Json -Compress | Write-Output
}
New-VerifiedZip 'myasset-source-and-design.zip' $taskRepo $taskFiles
$taskCompactFiles = @($taskFiles | Where-Object { $_ -notlike 'docs/redesign/screenshots/*' })
New-VerifiedZip 'myasset-source-without-screenshots.zip' $taskRepo $taskCompactFiles
if ($DataBackup) {
    $taskDataInput = (Resolve-Path -LiteralPath $DataBackup).Path
    if ((Split-Path $taskDataInput -Parent) -ne (Split-Path $taskRepo -Parent)) { throw 'Private backup must be in the workspace beside the repository.' }
    $taskData = Get-Content -LiteralPath $taskDataInput -Raw -Encoding UTF8 | ConvertFrom-Json
    if (!$taskData.tables.assets -or !$taskData.tables.settings -or !$taskData.exportedAt) { throw 'Not an asset-manager backup.' }
    $taskDataStage = Join-Path $taskOutput 'private-data'
    New-Item -ItemType Directory -Path $taskDataStage | Out-Null
    Copy-Item -LiteralPath $taskDataInput -Destination (Join-Path $taskDataStage 'asset-data.json')
    Copy-Item -LiteralPath (Join-Path $taskRepo 'docs/SERVER-MIGRATION.md') -Destination (Join-Path $taskDataStage 'RESTORE.md')
    $taskDataFiles = @('asset-data.json', 'RESTORE.md', 'provenance.json')
    if ($PlanFile) {
        $taskPlanInput = (Resolve-Path -LiteralPath $PlanFile).Path
        if ((Split-Path $taskPlanInput -Parent) -ne (Split-Path $taskRepo -Parent)) { throw 'Plan file must be beside the repository.' }
        $taskPlan = Get-Content -LiteralPath $taskPlanInput -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($taskPlan.kind -ne 'pension-plan-registration') { throw 'Not a pension registration file.' }
        Copy-Item -LiteralPath $taskPlanInput -Destination (Join-Path $taskDataStage 'pension-plan-registration.json')
        $taskDataFiles += 'pension-plan-registration.json'
    }
    $taskProvenance = [pscustomobject]@{
        Status='LOCAL_SNAPSHOT_NOT_LIVE_BROWSER_EXPORT'
        SourceFile=(Split-Path $taskDataInput -Leaf)
        ExportedAt=$taskData.exportedAt
        PackagedAt=[DateTime]::UtcNow.ToString('o')
        SourceSHA256=(Get-FileHash -LiteralPath $taskDataInput -Algorithm SHA256).Hash
        Assets=@($taskData.tables.assets).Count
        HistoryRows=@($taskData.tables.assetHistory).Count
        LiveBrowserLatestVerified=$false
        Warning='Local verified snapshot only. Export from the currently used browser to preserve any newer edits. Private financial data: do not publish or put in the web root.'
    }
    $taskProvenance | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskDataStage 'provenance.json') -Encoding UTF8
    New-VerifiedZip 'myasset-data-local-snapshot.zip' $taskDataStage $taskDataFiles
}
$taskDist = Join-Path $taskRepo 'frontend/dist'
if (!$SourceOnly -and (Test-Path -LiteralPath $taskDist)) {
    $taskDistFiles = @(Get-ChildItem -LiteralPath $taskDist -File -Recurse | ForEach-Object { $_.FullName.Substring($taskDist.Length + 1).Replace('\','/') })
    if ($taskDistFiles | Where-Object { $_ -match '(?i)backup|\.env|\.db$|\.sqlite|\.pem$|\.key$' }) { throw 'Potential data file in build output; inspect before packaging.' }
    New-VerifiedZip 'myasset-current-web-build.zip' $taskDist $taskDistFiles
}
if ($IncludeLinuxDependencies) {
    $taskManifest = Join-Path $taskOutput 'source-files.nul'
    [IO.File]::WriteAllText($taskManifest, (($taskFiles -join [char]0) + [char]0), [Text.UTF8Encoding]::new($false))
    $taskLinuxRepo = (& wsl.exe --exec wslpath -a ($taskRepo.Replace('\','/'))).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve WSL source path.' }
    $taskLinuxOutput = (& wsl.exe --exec wslpath -a ($taskOutput.Replace('\','/'))).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve WSL output path.' }
    # Linux tar preserves the installed dependency symlinks and executable modes.
    & wsl.exe --exec tar -czf "$taskLinuxOutput/myasset-source-with-linux-dependencies.tar.gz" -C $taskLinuxRepo --null -T "$taskLinuxOutput/source-files.nul" frontend/node_modules
    if ($LASTEXITCODE -ne 0) { throw 'Linux dependency archive failed.' }
    $taskTarEntries = & wsl.exe --exec tar -tzf "$taskLinuxOutput/myasset-source-with-linux-dependencies.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw 'Linux archive readback failed.' }
    $taskTar = Join-Path $taskOutput 'myasset-source-with-linux-dependencies.tar.gz'
    $taskResult = [pscustomobject]@{ Name=(Split-Path $taskTar -Leaf); Entries=@($taskTarEntries).Count; ArchiveBytes=(Get-Item -LiteralPath $taskTar).Length; SHA256=(Get-FileHash -LiteralPath $taskTar -Algorithm SHA256).Hash; Validation='Full tar listing readback passed; runtime not included' }
    $taskResults.Add($taskResult)
    $taskResult | ConvertTo-Json -Compress | Write-Output
}
$taskResults | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskOutput 'sizes-and-sha256.json') -Encoding UTF8
Write-Output "OUTPUT=$taskOutput"
Write-Output 'PACKAGE_TRANSFER_EXIT=0'
