Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\mdbas\.gemini\antigravity-ide\brain\c90e7115-d532-4832-9133-6236b893558d\.user_uploaded\media_1793031965165.jpg"
$assetsDir = "d:\hisab_khata\frontend\assets"

$sourceImg = [System.Drawing.Image]::FromFile($srcPath)
Write-Host "Source image size: $($sourceImg.Width) x $($sourceImg.Height)"

function Resize-And-Save($targetWidth, $targetHeight, $destPath, $bgFillColor = $null, $innerScale = 1.0) {
    $bmp = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    if ($bgFillColor -ne $null) {
        $brush = New-Object System.Drawing.SolidBrush($bgFillColor)
        $graphics.FillRectangle($brush, 0, 0, $targetWidth, $targetHeight)
        $brush.Dispose()
    } else {
        $graphics.Clear([System.Drawing.Color]::Transparent)
    }

    $destW = [int]($targetWidth * $innerScale)
    $destH = [int]($targetHeight * $innerScale)
    $destX = [int](($targetWidth - $destW) / 2)
    $destY = [int](($targetHeight - $destH) / 2)

    $rect = New-Object System.Drawing.Rectangle($destX, $destY, $destW, $destH)
    $graphics.DrawImage($sourceImg, $rect)

    $graphics.Dispose()
    
    if (Test-Path $destPath) {
        Remove-Item -Force $destPath
    }
    
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated: $destPath ($targetWidth x $targetHeight)"
}

# 1. Main Icon (1024x1024)
Resize-And-Save 1024 1024 "$assetsDir\icon.png"

# 2. Android Foreground Adaptive Icon (432x432, centered in the safe zone ~66% scale so Android launcher circular/squircle mask doesn't cut off logo text)
Resize-And-Save 432 432 "$assetsDir\android-icon-foreground.png" $null 0.72

# 3. Android Background Adaptive Icon (432x432, clean white background to match logo)
$white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
Resize-And-Save 432 432 "$assetsDir\android-icon-background.png" $white 1.0

# 4. Splash Icon (512x512)
Resize-And-Save 512 512 "$assetsDir\splash-icon.png"

# 5. Favicon (48x48)
Resize-And-Save 48 48 "$assetsDir\favicon.png"

$sourceImg.Dispose()
Write-Host "All assets successfully generated!"
