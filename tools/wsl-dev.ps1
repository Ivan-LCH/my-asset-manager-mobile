param(
    [ValidateSet('install', 'dev', 'test', 'build', 'status')]
    [string]$Action = 'dev'
)
$ErrorActionPreference = 'Stop'
$taskScript = Join-Path $PSScriptRoot 'wsl-dev.sh'
$taskPathOutput = & wsl.exe --exec wslpath -a ($taskScript.Replace('\', '/'))
if ($LASTEXITCODE -ne 0 -or -not $taskPathOutput) { throw 'Cannot resolve the project script in WSL.' }
$taskLinuxScript = ($taskPathOutput -join '').Trim()
$taskOriginalWslEnv = [Environment]::GetEnvironmentVariable('WSLENV')
try {
    # Forward only existing proxy settings into this child process. No registry/profile changes.
    $env:WSLENV = (@($taskOriginalWslEnv, 'HTTPS_PROXY/u', 'HTTP_PROXY/u', 'NO_PROXY/u') | Where-Object { $_ }) -join ':'
    & wsl.exe --exec bash $taskLinuxScript $Action
    $taskExitCode = $LASTEXITCODE
    Write-Output "WSL_DEV_ACTION=$Action EXIT_CODE=$taskExitCode"
} finally {
    [Environment]::SetEnvironmentVariable('WSLENV', $taskOriginalWslEnv, 'Process')
}
exit $taskExitCode
