param(
  [Parameter(Mandatory = $true)]
  [string]$ModulePath,

  [Parameter(Mandatory = $true)]
  [string]$TestPath
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ModulePath)) {
  throw "Module not found: $ModulePath"
}

$temporaryFile = [System.IO.Path]::GetTempFileName()
$syntaxFile = [System.IO.Path]::ChangeExtension($temporaryFile, 'mjs')
Move-Item -LiteralPath $temporaryFile -Destination $syntaxFile
try {
  $source = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $ModulePath), [System.Text.Encoding]::UTF8)
  [System.IO.File]::WriteAllText($syntaxFile, $source, [System.Text.UTF8Encoding]::new($false))
  node --check $syntaxFile
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Remove-Item -LiteralPath $syntaxFile -Force -ErrorAction SilentlyContinue
}

node $TestPath
exit $LASTEXITCODE