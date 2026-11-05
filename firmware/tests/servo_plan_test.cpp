#include <assert.h>
#include "../common/servo_plan.h"

int main() {
  using namespace ServoBenchPlan;
  uint32_t homeTotal = 0;
  for (int i = 0; i < homeCount; ++i) {
    const auto s = homeStep(i);
    assert(s.openerUs == 1800);
    assert(s.classifierUs == (i == 0 ? 0u : 700u));
    homeTotal += s.holdMs;
  }
  assert(homeTotal == homeDurationMs);
  for (int route = 0; route < 2; ++route) {
    uint32_t total = 0, previousClassifier = 0, previousOpener = 0;
    for (int phase = 0; phase < cycleCount; ++phase) {
      const auto s = cycleStep(route, phase);
      total += s.holdMs;
      assert(phase == 0 ? s.classifierUs == 0 : s.classifierUs >= 700 && s.classifierUs <= 2000);
      assert(s.openerUs == (phase == 3 ? 700u : 1800u));
      if (phase == 0) assert(s.classifierUs == 0); // Close before ANY rotation.
      else if (route == 0 || phase == 1 || phase == 5) assert(s.classifierUs == 700);
      else assert(s.classifierUs == 2000);
      if (s.classifierUs && s.classifierUs != previousClassifier) {
        assert(previousOpener == 1800 && s.openerUs == 1800);
      }
      previousClassifier = s.classifierUs;
      previousOpener = s.openerUs;
    }
    assert(total == cycleDurationMs && total == 8000);
    assert(cycleStep(route, 0).openerUs == 1800);
    assert(cycleStep(route, 1).classifierUs == 700); // Start from calibrated home.
    assert(cycleStep(route, 4).openerUs == 1800); // Close before returning chute.
    assert(cycleStep(route, 5).classifierUs == 700);
    assert(cycleStep(route, 5).openerUs == 1800);
  }
  uint32_t sweepTotal = 0;
  const int sweepAngles[] = {0, 30, 60, 120, 150, 180, 90};
  for (int i = 0; i < sweepCount; ++i) {
    assert(sweep[i].nominalDegrees == sweepAngles[i]);
    assert(sweep[i].pulseUs >= 1000 && sweep[i].pulseUs <= 2000);
    sweepTotal += sweep[i].holdMs;
  }
  assert(sweepTotal == sweepDurationMs);
  assert(sweep[0].holdMs <= 750 && sweep[5].holdMs <= 750);
  const uint32_t endpointPulses[] = {700u, 800u, 850u, 900u, 950u, 975u, 1800u};
  for (uint32_t p : endpointPulses) {
    assert(validFixedPulse(p));
    assert(fixed(p).pulseUs == p && fixed(p).holdMs == 750);
  }
  assert(!validFixedPulse(699) && !validFixedPulse(2001));
  const uint32_t fixedPulses[] = {1000u, 1333u, 1400u, 1500u, 1600u, 2000u};
  for (uint32_t p : fixedPulses) {
    assert(validFixedPulse(p));
    assert(fixed(p).pulseUs == p && fixed(p).holdMs == 5000);
  }
  assert(!validFixedPulse(0) && !validFixedPulse(500) && !validFixedPulse(2500));
  const int offsets[] = {30, 60, 90};
  for (int offset : offsets) {
    assert(validRangeOffset(offset));
    uint32_t total = 0;
    for (int i = 0; i < 5; ++i) {
      const auto s = rangeStep(offset, i);
      assert(s.pulseUs >= 1000 && s.pulseUs <= 2000);
      total += s.holdMs;
    }
    assert(total == rangeDurationMs(offset) && total <= 7000);
    assert(rangeAngle(offset, 0) == 90 && rangeAngle(offset, 2) == 90 && rangeAngle(offset, 4) == 90);
    assert(rangeAngle(offset, 1) - 90 == offset && rangeAngle(offset, 3) - 90 == -offset);
  }
  assert(!validRangeOffset(0) && !validRangeOffset(120) && !validRangeOffset(-30));
  for (int servo = 0; servo < 2; ++servo) {
    uint32_t total = 0;
    bool seen60 = false, seen120 = false;
    for (int i = 0; i < count(servo); ++i) {
      const auto& s = step(servo, i);
      assert(s.pulseUs >= 1000 && s.pulseUs <= 2000);
      assert(s.nominalDegrees >= 60 && s.nominalDegrees <= 120);
      total += s.holdMs;
      if (s.nominalDegrees == 60) { seen60 = true; assert(s.holdMs >= 3000); }
      if (s.nominalDegrees == 120) { seen120 = true; assert(s.holdMs >= 3000); }
    }
    assert(total == durationMs(servo) && total <= 8000);
    assert(step(servo, 0).nominalDegrees == 90);
    assert(step(servo, count(servo)-1).nominalDegrees == 90);
    assert(seen60 && (servo == 0 ? seen120 : !seen120));
  }
}
