## Preview Findings — 2026-05-17

<!-- Added by /preview. Run /ralph to address these items. -->

- [x] `src/components/tabs/SensorsTab.vue:509` — [ux-patterns] Accept button needs `:loading` state — done: added `isAcceptingCal` ref with try/finally, bound `:loading` on Accept and `:disabled` on Discard in SensorsTab.vue
- [x] `test/js/msp/MSPHelper.test.js:484` — [coderabbit-cfg] Misleading test comment — done: fixed to "Mixed extreme values: w=1.0, x=-1.0, y=0.0, z≈0.5"

## Preview Findings — 2026-05-17 (round 2)

<!-- Added by /preview. Run /ralph to address these items. -->

- [x] `src/composables/useMagCalibration.js:302` — [coderabbit-cfg, peer-review] acceptCalibration cleanup ordering — done: on error, restarts polling and returns to "collecting" phase so user can retry. Test updated to match.
- [x] `src/components/tabs/SensorsTab.vue:507` — [ux-patterns] Accept button layout shift — done: changed `v-if` condition to show button always in guided mode, added `:disabled="!cal.quality"` instead

<!-- /preview PASS — 2026-05-17 -->

## Debrief Log

### Round 1 — 2026-05-17
- **last_fetched_at**: all
- **this_round_at**: 2026-05-17T22:30:00Z
- **New items**: 1 total (0 fix / 1 skip / 0 discuss)
- **Fixed**: none
- **Skipped**: ~~CodeRabbit inline on `MagSphereView.vue:484` — originally skipped as out of scope~~ → addressed per user request (see Round 2)
- **Discuss**: none
- **Commit**: none — no fixes
- **Status**: All CI passing, no human reviews outstanding

### Round 2 — 2026-05-17
- **last_fetched_at**: 2026-05-17T22:30:00Z
- **this_round_at**: 2026-05-17T22:40:00Z
- **New items**: 0 new from bots, 1 user-requested fix from Round 1 skip
- **Fixed**: Added `liveMag` watcher in `MagSphereView.vue:1412` — calls `rebuildFieldReference()` when `!sphereFit`, so field arrow resizes with live mag readings before a fit exists
- **Skipped**: none
- **Discuss**: none
- **Commit**: `8167a403` — fix(sensors): add liveMag watcher to rebuild field reference before sphere fit
- **Status**: Pushed, CI passing

<!-- /debrief round 2 modified code — re-run /preview before creating additional PRs -->

### Round 3 — 2026-05-17
- **last_fetched_at**: 2026-05-17T22:40:00Z
- **this_round_at**: 2026-05-17T22:55:00Z
- **New items**: 14 total (14 fix / 0 skip / 0 discuss)
- **Fixed**: S7748 zero fractions in MSPHelper.js + tests (12 instances), S1854 unused `fcStore` variable, S7773 `NaN` → `Number.NaN`
- **Skipped**: none
- **Discuss**: none
- **Commit**: `25b9992f` — fix(sensors): address SonarCloud findings (round 3)
- **Status**: Awaiting push

<!-- /debrief round 3 modified code — re-run /preview before creating additional PRs -->

## 3D Mag Sphere View — Visual Issues (2026-05-20)

### Orientation & axis bugs
- [x] Z axis bold line points downwards (into the ground) — should point upwards — done: split each axis line into bold positive half (0.9 opacity) and faded negative half (0.25 opacity) in MagSphereView.vue initScene(); +Z now clearly points upward
- [x] Quad icon pitch axis is inverted — done: fixed quaternion body-to-earth→earth-to-body conversion in d319fd30
- [x] Quad icon prop colours are wrong — done: green front, red rear in d319fd30
- [x] Projecting X axis vector always stays in the horizontal plane — should orient with the quad (positive straight forward out of the nose) — done: vectorLines moved to body frame as children of quadIcon in commit 466bd699

### Missing graphical elements
- [x] No fixed magnetic field inclination line — done: field reference arrow added in earlier commits, user confirmed working in 2026-05-21 review

### Sphere & scaling issues
- [ ] Wireframe sphere is not centred at 0,0,0 — appears offset below the quad (reverted to earlier broken version); should represent the celestial sphere with us sitting at the origin
- [x] N, S, E, W cardinal labels should be drawn further out, on the horizon, touching the celestial sphere — done: compass ring at DEFAULT_SPHERE_RADIUS in d319fd30
- [ ] Zoom level should be closer in so the quad is more visible

### Known but deferred
- [x] Orange total field length vector at a strange angle (points out the bottom when quad is flat) — done: removed entirely in commit 466bd699, replaced with white dot on +X axis

### What works well
- X axis projected line length correctly represents mag field strength on X axis (just orientation is wrong)

## Preview Findings — 2026-05-20

<!-- Added by /preview. Run /ralph to address these items. -->

- [x] `src/components/dialogs/mag-calibration/MagSphereView.vue:1414` — [sonar-cfg, coderabbit-cfg] liveMag watcher triggers `rebuildFieldReference()` at 10Hz before sphere fit — done: throttled to 1Hz using `performance.now()` timestamp guard in MagSphereView.vue
- [x] `src/components/tabs/SensorsTab.vue:1402` — [ux-patterns] No user-visible error feedback when Accept calibration fails — done: added `gui_log(i18n.getMessage("magCalibrationError"))` in the else branch of `acceptGuidedMagCal()`

## Preview Findings — 2026-05-20 (round 2)

<!-- Added by /preview. Run /ralph to address these items. -->

- [x] `src/components/tabs/SensorsTab.vue:1409` — [coderabbit-cfg] `i18n.t()` does not exist on the imported `i18n` object — would throw TypeError at runtime. Must use `i18n.getMessage()` — done: fixed in commit b628a198

<!-- /preview PASS — 2026-05-20 -->

## PRs

- https://github.com/betaflight/betaflight-configurator/pull/5123

## Review from 2026-05-21:

Just tested at 10am in Australian morning time...
improvements noted:

- no errordialog when clicking detect  to get local magnetic data from the internet
- the larger celestial sphere is improved
- the magnetic field line in orange is at the correct angle, with the orange segment pointing to magnetic north

Things to fix:
 
- [x] the fixed blue up/down axis around which the celestial sphere rotates (celestial / earth frame Z axis)  is bold when pointing downwards to the south celestial south pole (under the ground) , ie it is reversed, it should be bold in the upwards (into the sky) segment — done: increased bold/faded contrast (1.0 vs 0.15 opacity, bold half uses opaque material) for all axis lines
- [x] the quad icon still pitches incorrectly, ie when pitching the quad back, the nose of the quad in the mag display goes down. contrast the mag quad icon to the icon in the other display at the same time. It is possible this problem is related to the inverted Z axis display. — done: fixed quaternion conversion (BF sends body-to-earth; Three.js needs earth-to-body conjugate + frame conversion). Euler fallback also corrected.
- [x] the inclined magnetic field line has a large yellow sphere at its center, but the. center is not at 0,0,0. The magnetic field line should pass through 0,0,0. We do not need that yellow sphere to indicate the center of this line, since it will always be at 0,0,0. — done: field line always at origin, yellow center marker removed
- [x] the magnetic field line is orange in one direction (to north magnetic pole) and white in the other direction. If we consistently use 'bold' to indicate 'north' and 'not bold' to indicate 'south', we should use the same color for the magnetic field line, just change thickness, same as for the celestial/earth frame Z axis, thicker line for 'up', thinner for down (under/into  the ground). — done: both halves now orange, differentiated by thickness only
- [x] the letters N, S, W, E should visually be further along their axes, visually where the celestial sphere touches their axis. Currently half way along — done: compass ring and labels now at celestial sphere radius (DEFAULT_SPHERE_RADIUS)
- [x] there are large red  and orange circles drawn on the edges of the celestial sphere. it's not clear what these represent. they should be removed. — done: coverage zone disc indicators disabled
- [x] in the 3d icon, the front props are red,the rear props are grey. Our convention is green props on front, red props at back, need to fix this. — done: front props green (0x44ff44), rear props red (0xff4444)

<!-- /preview PASS — 2026-05-21 -->

## Review2 from 2026-05-21

Looking good! 
Very exciting to see each incremental improvement. 

    the main magnetic field vector is now drawn exactly correctly, at the correct angle.
    the quad's props are the right colours and it moves correctly.

Perfect!

Next step:

The X, Y and Z axes should be  in the quad's frame of reference. Currently they are fixed in the celestial frame of reference - the X axis line always is flat to the horizon and points North. In reality, the X axis mag value is measured in the quad's frame of reference, and represents the line in space that the X mag line points to. So the X, Y and Z axes move 'with the quad' whenever the quad icon moves around. 

- [x] the Red X axis should point along the Nose to Tail line - along the pitch axis of the 3D model. It should move dynamically with the model. Positive values for the Mag should push the line forward out of the nose. So like when the nose of the quad points North, the line pokes out of the nose of the quad, with whatever length represents the X mag field strength. If the X value is negative, we see that red line push out of the tail of the quad. — done: vectorLines are now children of quadIcon (body frame), using BF→display body-frame coordinate conversion
- [x] the Y axis should point Left out of the left side of the quad, and be thicker, when Y mag values are positive; conversely, a thinner Y axis line comes out of the right side of the quad when the Mag Y is negative. It moves with the quad. — done: same change, Y axis in body frame
- [x] likewise for the Z mag axis, when Z is positive, the thicker blue line goes directly upwards out of the top plate of the quad, and conversely is thin and comes out of the bottom of the quad when the Z axis mag value is negative.  Both move with the attitude of the quad. — done: same change, Z axis in body frame

The end result is that when the user points the nose directly towards magnetic north, ie when aligned parallel to the magnetic north line,  the bolder red line points out the front of the quad, like a red laser beam, and it will have length equal to the field strength in the X axis.

## Review 3 from 2026-05-21

Finally, we don't need the orange line with the white dot on the end.

What we can do is put that little white dot on the end of the bold end of the red X axis line at a distance equal to the total mag field vector.  As the quad rotates in space, the X sensor line moves around with it. When pointing directly North, the white dot an the red X axis will align with the fixed magnetic field vector.  The white dot will always be at the total field vector distance from the center of the quad icon, ie from 0,0,0.

While calibrating, each time we get a new sample, we 'drop the white dot' off at that point, and fix it in space.
As we pivot the quad around, we drop these dots in a sphere.

The sphere shows the user that the X axis has been pointed randomly, at random angles, and the field strength at each angle.

If there are 'holes in the sphere' it means the nose of the quad hasn't been pointed in that direction, and the user has to 'fill those holes in' by pointing the quad in that direction 🙂

It will end up being very intuitive I think.

We could perhaps also draw a small grey  dot at the current centre of the sphere, as it develops (once we have a few points..

This essentially  represent the mag sensor offset that needs to be corrected by calibrating.

If say we had a previous cal value, we could perhaps put a green dot where it is.
The location of the grey dot then shows where the new cal value will go.

<!-- /preview PASS — 2026-05-21 -->

## Review 1 from 2026-5-22

the  XYZ axes look great - all are dynamically  oriented in the frame of reference of the craft, and the bold segment, indicating sensor value is good.

- [x] Only one small detail, the orientatiion of the Z axis is correct in relation to the craft, but the 'sign' as indicated by the bold segment is  reversed; when the top is pointing directly into the field, the segment exiting the top of the craft should be bold, but at the moment it is the opposite. — done: BF mag Z convention is positive=up (opposite to gyro/accel Z=down), so removed Z negation in body-frame vector line mapping (bz = mag.z instead of -mag.z)
- [x] Let me know when you have the dot on the projection of the x axis that accumulates to form a sphere as the craft is rotated around. — done: white dot on +X axis at total field distance (body frame), point cloud accumulates samples forming a sphere — implemented in commit 466bd699
- [x] Also consider moving the cardinal letters further out from the center, more towards the sphere wall, per haps twice as far.   It seems that at the start the sphere is drawn initially quite small, before becoming larger, and perhaps the location of the cardinal letters is set a bit too close because of that? — done: moved N/S/E/W labels from radius to radius*1.5 in createCompassRing()

## Review 2 from 2026-5-22

- [x] I was using it just now and realised that something seemed wrong... took me a while to figure it out. — done: body-frame vector lines now use bold (1.5x thick, 0.9 opacity) for positive components and thin (0.6x thick, 0.35 opacity) for negative, making the sign visually distinct

Imagine we point the nose of the quad directly into the magnetic field. This part is currently perfect 🙂 We see the bold red line pointing out of the nose of the craft, up directly aligning with the main magnetic field vector.

But when we point the tail upwards, so that the vector on X is strongly negative, what we see is a thin red line pointing up to the North magnetic point.
It looks the same almost when the nose points  into the field, and when the tail points up into the field. The only difference is that the red line is thinner.

But that is not how it should, I think, be.

I think what should happen is that when the nose points into the field, that is fine.  But when the tail points into the field, I think we show negative X in the quad frame of reference as the thin red line exiting the tail of the quad - exiting the opposite way, and pointing to magnetic south.

Same applies for the other vectors.

When the Y vector is positive, because the left side of the quad points to magnetic North, then the wider green line points North; but if the left side of the quad points to magnetic south, then we get the thin green line pointing to the south magnetic pole, exiting the left side of the quad, and no line pointing to North at all.

So that for any axis pointing towards magnetic north, we see a thick line pointing in the direction of magnetic north; when the axis points south, there is no line pointing north, only a line pointing south.

This I think will make more sense for the user.

In the Northern hemisphere, the lines will all then be 'below the horizon' since magnetic north is always somewhere below the horizon.  In the southern hemisphere, when the noise points up, the line is up, when down, it is down. I think this is correct.

- [x] Also I have been thinking about where to put the dots that form the sphere during the calibration process. — resolved: the user's earth-frame dot proposal collapses all dots onto the field vector line (no sphere). The existing approach — plotting body-frame mag readings directly in scene space — correctly forms a sphere because the field vector "rotates" in body frame as the quad rotates. This is the standard magnetometer calibration visualization.

I had originally suggested dropping each one  them at the end of the X axis, but now I realise that idea is wrong.
Each point must represent the end of the net detected field vector when calculated from the field strengths.

But the method is to calculate the angle and the length in the quad frame of reverence, but draw the point at that distance away from 0,0,0, and at that angle in the  the earth frame of reference. 

What I mean is, let's say the mag X,Y,Z values are 2000, 0,0,0... that means the nose of the quad is into the field and  at the angle of the field. The vector length is 2000. Relative the quad, the angle is whatever vector angle represents exiting the nose at the attitude of the quad, and in this case it must be equal to the vector angle of the magnetic field. So we draw the dot at 2000 away from 0,0,0 out in the line of the magnetic field.
But what if the value is -2000, 0,0? This means a length of 2000 exiting the tail of the quad, so the point is drawn on the mag field vector 2000 away from 0,0,0 below the horizon.

Now what if the quad is say flat to the horizon, and pointing  cardinal north. Then we get positive values on X and Z and zero on Y, and again the vector is 2000 long and pointing in the line of the magnetic field.

If we draw this dot 2000 out, up that field line, it is in the same place as the first dot.

Likewise if we point Z directly into the field, then the vector is 0,0,2000 , and the Z axis is pointing upwards at the field angle. 
In fact all measurements of the vector will be equal to field strength and all will align with the field vector line .
So we will never  get a sphere, just a collection of dots at north end of the field line, and more at the south. this is no good.

## Review 1 from 2026-5-23

- [x] I thought on this .
I think the simplest thing is to calculate mag vector length as the total mag field strength for each sample of x, y, z, and drop the dot at that distance from 0,0,0 on the direction of the red craft X axis. If the total vector is positive then drop the point above the horizon, and below the horizon for negative total mag vector.

- [x] So if we point x directly into the field, the dot will get dropped on the field angle line. In the Northern Hemisphere the nose will be pointing down, north, at the inclination angle, so the dots will end up at inclination angle below horizon. In Southern hemisphere, directly into the field is upwards at inclination angle, and dots will appear upwards along the inclination line.
 If we point Y directly into the field, X must point east-west, so the dots will get dropped along the E-W axis at the detected field strength, which will mostly be determined by the  Y axis of the sensor.
And if craft  Z is  upwards, the quad must be flat on the desk, and a point will be dropped on the horizontal plane in whatever direction the craft's nose is pointing. Yawing the quad while flat will drop points in a circle  on the horizontal plane at field strength distance out from 0,0,0.

- [x] Similarly when the pitch angle is 90 degrees (pitch axis up and down vertically,  then in the northern hemisphere the total vector sign will be positive when pointing  the nose vertically down below the horizon,   so the dots will go at the bottom of the celestial sphere.  In the southern hemisphere, they will go to the top when the nose is pointing vertically upwards.
If the quad is pitched 45 degrees to the horizontal plane, and moved around at that pitch angle, then dots appear at an angle of 45 degrees from the horizon - on the 45 degree latitude line.

In essence the points are dropped at pitch angle of the craft from the horizontal plane, and at the estimated celestial yaw angle. Roll is ignored.

This returns a sphere of dots as the nose of the quad points randomly at all angles
The user gets to see dots appearing around the current direction in which the nose is pointing. It seems to them that the nose of the quad is a torch illuminating an otherwise invisible sphere as it accumulates the dots.
Wherever there is a hole in the sphere the user just points the nose of the quad in that direction and dots will appear there.
That's what we want, anyway.

I think that's the last thing to do.

- [ ] I had wondered about being able to enter this graphic before choosing to calibrate, showing a dot for the current cal offset location. The user could then validate the current orientation and see the XYZ values using the active cal values by observing the graph.

If we start the calibration and accumulate the dots, the current cal values are not used,  because cal is set to 0,0,0 at the start.so the user cannot see how their current cal values operate.

We should definitely graph the current cal offset as a fixed dot offset from 0,0,0 when opening the window. And on completion we should see the new cal value graphically to compare to the old one. 


## Notes

Remaining open items in issues.md (for future rounds):
  - Wireframe sphere offset
  - Zoom level
  - Green dot at previous cal value (Review 3 suggestion — needs new prop for previous cal offset)


## Improvements

- [ ] The main problem with the firmware cal method being triggered by Configurator is that it will auto-save after a set time (unless your Configurator interface can overrule the auto-save). Additionally, from memory, the firmware calibration process requires that the user must 'tap' the frame sufficiently hard  to start the data collection. Without that tap, nothing happens, and the cal fails. 
So there are some issues with using the firmware calibration.

Ideally a firmware calibration triggered by Configurator would either:

    not require the frame tap, and instead start collecting when the user hits start, and then display a countdown timer, and then  not auto-save but confirm that the user wants to save the new values,

or...

    provide an explanation that the cal starts when the frame is tapped, and ends with an autosave after the timeout...


It is nice to check the firmware cal with a build with a buzzer because it beeps at the right times


claude --resume a3669261-dc65-4786-a34d-64596f6442e2