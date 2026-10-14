# Original Chalkboard marks. Native drawing only; no network or image dependencies.
Add-Type -AssemblyName System.Drawing
$iconRoot = Join-Path $PSScriptRoot '../public/icons'
foreach ($appName in @('customer', 'business')) {
  foreach ($variant in @('192', '512', 'maskable-512')) {
    $pixels = if ($variant -eq '192') { 192 } else { 512 }
    $bitmap = New-Object System.Drawing.Bitmap($pixels, $pixels)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#1e382b'))
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#dcf4a3'))
    $scale = $pixels / 512
    $pen = New-Object System.Drawing.Pen($brush, (24 * $scale))
    if ($appName -eq 'customer') {
      $graphics.FillRectangle($brush, (128 * $scale), (128 * $scale), (112 * $scale), (112 * $scale))
      $graphics.FillEllipse($brush, (272 * $scale), (128 * $scale), (112 * $scale), (112 * $scale))
      $graphics.FillEllipse($brush, (128 * $scale), (272 * $scale), (112 * $scale), (112 * $scale))
      $graphics.FillRectangle($brush, (272 * $scale), (272 * $scale), (112 * $scale), (112 * $scale))
    } else {
      $graphics.DrawRectangle($pen, (132 * $scale), (132 * $scale), (248 * $scale), (220 * $scale))
      foreach ($line in @(@(176, 192, 336, 192), @(176, 256, 272, 256), @(176, 312, 320, 312), @(156, 396, 176, 352), @(356, 396, 336, 352))) {
        $graphics.DrawLine($pen, ($line[0] * $scale), ($line[1] * $scale), ($line[2] * $scale), ($line[3] * $scale))
      }
    }
    $bitmap.Save((Join-Path $iconRoot "$appName-$variant.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $pen.Dispose(); $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
  }
}
