param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference='Stop'
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($Source,[ref]$tokens,[ref]$errors)
if ($errors.Count -ne 0) { throw 'Task preparation source did not parse.' }
$factory=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'New-SodaRuntimeTaskDefinition'},$true)
if (-not $factory) { throw 'On-demand task definition builder is missing.' }
# Execute the actual factory with inert metadata objects, never Task Scheduler.
Invoke-Expression $factory.Extent.Text
$action=[pscustomobject]@{Path='';Arguments='';WorkingDirectory=''}
$actions=[pscustomobject]@{Value=$action;Count=0};$actions|Add-Member ScriptMethod Create {param($type) if($type -ne 0){throw 'Unexpected action type'};$this.Count++;return $this.Value}
$settings=[pscustomobject]@{Enabled=$false;AllowDemandStart=$false;MultipleInstances=0;ExecutionTimeLimit='PT72H';RestartCount=1;DisallowStartIfOnBatteries=$true;StopIfGoingOnBatteries=$true;RunOnlyIfIdle=$true;RunOnlyIfNetworkAvailable=$true;StartWhenAvailable=$true;WakeToRun=$true}
$definition=[pscustomobject]@{RegistrationInfo=[pscustomobject]@{Description=''};Principal=[pscustomobject]@{UserId='';LogonType=0;RunLevel=0};Settings=$settings;Actions=$actions;Triggers=[pscustomobject]@{Count=0}}
$scheduler=[pscustomobject]@{Definition=$definition};$scheduler|Add-Member ScriptMethod NewTask {param($flags) if($flags -ne 0){throw 'Unexpected definition flags'};return $this.Definition}
$actual=New-SodaRuntimeTaskDefinition $scheduler 'C:\Program Files\Sodashitsu\runtime\DesktopUnlock.exe' 'C:\Program Files\Sodashitsu\runtime'
if ($actual.Principal.UserId -cne 'SYSTEM' -or $actual.Principal.LogonType -ne 5 -or $actual.Triggers.Count -ne 0 -or $actual.Actions.Count -ne 1 -or $actual.Actions.Value.Arguments -cne '--runtime-broker $(Arg0) $(Arg1) $(Arg2)' -or $actual.Actions.Value.Path -cne 'C:\Program Files\Sodashitsu\runtime\DesktopUnlock.exe') { throw 'Task action or SYSTEM-only startup changed.' }
if (-not$settings.Enabled -or -not$settings.AllowDemandStart -or $settings.MultipleInstances -ne 2 -or $settings.ExecutionTimeLimit -cne 'PT0S' -or $settings.RestartCount -ne 0) { throw 'Runtime startup/lifetime settings changed.' }
foreach($field in @('DisallowStartIfOnBatteries','StopIfGoingOnBatteries','RunOnlyIfIdle','RunOnlyIfNetworkAvailable','StartWhenAvailable','WakeToRun')) { if($settings.$field) { throw 'An unattended trigger or power/idle shutdown was enabled.' } }
[pscustomobject]@{ok=$true;generatedOnly=$true;taskRegistered=$false;desktopOpened=$false;input=$false}|ConvertTo-Json -Compress
