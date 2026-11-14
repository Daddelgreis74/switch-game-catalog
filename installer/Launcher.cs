using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace NSWGameCatalogLauncher
{
    static class Program
    {
        private static Process _nodeProcess;
        private static NotifyIcon _trayIcon;
        private static string _baseDir;
        private static string _port = "3000";
        private static string _logPath;

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool createdNew;
            using (var mutex = new Mutex(true, "NSWGameCatalogSingleInstanceMutex", out createdNew))
            {
                _baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
                _port = ReadPortFromEnv(Path.Combine(_baseDir, ".env"));
                _logPath = Path.Combine(_baseDir, "config", "server.log");

                if (!createdNew)
                {
                    OpenBrowser();
                    return;
                }

                StartServer();
                SetupTrayIcon();

                ThreadPool.QueueUserWorkItem(_ =>
                {
                    WaitForPort(_port, 10000);
                    OpenBrowser();
                });

                Application.ApplicationExit += (s, e) => StopServer();
                Application.Run();
            }
        }

        private static string ReadPortFromEnv(string envPath)
        {
            try
            {
                if (File.Exists(envPath))
                {
                    foreach (var line in File.ReadAllLines(envPath))
                    {
                        var trimmed = line.Trim();
                        if (trimmed.StartsWith("PORT=", StringComparison.OrdinalIgnoreCase))
                        {
                            var val = trimmed.Substring(5).Trim().Trim('"', '\'');
                            int p;
                            if (int.TryParse(val, out p) && p > 0 && p <= 65535)
                            {
                                return p.ToString();
                            }
                        }
                    }
                }
            }
            catch { }
            return "3000";
        }

        private static void StartServer()
        {
            var nodeExe = Path.Combine(_baseDir, "runtime", "node", "node.exe");
            var serverJs = Path.Combine(_baseDir, "server.js");

            if (!File.Exists(nodeExe) || !File.Exists(serverJs))
            {
                MessageBox.Show(
                    "Runtime files (node.exe or server.js) were not found in:\n" + _baseDir,
                    "NSW Game Catalog",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                Environment.Exit(1);
                return;
            }

            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_logPath));
                var psi = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = "\"" + serverJs + "\"",
                    WorkingDirectory = _baseDir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                _nodeProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };
                var logLock = new object();
                File.WriteAllText(_logPath, string.Empty);

                _nodeProcess.OutputDataReceived += (s, e) =>
                {
                    if (e.Data != null)
                    {
                        lock (logLock) { try { File.AppendAllText(_logPath, e.Data + Environment.NewLine); } catch { } }
                    }
                };
                _nodeProcess.ErrorDataReceived += (s, e) =>
                {
                    if (e.Data != null)
                    {
                        lock (logLock) { try { File.AppendAllText(_logPath, "[ERR] " + e.Data + Environment.NewLine); } catch { } }
                    }
                };

                _nodeProcess.Start();
                _nodeProcess.BeginOutputReadLine();
                _nodeProcess.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Failed to start NSW Game Catalog server:\n" + ex.Message,
                    "NSW Game Catalog",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private static void StopServer()
        {
            try
            {
                if (_nodeProcess != null && !_nodeProcess.HasExited)
                {
                    _nodeProcess.Kill();
                    _nodeProcess.WaitForExit(3000);
                }
            }
            catch { }
            try
            {
                if (_trayIcon != null)
                {
                    _trayIcon.Visible = false;
                    _trayIcon.Dispose();
                }
            }
            catch { }
        }

        private static void WaitForPort(string portStr, int timeoutMs)
        {
            int port;
            if (!int.TryParse(portStr, out port)) port = 3000;
            var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
            while (DateTime.UtcNow < deadline)
            {
                try
                {
                    using (var client = new TcpClient())
                    {
                        var res = client.BeginConnect("127.0.0.1", port, null, null);
                        if (res.AsyncWaitHandle.WaitOne(250) && client.Connected)
                        {
                            client.EndConnect(res);
                            return;
                        }
                    }
                }
                catch { }
                Thread.Sleep(200);
            }
        }

        private static void OpenBrowser()
        {
            try
            {
                Process.Start(new ProcessStartInfo("http://localhost:" + _port) { UseShellExecute = true });
            }
            catch { }
        }

        private static void SetupTrayIcon()
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add("Open Web UI (localhost:" + _port + ")", null, (s, e) => OpenBrowser());
            menu.Items.Add("View Server Log", null, (s, e) =>
            {
                try { Process.Start(new ProcessStartInfo(_logPath) { UseShellExecute = true }); } catch { }
            });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Stop & Exit", null, (s, e) =>
            {
                StopServer();
                Application.Exit();
            });

            _trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = "NSW Game Catalog (Port " + _port + ")",
                ContextMenuStrip = menu,
                Visible = true
            };
            _trayIcon.DoubleClick += (s, e) => OpenBrowser();
        }
    }
}
