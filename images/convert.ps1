Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Xaml
Add-Type -AssemblyName PresentationFramework

$sizes = @(16, 48, 128)

foreach ($size in $sizes) {
    $xaml = [System.Windows.Markup.XamlReader]::Parse(@"
    <Viewbox
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Width="$size" Height="$size">
        <Canvas Width="128" Height="128">
            <Rectangle Width="128" Height="128" RadiusX="24" RadiusY="24" Fill="#FF4D4F"/>
            <Ellipse Width="96" Height="96" Canvas.Left="16" Canvas.Top="16" Fill="#26FFFFFF"/>
            <Ellipse Width="72" Height="72" Canvas.Left="28" Canvas.Top="28" Fill="#4DFFFFFF"/>
            <Ellipse Width="48" Height="48" Canvas.Left="40" Canvas.Top="40" Fill="#FFFFFF"/>
        </Canvas>
    </Viewbox>
"@)

    $bitmap = New-Object System.Windows.Media.Imaging.RenderTargetBitmap(
        $size, $size, 96, 96, [System.Windows.Media.PixelFormats]::Pbgra32
    )
    $bitmap.Render($xaml)

    $encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
    $encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))

    $stream = [System.IO.File]::Create("$PSScriptRoot\icon$size.png")
    $encoder.Save($stream)
    $stream.Close()
}
