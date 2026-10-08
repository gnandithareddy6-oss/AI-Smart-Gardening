$ErrorActionPreference = "Stop"

$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$rootPrefix = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$prefix = "http://127.0.0.1:8000/"
$ollama = "http://127.0.0.1:11434"
Add-Type -AssemblyName System.Net.Http
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromSeconds(180)

$mimeTypes = @{
    ".css" = "text/css; charset=utf-8"
    ".html" = "text/html; charset=utf-8"
    ".js" = "text/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg" = "image/svg+xml"
}

function Write-Response($Response, [int]$StatusCode, [string]$ContentType, [byte[]]$Bytes) {
    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    $Response.ContentLength64 = $Bytes.Length
    $Response.Headers["Cache-Control"] = "no-store"
    if ($Bytes.Length -gt 0) {
        $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    }
    $Response.Close()
}

function Write-Json($Response, [int]$StatusCode, [string]$Json) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
    Write-Response $Response $StatusCode "application/json; charset=utf-8" $bytes
}

try {
    $listener.Start()
    Write-Host "Sprout is available at $prefix"
    Write-Host "Ollama API: $ollama"
    Write-Host "Press Ctrl+C to stop the local server."

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $path = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)

        try {
            if ($path -eq "/api/ollama/tags" -and $request.HttpMethod -eq "GET") {
                $upstream = $client.GetAsync("$ollama/api/tags").GetAwaiter().GetResult()
                $body = $upstream.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                Write-Json $response ([int]$upstream.StatusCode) $body
                continue
            }

            if ($path -eq "/api/ollama/chat" -and $request.HttpMethod -eq "POST") {
                if ($request.ContentLength64 -gt 1048576) {
                    Write-Json $response 413 '{"error":"Chat request is too large."}'
                    continue
                }

                $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
                $body = $reader.ReadToEnd()
                $reader.Dispose()
                try {
                    $chatRequest = $body | ConvertFrom-Json
                    if ($chatRequest.model -ne "qwen2.5:3b" -or -not $chatRequest.messages) {
                        throw "Expected qwen2.5:3b and a messages array."
                    }
                } catch {
                    Write-Json $response 400 '{"error":"Invalid chat request. Expected qwen2.5:3b and conversation messages."}'
                    continue
                }

                $content = New-Object System.Net.Http.StringContent($body, [System.Text.Encoding]::UTF8, "application/json")
                try {
                    $upstream = $client.PostAsync("$ollama/api/chat", $content).GetAwaiter().GetResult()
                    $reply = $upstream.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                    Write-Json $response ([int]$upstream.StatusCode) $reply
                } finally {
                    $content.Dispose()
                }
                continue
            }

            if ($request.HttpMethod -ne "GET" -and $request.HttpMethod -ne "HEAD") {
                Write-Json $response 405 '{"error":"Method not allowed."}'
                continue
            }

            if ($path -eq "/") {
                $path = "/index.html"
            }
            $filePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $path.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)))
            if (-not $filePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or -not [System.IO.File]::Exists($filePath)) {
                Write-Json $response 404 '{"error":"Not found."}'
                continue
            }

            $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
            $contentType = $mimeTypes[$extension]
            if (-not $contentType) {
                $contentType = "application/octet-stream"
            }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            if ($request.HttpMethod -eq "HEAD") {
                $response.StatusCode = 200
                $response.ContentType = $contentType
                $response.ContentLength64 = $bytes.Length
                $response.Close()
            } else {
                Write-Response $response 200 $contentType $bytes
            }
        } catch {
            Write-Host "Request failed: $($_.Exception.Message)" -ForegroundColor Yellow
            if ($response.OutputStream.CanWrite) {
                try {
                    Write-Json $response 502 '{"error":"The local Ollama service is unavailable."}'
                } catch {
                    $response.Abort()
                }
            }
        }
    }
} finally {
    $client.Dispose()
    if ($listener.IsListening) {
        $listener.Stop()
    }
    $listener.Close()
}
