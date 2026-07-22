# scan_qq_cookie.ps1
# 扫描 QQ 音乐进程内存, 提取 VIP Cookie (qqmusic_key / qm_keyst) 及 guid/uin
# 复用 OpenConverter (Apache 2.0) 的内存扫描逻辑, 适配为独立辅助工具
# 用法:  powershell -NoProfile -ExecutionPolicy Bypass -File scan_qq_cookie.ps1
# 前置:  先启动 QQ 音乐并登录 VIP 账号, 播放一首 VIP 歌曲
# 输出:  终端展示 cookie/guid/uin, 并打印一行 JSON 供复制到网页设置页

$CSHARP_SCRIPT = @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class QMEx {
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int a, bool b, int p);
    [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr a, byte[] b, int s, out int r);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll")] static extern int VirtualQueryEx(IntPtr h, IntPtr a, out MBI m, int l);
    [StructLayout(LayoutKind.Sequential)] public struct MBI {
        public IntPtr BaseAddress, AllocationBase; public uint AllocationProtect;
        public IntPtr RegionSize; public uint State, Protect, Type;
    }
    static string CleanCookieLine(string line) {
        string clean = line.Trim();
        if (clean.StartsWith("Cookie:")) clean = clean.Substring(7).Trim();
        if (clean.StartsWith("?")) clean = clean.Substring(1).Trim();
        if (clean.Contains("qqmusic_key=") || clean.Contains("qm_keyst=")) return clean;
        return "";
    }
    static string ExtractValue(string line, string key) {
        int start = line.IndexOf(key);
        if (start < 0) return "";
        start += key.Length;
        int end = line.IndexOf(';', start);
        if (end < 0) end = line.IndexOf('&', start);
        if (end < 0) end = line.Length;
        return line.Substring(start, end - start).Trim();
    }
    public static string Run() {
        string[] processNames = { "QQMusic", "qmbrowser" };
        string[] targets = { "qqmusic_key=", "qm_keyst=", "qqmusic_guid=" };
        byte[][] markers = new byte[targets.Length][];
        for (int i = 0; i < targets.Length; i++) markers[i] = Encoding.ASCII.GetBytes(targets[i]);
        string foundCookie = "";
        string foundGuid = "";
        string foundUin = "";
        bool sawProcess = false;
        foreach (var processName in processNames) {
            foreach (var p in Process.GetProcessesByName(processName)) {
                sawProcess = true;
                IntPtr h = OpenProcess(0x0410, false, p.Id);
                if (h == IntPtr.Zero) continue;
                try {
                    IntPtr addr = IntPtr.Zero; MBI mbi;
                    while (VirtualQueryEx(h, addr, out mbi, Marshal.SizeOf(typeof(MBI))) != 0) {
                        long sz = mbi.RegionSize.ToInt64();
                        if (mbi.State == 0x1000 && sz > 0 && sz < 50 * 1024 * 1024) {
                            uint p2 = mbi.Protect & 0xFF;
                            if (p2 == 2 || p2 == 4 || p2 == 6 || p2 == 0x20 || p2 == 0x40 || p2 == 0x60 || p2 == 0x80) {
                                byte[] buf = new byte[sz]; int rd;
                                if (ReadProcessMemory(h, mbi.BaseAddress, buf, buf.Length, out rd)) {
                                    foreach (var mk in markers) {
                                        for (int i = 0; i <= rd - mk.Length; i++) {
                                            bool ok = true;
                                            for (int j = 0; j < mk.Length; j++) if (buf[i + j] != mk[j]) { ok = false; break; }
                                            if (ok) {
                                                int s0 = Math.Max(0, i - 1500);
                                                int e0 = Math.Min(i + 1500, rd);
                                                string s = Encoding.UTF8.GetString(buf, s0, e0 - s0);
                                                var lines = s.Split(new char[] { '\r', '\n', '\0' }, StringSplitOptions.RemoveEmptyEntries);
                                                foreach (var line in lines) {
                                                    if (string.IsNullOrEmpty(foundCookie) && (line.Contains("qqmusic_key=") || line.Contains("qm_keyst="))) {
                                                        foundCookie = CleanCookieLine(line);
                                                    }
                                                    if (string.IsNullOrEmpty(foundGuid) && line.Contains("qqmusic_guid=")) {
                                                        foundGuid = ExtractValue(line, "qqmusic_guid=");
                                                    }
                                                    if (string.IsNullOrEmpty(foundUin)) {
                                                        foundUin = ExtractValue(line, "qqmusic_uin=");
                                                        if (string.IsNullOrEmpty(foundUin)) foundUin = ExtractValue(line, "qm_hideuin=");
                                                        if (string.IsNullOrEmpty(foundUin)) foundUin = ExtractValue(line, "uin=");
                                                        if (string.IsNullOrEmpty(foundUin)) foundUin = ExtractValue(line, "uid=");
                                                    }
                                                    if (!string.IsNullOrEmpty(foundCookie) && !string.IsNullOrEmpty(foundGuid) && !string.IsNullOrEmpty(foundUin)) {
                                                        return foundCookie + Environment.NewLine + foundGuid + Environment.NewLine + foundUin;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        long next = addr.ToInt64() + sz;
                        if (next <= addr.ToInt64()) break;
                        addr = new IntPtr(next);
                    }
                } finally {
                    CloseHandle(h);
                }
            }
        }
        if (!sawProcess) return "ERROR:not_running";
        if (!string.IsNullOrEmpty(foundCookie) && !string.IsNullOrEmpty(foundGuid)) {
            return foundCookie + Environment.NewLine + foundGuid + Environment.NewLine + foundUin;
        }
        return "ERROR:not_found";
    }
}
'@

try {
    Add-Type -TypeDefinition $CSHARP_SCRIPT -ErrorAction Stop
    $result = [QMEx]::Run()
    if ($result.StartsWith("ERROR:")) {
        if ($result -eq "ERROR:not_running") {
            Write-Host "未检测到 QQ 音乐进程。请先启动 QQ 音乐客户端。" -ForegroundColor Yellow
        } elseif ($result -eq "ERROR:not_found") {
            Write-Host "未找到 VIP Cookie。请确认已登录 VIP 账号, 并播放一首 VIP 歌曲后重试。" -ForegroundColor Yellow
        } else {
            Write-Host "错误: $result" -ForegroundColor Red
        }
        exit 1
    }
    $lines = $result -split [Environment]::NewLine
    $cookie = $lines[0]
    $guid  = $lines[1]
    $uin   = $lines[2]
    $obj = [PSCustomObject]@{ cookie = $cookie; guid = $guid; uin = $uin }
    $json = $obj | ConvertTo-Json -Compress
    Write-Host "=== QQ 音乐 Cookie 提取成功 ===" -ForegroundColor Green
    Write-Host "cookie : $cookie"
    Write-Host "guid   : $guid"
    Write-Host "uin    : $uin"
    Write-Host ""
    Write-Host "将上述 cookie 粘贴到网页设置页的「QQ 音乐 Cookie」输入框即可解密 musicex 格式。" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "--- JSON (便于复制) ---"
    Write-Host $json
} catch {
    Write-Host "编译/执行失败: $_" -ForegroundColor Red
    exit 1
}
