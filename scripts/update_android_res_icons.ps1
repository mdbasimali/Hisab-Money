Add-Type -AssemblyName System.Drawing

$srcPath = "d:\hisab_khata\frontend\assets\icon.png"
$sourceImg = [System.Drawing.Image]::FromFile($srcPath)
$resDir = "d:\hisab_khata\frontend\android\app\src\main\res"

# Densities and sizes:
# mdpi: 48x48 icon, 108x108 foreground
# hdpi: 72x72 icon, 162x162 foreground
# xhdpi: 96x96 icon, 216x216 foreground
# xxhdpi: 144x144 icon, 324x324 foreground
# xxxhdpi: 192x192 icon, 432x432 foreground

$densities = @(
    @{ folder="mipmap-mdpi"; iconSize=48; fgSize=108 },
    @{ folder="mipmap-hdpi"; iconSize=72; fgSize=162 },
    @{ folder="mipmap-xhdpi"; iconSize=96; fgSize=216 },
    @{ folder="mipmap-xxhdpi"; iconSize=144; fgSize=324 },
    @{ folder="mipmap-xxxhdpi"; iconSize=192; fgSize=432 }
)

function Save-Image($w, $h, $destPath, $scale = 1.0) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $dw = [int]($w * $scale)
    $dh = [int]($h * $scale)
    $dx = [int](($w - $dw) / 2)
    $dy = [int](($h - $dh) / 2)

    $rect = New-Object System.Drawing.Rectangle($dx, $dy, $dw, $dh)
    $g.DrawImage($sourceImg, $rect)
    $g.Dispose()

    if (Test-Path $destPath) { Remove-Item -Force $destPath }
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Updated: $destPath"
}

foreach ($d in $densities) {
    $dirPath = Join-Path $resDir $d.folder
    if (Test-Path $dirPath) {
        # ic_launcher.png
        Save-Image $d.iconSize $d.iconSize (Join-Path $dirPath "ic_launcher.png") 1.0
        # ic_launcher_round.png
        Save-Image $d.iconSize $d.iconSize (Join-Path $dirPath "ic_launcher_round.png") 1.0
        # ic_launcher_foreground.png (safe zone scale ~0.72)
        Save-Image $d.fgSize $d.fgSize (Join-Path $dirPath "ic_launcher_foreground.png") 0.72
    }
}

$sourceImg.Dispose()
Write-Host "All Android mipmap native icons updated successfully!"
