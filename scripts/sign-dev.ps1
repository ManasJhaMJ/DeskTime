# Creates (once) a self-signed code-signing certificate for LOCAL testing of the signing pipeline and
# exports it as a PFX that electron-builder picks up through CSC_LINK / CSC_KEY_PASSWORD.
#
#   powershell -ExecutionPolicy Bypass -File scripts/sign-dev.ps1
#   npm run dist:signed
#
# A self-signed certificate proves the pipeline works, but Windows SmartScreen will still warn on other
# machines. For a warning-free installer you need a certificate from a public CA (see README, "Code signing").
param(
  [string]$Subject = "CN=ScreenWise Dev Signing",
  [string]$OutDir = "$PSScriptRoot\..\certs",
  [string]$Password = "screenwise-dev"
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$pfx = Join-Path $OutDir 'screenwise-dev.pfx'

$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $Subject } | Select-Object -First 1
if (-not $cert) {
  $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $Subject -CertStoreLocation Cert:\CurrentUser\My `
    -KeyExportPolicy Exportable -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(3)
  Write-Output "created certificate $($cert.Thumbprint)"
} else {
  Write-Output "using existing certificate $($cert.Thumbprint)"
}

$secure = ConvertTo-SecureString -String $Password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $secure | Out-Null
Write-Output "exported $pfx"
Write-Output ""
Write-Output "Now run:  npm run dist:signed"
Write-Output "(the script sets CSC_LINK=$pfx and CSC_KEY_PASSWORD for electron-builder)"
