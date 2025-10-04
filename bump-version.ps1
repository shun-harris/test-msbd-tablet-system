param(
  [Parameter(Mandatory=$true)][string]$Type, # major|minor|patch or explicit version like 2.5.0
  [string]$Notes = ""
)

$versionFile = Join-Path $PSScriptRoot 'version.json'
if(!(Test-Path $versionFile)){ Write-Error "version.json not found"; exit 1 }

$json = Get-Content $versionFile -Raw | ConvertFrom-Json
$current = $json.version

function Bump([string]$cur,[string]$type){
  if($type -match '^[0-9]+\.[0-9]+\.[0-9]+$'){ return $type }
  $parts = $cur.Split('.') | ForEach-Object { [int]$_ }
  switch($type){
    'major' { $parts[0]++; $parts[1]=0; $parts[2]=0 }
    'minor' { $parts[1]++; $parts[2]=0 }
    'patch' { $parts[2]++ }
    default { throw "Unknown bump type $type" }
  }
  return ($parts -join '.')
}

$newVersion = Bump $current $Type
$iso = (Get-Date).ToString('s')+'Z'
if([string]::IsNullOrWhiteSpace($Notes)) { $Notes = $json.notes }

$json.version = $newVersion
$json.buildDate = $iso
if($Notes){ $json.notes = $Notes }
$json | ConvertTo-Json -Depth 5 | Set-Content $versionFile -Encoding UTF8

# Update CHANGELOG.md: insert under top heading if Unreleased section exists else create one
$clPath = Join-Path $PSScriptRoot 'CHANGELOG.md'
if(Test-Path $clPath){
  $cl = Get-Content $clPath
  $date = (Get-Date).ToString('yyyy-MM-dd')
  $entryHeader = "## [$newVersion] - $date"
  $injected = @()
  $inserted = $false
  for($i=0;$i -lt $cl.Count;$i++){
    if(!$inserted -and $cl[$i] -match '^## \[2'){ # first version section
      $injected += $entryHeader
      $injected += '### Added'
      $injected += "- $Notes"
      $injected += ''
      $inserted = $true
    }
    $injected += $cl[$i]
  }
  if(-not $inserted){
    $injected += ''
    $injected += $entryHeader
    $injected += '### Added'
    $injected += "- $Notes"
  }
  $injected | Set-Content $clPath -Encoding UTF8
}

Write-Host "Bumped $current -> $newVersion" -ForegroundColor Green
