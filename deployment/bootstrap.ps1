param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskTarget = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'target.json') -Raw | ConvertFrom-Json
$taskCloud = Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
if (-not (Test-Path -LiteralPath $taskCloud)) { $taskCloud = (Get-Command gcloud -ErrorAction Stop).Source }
$taskGh = (Get-Command gh -ErrorAction Stop).Source
$taskProject = $taskTarget.projectId
$taskOrigin = 'https://' + $taskTarget.service + '-' + $taskTarget.projectNumber + '.' + $taskTarget.region + '.run.app'
$taskRuntime = $taskTarget.runtimeAccount + '@' + $taskProject + '.iam.gserviceaccount.com'
$taskDeployer = $taskTarget.deployerAccount + '@' + $taskProject + '.iam.gserviceaccount.com'
if (-not $Apply) {
  Write-Output "Target: $taskProject / $($taskTarget.region) / $($taskTarget.service)"
  Write-Output 'Apply creates dedicated app identities, image registry, restricted browser key, Firebase web app and GitHub federation. It does not change billing, budgets, existing app data, or deploy Cloud Run.'
  exit 0
}
function Invoke-Cloud([string[]]$Arguments, [switch]$AllowMissing) {
  $taskPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $taskOutput = & $taskCloud @Arguments 2>&1
    $taskExit = $LASTEXITCODE
  } finally { $ErrorActionPreference = $taskPreference }
  if ($taskExit -ne 0) {
    if ($AllowMissing -and ($taskOutput -join ' ') -match 'NOT_FOUND|not found|does not exist') { return $null }
    throw ('Google CLI operation failed: ' + $Arguments[0] + ' ' + $Arguments[1])
  }
  return (($taskOutput | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }) -join "`n")
}
function Invoke-Github([string[]]$Arguments, [switch]$AllowMissing) {
  $taskPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $taskOutput = & $taskGh @Arguments 2>&1
    $taskExit = $LASTEXITCODE
  } finally { $ErrorActionPreference = $taskPreference }
  if ($taskExit -ne 0) {
    if ($AllowMissing -and ($taskOutput -join ' ') -match 'HTTP 404') { return $null }
    throw ('GitHub operation failed: ' + $Arguments[0])
  }
  return (($taskOutput | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }) -join "`n")
}
Write-Output 'Preparing dedicated oGoogle AI resources; billing and budgets are unchanged.'
$null = Invoke-Cloud @('services','enable','run.googleapis.com','sts.googleapis.com','apikeys.googleapis.com',"--project=$taskProject",'--quiet')
foreach ($taskName in @($taskTarget.runtimeAccount, $taskTarget.deployerAccount)) {
  $taskAccount = $taskName + '@' + $taskProject + '.iam.gserviceaccount.com'
  if (-not (Invoke-Cloud @('iam','service-accounts','describe',$taskAccount,"--project=$taskProject",'--format=value(email)') -AllowMissing)) {
    $null = Invoke-Cloud @('iam','service-accounts','create',$taskName,"--project=$taskProject",'--quiet')
  }
}
$null = Invoke-Cloud @('projects','add-iam-policy-binding',$taskProject,"--member=serviceAccount:$taskRuntime",'--role=roles/datastore.user','--condition=None','--quiet')
$null = Invoke-Cloud @('projects','add-iam-policy-binding',$taskProject,"--member=serviceAccount:$taskDeployer",'--role=roles/run.admin','--condition=None','--quiet')
$null = Invoke-Cloud @('iam','service-accounts','add-iam-policy-binding',$taskRuntime,"--project=$taskProject","--member=serviceAccount:$taskDeployer",'--role=roles/iam.serviceAccountUser','--quiet')
if (-not (Invoke-Cloud @('artifacts','repositories','describe',$taskTarget.repository,"--project=$taskProject","--location=$($taskTarget.region)",'--format=value(name)') -AllowMissing)) {
  $null = Invoke-Cloud @('artifacts','repositories','create',$taskTarget.repository,'--repository-format=docker',"--location=$($taskTarget.region)","--project=$taskProject",'--quiet')
}
$null = Invoke-Cloud @('artifacts','repositories','add-iam-policy-binding',$taskTarget.repository,"--project=$taskProject","--location=$($taskTarget.region)","--member=serviceAccount:$taskDeployer",'--role=roles/artifactregistry.writer','--quiet')
if (-not (Invoke-Cloud @('iam','workload-identity-pools','describe',$taskTarget.identityPool,"--project=$taskProject",'--location=global','--format=value(name)') -AllowMissing)) {
  $null = Invoke-Cloud @('iam','workload-identity-pools','create',$taskTarget.identityPool,"--project=$taskProject",'--location=global','--quiet')
}
$taskCondition = "assertion.repository_id=='$($taskTarget.githubRepositoryId)' && assertion.repository_owner_id=='$($taskTarget.githubOwnerId)' && assertion.ref=='refs/heads/main'"
if (-not (Invoke-Cloud @('iam','workload-identity-pools','providers','describe','github',"--workload-identity-pool=$($taskTarget.identityPool)",'--location=global',"--project=$taskProject",'--format=value(name)') -AllowMissing)) {
  $null = Invoke-Cloud @('iam','workload-identity-pools','providers','create-oidc','github',"--project=$taskProject",'--location=global',"--workload-identity-pool=$($taskTarget.identityPool)",'--issuer-uri=https://token.actions.githubusercontent.com','--attribute-mapping=google.subject=assertion.sub,attribute.repository_id=assertion.repository_id',"--attribute-condition=$taskCondition",'--quiet')
}
$taskPrincipal = 'principalSet://iam.googleapis.com/projects/' + $taskTarget.projectNumber + '/locations/global/workloadIdentityPools/' + $taskTarget.identityPool + '/attribute.repository_id/' + $taskTarget.githubRepositoryId
$null = Invoke-Cloud @('iam','service-accounts','add-iam-policy-binding',$taskDeployer,"--project=$taskProject","--member=$taskPrincipal",'--role=roles/iam.workloadIdentityUser','--quiet')
$taskToken = (Invoke-Cloud @('auth','print-access-token')).Trim()
$taskHeaders = @{ Authorization = 'Bearer ' + $taskToken; 'x-goog-user-project' = $taskProject }
$taskAppsUri = 'https://firebase.googleapis.com/v1beta1/projects/' + $taskProject + '/webApps'
$taskApps = Invoke-RestMethod -Headers $taskHeaders -Uri $taskAppsUri
$taskApp = $taskApps.apps | Where-Object displayName -eq 'oGoogle AI' | Select-Object -First 1
if (-not $taskApp) {
  $taskOperation = Invoke-RestMethod -Method Post -Headers $taskHeaders -ContentType 'application/json' -Uri $taskAppsUri -Body '{"displayName":"oGoogle AI"}'
  $taskDeadline = (Get-Date).AddSeconds(60)
  while (-not $taskOperation.done -and (Get-Date) -lt $taskDeadline) {
    Start-Sleep -Milliseconds 500
    $taskOperation = Invoke-RestMethod -Headers $taskHeaders -Uri ('https://firebase.googleapis.com/v1beta1/' + $taskOperation.name)
  }
  if ($taskOperation.error -or -not $taskOperation.done) { throw 'Firebase web app registration failed.' }
  $taskApp = $taskOperation.response
}
$taskAuthUri = 'https://identitytoolkit.googleapis.com/admin/v2/projects/' + $taskProject + '/config'
$taskAuth = Invoke-RestMethod -Headers $taskHeaders -Uri $taskAuthUri
$taskDomain = ([uri]$taskOrigin).Host
if ($taskAuth.authorizedDomains -notcontains $taskDomain) {
  $taskDomainBody = @{ authorizedDomains = @($taskAuth.authorizedDomains) + $taskDomain } | ConvertTo-Json -Compress
  $null = Invoke-RestMethod -Method Patch -Headers $taskHeaders -ContentType 'application/json' -Uri ($taskAuthUri + '?updateMask=authorizedDomains') -Body $taskDomainBody
}
$taskKeys = (Invoke-Cloud @('services','api-keys','list',"--project=$taskProject",'--format=json') | ConvertFrom-Json)
$taskKey = $taskKeys | Where-Object displayName -eq 'oGoogle AI browser auth' | Select-Object -First 1
if (-not $taskKey) {
  $taskCreated = (Invoke-Cloud @('services','api-keys','create',"--project=$taskProject",'--display-name=oGoogle AI browser auth',"--allowed-referrers=$taskOrigin/*,https://$taskProject.firebaseapp.com/*",'--api-target=service=identitytoolkit.googleapis.com','--api-target=service=securetoken.googleapis.com','--format=json','--quiet') | ConvertFrom-Json)
  $taskKeys = (Invoke-Cloud @('services','api-keys','list',"--project=$taskProject",'--format=json') | ConvertFrom-Json)
  $taskKey = $taskKeys | Where-Object displayName -eq 'oGoogle AI browser auth' | Select-Object -First 1
}
if (-not $taskKey) { throw 'Dedicated Firebase browser key was not created.' }
$taskKeyString = (Invoke-Cloud @('services','api-keys','get-key-string',$taskKey.name,"--project=$taskProject",'--format=value(keyString)')).Trim()
$taskProvider = 'projects/' + $taskTarget.projectNumber + '/locations/global/workloadIdentityPools/' + $taskTarget.identityPool + '/providers/github'
$taskEnvironmentPath = 'repos/' + $taskTarget.githubRepository + '/environments/production'
$taskEnvironment = Invoke-Github @('api',$taskEnvironmentPath) -AllowMissing
if (-not $taskEnvironment) {
  $null = Invoke-Github @('api','--method','PUT',$taskEnvironmentPath)
}
$null = Invoke-Github @('variable','set','GCP_IDENTITY_PROVIDER','--env','production','--repo',$taskTarget.githubRepository,'--body',$taskProvider)
$null = Invoke-Github @('variable','set','FIREBASE_WEB_APP_ID','--env','production','--repo',$taskTarget.githubRepository,'--body',$taskApp.appId)
$taskKeyString | & $taskGh secret set FIREBASE_WEB_API_KEY --env production --repo $taskTarget.githubRepository
if ($LASTEXITCODE -ne 0) { throw 'Could not configure the masked Firebase client key.' }
$taskPrivateDirectory = Join-Path $taskRoot '.deployment'
New-Item -ItemType Directory -Force -Path $taskPrivateDirectory | Out-Null
@{ FIREBASE_WEB_API_KEY = $taskKeyString; FIREBASE_WEB_APP_ID = $taskApp.appId } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskPrivateDirectory 'firebase.json') -Encoding UTF8
$taskToken = $null
$taskKeyString = $null
Write-Output 'Bootstrap complete. GitHub uses short-lived federation; no service-account key was created. Cloud Run has not been deployed by this script.'
