# 以管理员身份运行：允许同一局域网设备访问装机管家 8787 端口
# 右键「使用 PowerShell 运行」不一定带管理员权限；请从开始菜单打开
# 「Windows PowerShell (管理员)」后执行：
#   powershell -ExecutionPolicy Bypass -File scripts\allow-lan-firewall.ps1

$ErrorActionPreference = 'Stop'
$ruleName = '装机管家 8787 (LAN)'

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Host '需要管理员权限，正在重新以管理员身份启动，请在 UAC 弹窗中点击“是”…' -ForegroundColor Yellow
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$PSCommandPath`""
  )
  exit
}

if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
  Write-Host "防火墙规则已存在：$ruleName"
} else {
  New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 8787 `
    -Profile Private,Public `
    -RemoteAddress LocalSubnet `
    -Description '允许同一局域网访问装机管家（仅限本网段）' | Out-Null
  Write-Host "已创建防火墙规则：$ruleName（仅允许本网段）" -ForegroundColor Green
}

$ips = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -ExpandProperty IPAddress

Write-Host ''
Write-Host '局域网访问地址：'
foreach ($ip in $ips) { Write-Host "  http://$ip`:8787" -ForegroundColor Cyan }
Write-Host ''
Write-Host '手机与电脑连同一个 Wi-Fi，打开上面的地址，输入 .env 里的 APP_PASSWORD 即可。'
