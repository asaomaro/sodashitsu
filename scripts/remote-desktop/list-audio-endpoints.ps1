$ErrorActionPreference = 'Stop'
# Read-only PnP metadata. Never activates a capture/render endpoint.
$items = @(Get-PnpDevice -Class AudioEndpoint -PresentOnly | ForEach-Object {
    if ($_.InstanceId -match '^SWD\\MMDEVAPI\\(\{0\.0\.([01])\.00000000\}\.\{[0-9A-Fa-f-]+\})$') {
        [pscustomobject]@{ name = $_.FriendlyName; direction = $(if ($Matches[2] -eq '0') { 'render' } else { 'capture' }); id = $Matches[1] }
    }
})
ConvertTo-Json -InputObject $items
