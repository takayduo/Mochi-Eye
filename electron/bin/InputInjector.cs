using System;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace MochiEye
{
    class InputInjector
    {
        [DllImport("user32.dll")]
        static extern bool SetProcessDPIAware();

        [DllImport("user32.dll")]
        static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        static extern uint MapVirtualKey(uint uCode, uint uMapType);

        [DllImport("user32.dll")]
        static extern int GetSystemMetrics(int nIndex);

        const int SM_CXSCREEN = 0;
        const int SM_CYSCREEN = 1;

        const uint MOUSEEVENTF_LEFTDOWN   = 0x0002;
        const uint MOUSEEVENTF_LEFTUP     = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN  = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP    = 0x0010;
        const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        const uint MOUSEEVENTF_MIDDLEUP   = 0x0040;
        const uint MOUSEEVENTF_WHEEL      = 0x0800;

        const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        const uint KEYEVENTF_KEYUP       = 0x0002;
        const uint KEYEVENTF_UNICODE     = 0x0004;

        static void Main(string[] args)
        {
            try { SetProcessDPIAware(); } catch { }
            Console.OutputEncoding = Encoding.UTF8;
            Console.WriteLine("MOCHI_INJECTOR_READY");
            Console.Out.Flush();

            int screenW = GetSystemMetrics(SM_CXSCREEN);
            int screenH = GetSystemMetrics(SM_CYSCREEN);
            if (screenW <= 0) screenW = 1920;
            if (screenH <= 0) screenH = 1080;

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;
                if (line == "exit" || line == "quit") break;

                try
                {
                    string[] parts = line.Split(' ');
                    string cmd = parts[0];

                    switch (cmd)
                    {
                        // m <x> <y> -> Direct pixel mouse move
                        case "m":
                            if (parts.Length >= 3)
                            {
                                int x = int.Parse(parts[1], CultureInfo.InvariantCulture);
                                int y = int.Parse(parts[2], CultureInfo.InvariantCulture);
                                SetCursorPos(x, y);
                            }
                            break;

                        // mn <normX> <normY> -> Normalized 0.0 - 1.0 mouse move
                        case "mn":
                            if (parts.Length >= 3)
                            {
                                double nx = double.Parse(parts[1], CultureInfo.InvariantCulture);
                                double ny = double.Parse(parts[2], CultureInfo.InvariantCulture);
                                nx = Math.Max(0.0, Math.Min(1.0, nx));
                                ny = Math.Max(0.0, Math.Min(1.0, ny));
                                int x = (int)Math.Round(nx * screenW);
                                int y = (int)Math.Round(ny * screenH);
                                SetCursorPos(x, y);
                            }
                            break;

                        // d <btn: 1=left, 2=right, 3=middle> [normX] [normY]
                        case "d":
                            if (parts.Length >= 2)
                            {
                                if (parts.Length >= 4)
                                {
                                    double nx = double.Parse(parts[2], CultureInfo.InvariantCulture);
                                    double ny = double.Parse(parts[3], CultureInfo.InvariantCulture);
                                    SetCursorPos((int)Math.Round(nx * screenW), (int)Math.Round(ny * screenH));
                                }
                                int btn = int.Parse(parts[1], CultureInfo.InvariantCulture);
                                if (btn == 1) mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                                else if (btn == 2) mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
                                else if (btn == 3) mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, UIntPtr.Zero);
                            }
                            break;

                        // u <btn: 1=left, 2=right, 3=middle> [normX] [normY]
                        case "u":
                            if (parts.Length >= 2)
                            {
                                if (parts.Length >= 4)
                                {
                                    double nx = double.Parse(parts[2], CultureInfo.InvariantCulture);
                                    double ny = double.Parse(parts[3], CultureInfo.InvariantCulture);
                                    SetCursorPos((int)Math.Round(nx * screenW), (int)Math.Round(ny * screenH));
                                }
                                int btn = int.Parse(parts[1], CultureInfo.InvariantCulture);
                                if (btn == 1) mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                                else if (btn == 2) mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
                                else if (btn == 3) mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, UIntPtr.Zero);
                            }
                            break;

                        // w <delta> -> Mouse wheel
                        case "w":
                            if (parts.Length >= 2)
                            {
                                int delta = int.Parse(parts[1], CultureInfo.InvariantCulture);
                                mouse_event(MOUSEEVENTF_WHEEL, 0, 0, unchecked((uint)delta), UIntPtr.Zero);
                            }
                            break;

                        // k <vk> <down: 1=press, 0=release> -> Key event
                        case "k":
                            if (parts.Length >= 3)
                            {
                                byte vk = byte.Parse(parts[1], CultureInfo.InvariantCulture);
                                int down = int.Parse(parts[2], CultureInfo.InvariantCulture);
                                byte scan = (byte)MapVirtualKey(vk, 0);
                                bool isExtended = (vk >= 33 && vk <= 46) || (vk >= 91 && vk <= 93) || (vk == 144) || (vk == 111);
                                uint flags = (down == 1 ? 0u : KEYEVENTF_KEYUP) | (isExtended ? KEYEVENTF_EXTENDEDKEY : 0u);
                                keybd_event(vk, scan, flags, UIntPtr.Zero);
                            }
                            break;

                        // t <unicode_code> -> Unicode character press
                        case "t":
                            if (parts.Length >= 2)
                            {
                                char c = (char)int.Parse(parts[1], CultureInfo.InvariantCulture);
                                keybd_event(0, (byte)c, KEYEVENTF_UNICODE, UIntPtr.Zero);
                                keybd_event(0, (byte)c, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, UIntPtr.Zero);
                            }
                            break;

                        // resync -> update screenW and screenH
                        case "resync":
                            screenW = GetSystemMetrics(SM_CXSCREEN);
                            screenH = GetSystemMetrics(SM_CYSCREEN);
                            if (screenW <= 0) screenW = 1920;
                            if (screenH <= 0) screenH = 1080;
                            break;
                    }
                }
                catch
                {
                    // Ignore malformed command silently
                }
            }
        }
    }
}
