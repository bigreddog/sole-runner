# Sole Runner

A self-contained 3D mountain-trail running companion for a Sole F85, built from the approach in [Yahooligan's app branch](https://github.com/bigreddog/yahooligan/tree/interactive-virtual-trainer-implementation-9714638404665484110). Procedural Three.js scenery, an articulated runner, a side-on camera, optional trail camera, workout profiles, Bluetooth telemetry and TCX export. Designed for Android phones in portrait and landscape.

## Run

Node.js 20+:

```sh
npm ci
npm start
```

Open `http://localhost:8000`. **Explore in demo** works without a treadmill. Runtime dependencies are vendored; the app makes no external requests. `npm run build` creates `dist/` for any static HTTPS host. Use `npm start -- --host=0.0.0.0` for local network development; a phone visiting a plain HTTP LAN address cannot use Web Bluetooth. Host over HTTPS for phone use. Chrome on Android is the recommended browser; iOS Safari does not provide Web Bluetooth.

## Sole F85 / firmware 2.1

Firmware 2.1 is the user's reported version, not a certified compatibility target. Purchase year (2024) does not establish the hardware generation. The app discovers standard **Bluetooth Fitness Machine Service (FTMS)**. It reads **Treadmill Data (0x2ACD)** for actual belt speed, incline and optional heart rate. It never substitutes cycling simulation or ERG commands.

1. Close other apps connected to the treadmill, turn on the console, open this app in Android Chrome over HTTPS, then tap **Connect treadmill via Bluetooth**.
2. Choose the treadmill's fitness connection, rather than its Bluetooth audio/speaker connection.
3. Start the belt and set speed on the physical console. Tap **Start connected run**. Belt speed controls scene travel and integrated distance. Reported incline controls the local trail slope. Zero speed stops the runner.
4. Open **Run tools → Bluetooth diagnostics** to inspect the feature bits and incline range. Missing standard FTMS produces a visible error. Some Sole revisions need a compatible FTMS bridge; no unverified proprietary Sole commands are sent. A bridge has not been tested with this app.

Automatic incline is off by default. If the treadmill advertises incline target support and supplies a valid range and control point, the option in Run tools becomes available during a live run. Enabling it requests FTMS control and waits for an acknowledgement. Route targets use **Set Target Inclination (0x03)**, bounded to supported steps between **0% and 10%**, at most once every five seconds and only when the target changes. Writes are serialized; failed acknowledgements, control loss or timeouts disable control and pause the app. Timeout requires reconnecting.

**The app never starts or stops the belt or changes belt speed.** App pause, finish, tab switching and disconnection do not stop the treadmill. Use the console and its safety key. Disabling automatic incline stops future app targets; an in-flight command may complete and the machine retains its last incline. Changing back to manual control does not reset grade.

F85 behavior varies by revision: see the [QZ F85 ENT report](https://github.com/cagnulein/qdomyos-zwift/issues/2385) and [F85 compatibility investigation](https://github.com/cagnulein/qdomyos-zwift/issues/1468). Physical telemetry, range reporting, acknowledgement behavior and incline movement must be verified on the user's treadmill. Automated tests use mock peripherals.

## Trail and session behavior

- Alpine ridge, Pine meadow, Summit approach and Switchback repeats provide reference incline profiles over distance. Duration is 5–180 minutes. A profile chart shows planned grade over a 3 km window; manual live mode uses the actual reported incline, even when it differs from the plan.
- The trail is a local procedural rendering that follows current incline, rather than a geographically recorded route. Planned uphill grades range from 1% to 10%. Actual reported downhill grade is displayed and rendered in manual mode. Auto mode never requests decline.
- Demo speed is configured in setup; grade follows the selected route. Demo metrics and exports are labelled as simulated.
- Live speed and incline expire after five seconds. Missing speed contributes no distance and causes the run to pause after the freshness window. Missing incline displays a dash, renders level ground and adds no ascent; auto control switches off. Reported heart rate, if supplied by the treadmill, expires separately.
- Pause freezes session time, distance and runner animation. Backgrounding the page or a callback interruption over two seconds pauses the app and disables auto incline. Resume is explicit; re-enable auto incline separately. This deliberately avoids trying to control a moving treadmill while Android suspends the browser.
- Screen wake lock is requested during a run and released on pause/finish. Support and battery policy vary by browser.
- TCX records running time, speed, integrated distance and optional heart rate. Ascent is a computed estimate from speed and reported incline. The export omits generated GPS/altitude; no location is invented. Unknown calories use the TCX-required zero. Exports remain available after finish and on the setup screen until another run starts. Records stay in memory; reload discards them.

## Verification

```sh
npm test
npm run build
npm start
# Separate terminal; system Chromium or set CHROMIUM_PATH:
npm run test:browser
```

Protocol/session tests check optional FTMS fields, signed grades, truncated packets, incline ranges and quantization, acknowledgements, timeouts, cancellation, measured-distance integration and export. Browser checks cover desktop and Android portrait/landscape, 3D rendering, demo progress, pause/resume, camera, lighting, export and finish. Screenshots are saved under ignored `verification/results/`.

## Credits

Three.js r180 is vendored from Yahooligan's `js/vendor/three/` with its upstream MIT license. The static server, build script, screen wake lock and FTMS command queue are adapted from Yahooligan at commit `176b420aa38cd60e404964fe090119d421b5cfe4`. The treadmill decoder, session model, trail, runner and interface are specific to Sole Runner. Scenery is procedural; no models, fonts or textures are downloaded at runtime.
