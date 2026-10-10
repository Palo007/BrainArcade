# Windows PC with bad Bluetooth: play through an Android phone (adb)

Use this guide when the Muse headband does not connect to your Windows PC.

Typical signs:

- Chrome shows **"GATT Server is disconnected"**.
- The Muse connects, then drops after a few seconds.
- Windows cannot pair the Muse in **Settings > Bluetooth**.

Many built-in laptop Bluetooth chips cannot hold the Muse link. The fix: the **phone** talks to the Muse, and the **PC** shows the game.

## How it works

```text
[ Muse ] --Bluetooth--> [ Phone: Chrome, http://localhost:5180 ]
                                  |
                 adb reverse (USB cable or Wi-Fi adb)
                 phone port 5180 --> PC port 5180
                                  |
                        [ PC: game server, port 5180 ]
                                  |
                        [ PC: Chrome, http://localhost:5180 ]
                          button: CONNECT VIA PHONE
```

- All game files come from the PC. The phone only opens the page and talks to the Muse.
- Web Bluetooth works only on secure pages. Chrome trusts `localhost`. `adb reverse` lets the phone open the PC server as `localhost`.
- The phone sends the brain data through the server (`ws://localhost:5180/relay`) to the PC page.
- This works only with the local server. It does **not** work with the public GitHub Pages site.

## 1. What you need

| Item | Notes |
|---|---|
| Windows PC | Windows 10 or 11 |
| [Node.js](https://nodejs.org) 20+ | Check with `node -v` |
| Git | To clone the repo |
| `adb` (Android Platform Tools) | [Platform Tools](https://developer.android.com/tools/releases/platform-tools), or it comes with [scrcpy](https://github.com/Genymobile/scrcpy) (`winget install Genymobile.scrcpy`) |
| Android phone | Chrome. Bluetooth that works with the Muse |
| USB cable | More stable than Wi-Fi adb |
| Muse S Athena | Charged. Close the official Muse app first: the Muse talks to one device at a time |

## 2. One-time setup

### 2.1 Get the code

```bash
git clone https://github.com/Palo007/BrainArcade.git
```

```bash
cd BrainArcade
```

```bash
npm install
```

### 2.2 Turn on USB debugging on the phone

1. Open **Settings > About phone**.
2. Tap **Build number** 7 times. Developer options are now on.
3. Open **Settings > Developer options**.
4. Turn on **USB debugging**.
5. Connect the phone to the PC with the USB cable.
6. On the phone, tap **Allow** on the "Allow USB debugging?" box.

Check it on the PC:

```bash
adb devices
```

You must see one line that ends with `device`. If it ends with `unauthorized`, look at the phone and tap **Allow**.

### 2.3 Optional: Wi-Fi adb (no cable)

With the cable still connected:

```bash
adb tcpip 5555
```

Find the phone IP address in **Settings > About phone > Status** (or your Wi-Fi details). Then:

```bash
adb connect <PHONE_IP>:5555
```

Now you can remove the cable. The server remembers this phone and reconnects it when Wi-Fi sleeps. After a phone restart, do the cable step again.

### 2.4 Phone settings that help

- Set Chrome battery to **No restrictions** (**Settings > Apps > Chrome > Battery**). Xiaomi/HyperOS, Samsung and others freeze Chrome in the background otherwise.
- Keep the phone screen on. The game page keeps it on while the Muse is connected.

## 3. What to configure, and where

You do not need to configure anything in the usual case. Change these only if a step fails.

| Setting | Where | Default | When to change it |
|---|---|---|---|
| `ARCADE_PORT` | `scripts/start-arcade.bat` (or environment variable) | `5180` | Port 5180 is used by another program |
| `ADB` | `scripts/start-arcade.bat` (or environment variable) | found by itself | The server log shows `adb-error`. Set the full path, for example `C:\platform-tools\adb.exe` |
| `ADB_SERIAL` | `scripts/start-arcade.bat` (or environment variable) | last phone used | More than one phone or emulator is connected |
| `REPO` | `scripts/start-arcade.bat` | the folder above `scripts\` | You copied the `.bat` file to another place, for example the desktop |
| `ARCADE_NO_ADB=1` | environment variable | off | You do not use a phone at all |

**Where the server looks for `adb.exe`** (in this order): the `ADB` setting, your `PATH`, `%ANDROID_HOME%\platform-tools`, `%ANDROID_SDK_ROOT%\platform-tools`, `%LOCALAPPDATA%\Android\Sdk\platform-tools`, `%LOCALAPPDATA%\Microsoft\WinGet\Links`, and the WinGet scrcpy / Platform Tools package folders.

To set a value, remove `rem ` at the start of its line near the top of `scripts/start-arcade.bat` and change the value:

```bat
set "ADB=C:\platform-tools\adb.exe"
```

## 4. Every session

1. Connect the phone (cable or Wi-Fi adb).
2. Double-click `scripts\start-arcade.bat`. Keep the window open.
   - It stops an old server on the same port.
   - It builds the app and starts the server on `http://localhost:5180`.
   - Every 5 seconds it checks adb, reconnects Wi-Fi adb, and sets `adb reverse tcp:5180 tcp:5180` again.
3. Wait for `reverse-restored` in the window. To check by hand:
   ```bash
   adb reverse --list
   ```
   You must see `tcp:5180 tcp:5180`.
4. On the **phone**, open Chrome and go to `http://localhost:5180`.
5. Tap **CONNECT MUSE (ATHENA)**, pick the Muse, allow Bluetooth.
6. Wait until the phone shows live electrode values.
7. On the **PC**, open Chrome and go to `http://localhost:5180`.
8. Click **CONNECT VIA PHONE**. Play on the PC.

Keep the phone page open and in front during the whole session.

## 5. Problems

| Problem | Cause | Fix |
|---|---|---|
| Phone page does not load | Server not running, or adb link lost | Check the server window. Run `adb devices`. The server sets the link again within 5 s |
| `adb-error` in the log | `adb.exe` not found | Set `ADB` in `scripts/start-arcade.bat` |
| Phone shows an old or different app | Another program on the phone uses port 5180 (for example Termux) | Stop it, or set another `ARCADE_PORT` |
| "No data from phone" on the PC | Muse not connected on the phone | Connect the Muse on the phone first |
| PC goes back to the connect screen | No data for 60 s: phone page closed, Chrome frozen, or Muse off | Keep the phone page in front. Set Chrome battery to No restrictions |
| Wi-Fi adb drops after a phone restart | `adb tcpip` is reset | Do step 2.3 again with the cable |
| Code changes do not show | The server serves the last build | Run `scripts\start-arcade.bat` again. It builds again |

**Log file:** `logs/arcade-YYYY-MM-DD.log` in the repo folder. It has the server, relay, adb and filtered phone logcat lines. `logs/` is not committed to git.

## Other way: a USB Bluetooth dongle

A USB Bluetooth 5 dongle on the PC often fixes the link too. Then you can connect the Muse straight from PC Chrome and skip adb.
