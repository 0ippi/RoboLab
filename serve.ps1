# Pieni staattinen palvelin: palvelee tämän kansion tiedostot osoitteessa http://localhost:8080/
$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8080/")
$listener.Start()
Write-Host "Serving $root at http://localhost:8080/"
$types = @{ ".html" = "text/html; charset=utf-8"; ".css" = "text/css"; ".js" = "text/javascript"; ".png" = "image/png"; ".svg" = "image/svg+xml";
  ".webmanifest" = "application/manifest+json"; ".json" = "application/json" }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
  if ($path -eq "") { $path = "index.html" }
  $file = Join-Path $root $path
  if ((Test-Path $file -PathType Leaf) -and ([IO.Path]::GetFullPath($file).StartsWith($root))) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $ext = [IO.Path]::GetExtension($file)
    $ctx.Response.ContentType = if ($types[$ext]) { $types[$ext] } else { "application/octet-stream" }
    # Ei selaimen välimuistia: päivitetyt tiedostot näkyvät heti (offline-käytöstä huolehtii service worker)
    $ctx.Response.Headers.Add("Cache-Control", "no-cache")
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
