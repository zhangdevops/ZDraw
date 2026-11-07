param(
    [ValidateSet('dev', 'build', 'dist', 'test', 'test:smoke', 'preview', 'typecheck')]
    [string]$Task = 'dev'
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# 优先使用项目内的独立运行时，不更改系统 PATH。
$portableNode = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '.tools') -Directory -Filter 'node-v24*-win-x64' -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1

if ($portableNode) {
    $env:Path = "$($portableNode.FullName);$env:Path"
}

$nodeVersion = & node --version
$nodeMajor = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) {
    throw 'ZDraw 开发环境需要 Node.js 22.12+，推荐安装 Node.js 24 LTS。'
}

# 执行指定开发任务，保留原始退出码。
& npm.cmd run $Task
exit $LASTEXITCODE
