#pragma once
#include <stdint.h>

namespace ServoBenchPlan {
struct Step { uint32_t pulseUs; uint32_t holdMs; int nominalDegrees; };
// Provisional 1000..2000us -> 0..180 degree mapping, NOT measured calibration.
constexpr uint32_t pulse(int nominalDegrees) { return 1000 + nominalDegrees * 1000 / 180; }
constexpr Step classifier[] = {
  {pulse(90), 1000, 90}, {pulse(60), 3000, 60},
  {pulse(120), 3000, 120}, {pulse(90), 1000, 90}
};
constexpr Step sweep[] = {
  {pulse(0), 750, 0}, {pulse(30), 2500, 30}, {pulse(60), 2500, 60},
  {pulse(120), 2500, 120}, {pulse(150), 2500, 150}, {pulse(180), 750, 180},
  {pulse(90), 1000, 90}
};
constexpr int sweepCount = 7;
constexpr uint32_t sweepDurationMs = 12500;
// User-selected mounted routing positions. Physical angles remain unmeasured.
constexpr uint32_t classifierHomeUs = 700;
constexpr uint32_t classifierSideUs = 2000;
constexpr uint32_t openerClosedUs = 1800;
constexpr uint32_t openerOpenUs = 700;
// Close flap, position chute, open, close, return home. Both outputs then stop.
struct CycleStep { uint32_t classifierUs; uint32_t openerUs; uint32_t holdMs; };
constexpr int homeCount = 2;
constexpr uint32_t homeDurationMs = 2000;
constexpr CycleStep homeStep(int phase) {
  return {phase == 0 ? 0u : classifierHomeUs, openerClosedUs, 1000};
}
constexpr int cycleCount = 6;
constexpr uint32_t cycleDurationMs = 8000;
constexpr CycleStep cycleStep(int route, int phase) {
  return {phase == 0 ? 0u : phase == 1 || phase == 5 || route == 0 ? classifierHomeUs : classifierSideUs,
          phase == 3 ? openerOpenUs : openerClosedUs,
          static_cast<uint32_t>(phase == 2 || phase == 3 ? 2000 : 1000)};
}
constexpr Step opener[] = {
  {pulse(90), 1000, 90}, {pulse(60), 3000, 60}, {pulse(90), 1000, 90}
};
constexpr int count(int servo) { return servo == 0 ? 4 : 3; }
constexpr uint32_t durationMs(int servo) { return servo == 0 ? 8000 : 5000; }
inline const Step& step(int servo, int phase) { return servo == 0 ? classifier[phase] : opener[phase]; }
// User-controlled pulse calibration. This envelope is not a measured safe range.
constexpr bool validFixedPulse(uint32_t us) { return us >= 700 && us <= 2000; }
constexpr bool referencePulse(uint32_t us) {
  return us == 1000 || us == 1333 || us == 1400 || us == 1500 || us == 1600 || us == 2000;
}
constexpr Step fixed(uint32_t us) { return {us, referencePulse(us) ? 5000u : 750u, -1}; }
// Do not extrapolate beyond the current uncalibrated 1000..2000us envelope.
constexpr bool validRangeOffset(int offset) { return offset == 30 || offset == 60 || offset == 90; }
constexpr int rangeAngle(int offset, int phase) {
  return phase == 1 ? 90 + offset : phase == 3 ? 90 - offset : 90;
}
constexpr uint32_t rangeHoldMs(int offset, int phase) {
  return phase == 1 || phase == 3 ? (offset == 90 ? 750 : 2000) : 1000;
}
constexpr Step rangeStep(int offset, int phase) {
  return {pulse(rangeAngle(offset, phase)), rangeHoldMs(offset, phase), rangeAngle(offset, phase)};
}
constexpr uint32_t rangeDurationMs(int offset) { return offset == 90 ? 4500 : 7000; }
}
