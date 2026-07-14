$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$checks = @(
  @{ ModulePath = 'modules/app/state.js'; TestPath = 'tests/state-contract.test.mjs' },
  @{ ModulePath = 'modules/app/constants.js'; TestPath = 'tests/constants-contract.test.mjs' },
  @{ ModulePath = 'modules/app/utils.js'; TestPath = 'tests/utils-contract.test.mjs' },
  @{ ModulePath = 'modules/app/logger.js'; TestPath = 'tests/logger-contract.test.mjs' },
  @{ ModulePath = 'modules/app/disclaimer.js'; TestPath = 'tests/disclaimer-contract.test.mjs' },
  @{ ModulePath = 'modules/app/theme.js'; TestPath = 'tests/theme-contract.test.mjs' },
  @{ ModulePath = 'modules/app/ocr-integration.js'; TestPath = 'tests/ocr-integration-contract.test.mjs' },
  @{ ModulePath = 'modules/app/violation-editor.js'; TestPath = 'tests/violation-editor-contract.test.mjs' },
  @{ ModulePath = 'modules/app/ffmpeg-service.js'; TestPath = 'tests/ffmpeg-service-contract.test.mjs' },
  @{ ModulePath = 'modules/app/timeline.js'; TestPath = 'tests/timeline-contract.test.mjs' },
  @{ ModulePath = 'modules/app/snapshot-editor.js'; TestPath = 'tests/snapshot-editor-contract.test.mjs' },
  @{ ModulePath = 'modules/app/video-actions.js'; TestPath = 'tests/video-actions-contract.test.mjs' },
  @{ ModulePath = 'modules/app/bootstrap.js'; TestPath = 'tests/bootstrap-contract.test.mjs' }
)

Push-Location $root
try {
  node tests/validate-app-module.test.mjs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  foreach ($check in $checks) {
    & (Join-Path $PSScriptRoot 'validate-app-module.ps1') @check
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }

  git -c core.whitespace=cr-at-eol diff --check
  exit $LASTEXITCODE
} finally {
  Pop-Location
}