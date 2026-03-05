param(
  [Parameter(Mandatory = $true)]
  [string]$PayloadBase64
)

$payloadJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($PayloadBase64))
$payload = $payloadJson | ConvertFrom-Json

function Invoke-EncodedHttpRequest($SinglePayload) {
  $headers = @{}
  if ($SinglePayload.headers) {
    $SinglePayload.headers.PSObject.Properties | ForEach-Object {
      $headers[[string]$_.Name] = [string]$_.Value
    }
  }

  $params = @{
    Uri = [string]$SinglePayload.url
    Method = [string]$SinglePayload.method
    Headers = $headers
    UseBasicParsing = $true
    TimeoutSec = [Math]::Max(1, [Math]::Ceiling([double]$SinglePayload.timeoutMs / 1000))
    ErrorAction = 'Stop'
  }

  if ([string]$SinglePayload.bodyBase64 -ne '') {
    $params.Body = [System.Convert]::FromBase64String([string]$SinglePayload.bodyBase64)
  }

  try {
    $response = Invoke-WebRequest @params
    $contentText = [string]$response.Content
    $responseHeaders = @{}

    if ($SinglePayload.includeHeaders) {
      $response.Headers.Keys | ForEach-Object { $responseHeaders[[string]$_] = [string]$response.Headers[$_] }
    }

    return [pscustomobject]@{
      status = [int]$response.StatusCode
      headers = $responseHeaders
      bodyBase64 = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($contentText))
    }
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
    if ($SinglePayload.includeHeaders -and $errorResponse.Headers) {
      $errorResponse.Headers.Keys | ForEach-Object { $responseHeaders[[string]$_] = [string]$errorResponse.Headers[$_] }
    }

    return [pscustomobject]@{
      status = [int]$errorResponse.StatusCode
      headers = $responseHeaders
      bodyBase64 = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($contentText))
    }
  }
}

if ($payload -is [System.Array]) {
  $results = @()
  foreach ($entry in $payload) {
    $results += Invoke-EncodedHttpRequest $entry
  }

  $results | ConvertTo-Json -Compress -Depth 8
} else {
  Invoke-EncodedHttpRequest $payload | ConvertTo-Json -Compress -Depth 8
}
