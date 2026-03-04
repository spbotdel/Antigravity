param(
  [Parameter(Mandatory = $true)]
  [string]$PayloadBase64
)

$payloadJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($PayloadBase64))
$payload = $payloadJson | ConvertFrom-Json

$headers = @{}
if ($payload.headers) {
  $payload.headers.PSObject.Properties | ForEach-Object {
    $headers[[string]$_.Name] = [string]$_.Value
  }
}

$params = @{
  Uri = [string]$payload.url
  Method = [string]$payload.method
  Headers = $headers
  UseBasicParsing = $true
  TimeoutSec = [Math]::Max(1, [Math]::Ceiling([double]$payload.timeoutMs / 1000))
  ErrorAction = 'Stop'
}

if ([string]$payload.bodyBase64 -ne '') {
  $params.Body = [System.Convert]::FromBase64String([string]$payload.bodyBase64)
}

try {
  $response = Invoke-WebRequest @params
  $contentText = [string]$response.Content
  $responseHeaders = @{}

  if ($payload.includeHeaders) {
    $response.Headers.Keys | ForEach-Object { $responseHeaders[[string]$_] = [string]$response.Headers[$_] }
  }

  [pscustomobject]@{
    status = [int]$response.StatusCode
    headers = $responseHeaders
    bodyBase64 = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($contentText))
  } | ConvertTo-Json -Compress -Depth 8
} catch {
  if (-not $_.Exception.Response) {
    throw
  }

  $errorResponse = $_.Exception.Response
  $contentText = ''
  if ($errorResponse.GetResponseStream()) {
    $reader = New-Object System.IO.StreamReader($errorResponse.GetResponseStream())
    $contentText = $reader.ReadToEnd()
    $reader.Dispose()
  }

  $responseHeaders = @{}
  if ($payload.includeHeaders -and $errorResponse.Headers) {
    $errorResponse.Headers.Keys | ForEach-Object { $responseHeaders[[string]$_] = [string]$errorResponse.Headers[$_] }
  }

  [pscustomobject]@{
    status = [int]$errorResponse.StatusCode
    headers = $responseHeaders
    bodyBase64 = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($contentText))
  } | ConvertTo-Json -Compress -Depth 8
}
