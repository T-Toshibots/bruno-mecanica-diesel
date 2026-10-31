param([string]$pasta)
Add-Type -AssemblyName System.Speech
$cenas = Get-Content -Raw -Encoding UTF8 (Join-Path $pasta 'roteiro.json') | ConvertFrom-Json
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$res = @()
foreach ($c in $cenas) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice('Microsoft Maria Desktop')
  $s.Rate = 1
  $arq = Join-Path $pasta ("audio\" + $c.id + ".wav")
  $s.SetOutputToWaveFile($arq, $fmt)
  $s.Speak($c.fala)
  $s.Dispose()
  $bytes = (Get-Item $arq).Length
  $res += [pscustomobject]@{ id = $c.id; segundos = [math]::Round(($bytes - 44) / (22050 * 2), 2) }
}
$res | ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $pasta 'duracoes.json')
$res | ForEach-Object { "$($_.id): $($_.segundos)s" }
