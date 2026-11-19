#pragma once
#include <stdint.h>
#include "inlet_thresholds.h"

// Require a clear inlet after arming, then latch one trigger until clear again.
// Invalid echoes never count as an empty inlet. Timing uses unsigned rollover.
class InletDetector {
  float nearCm = InletThresholds::nearCm, clearCm = InletThresholds::clearCm;
  unsigned int nearCount = 0, clearCount = 0;
  bool ready = false, hasTriggered = false;
  uint32_t lastTrigger = 0;
public:
  bool configure(float near, float clear) {
    if (!(near >= 2 && near < clear && clear <= 400)) return false;
    nearCm = near; clearCm = clear; reset(); return true;
  }
  float nearThreshold() const { return nearCm; }
  float clearThreshold() const { return clearCm; }
  void reset() { nearCount = clearCount = 0; ready = hasTriggered = false; }
  bool waitingForClear() const { return !ready; }
  bool sample(bool valid, float cm, uint32_t now) {
    if (!valid) { nearCount = clearCount = 0; return false; }
    if (cm >= clearCm) {
      nearCount = 0;
      if (++clearCount >= 3) { ready = true; clearCount = 3; }
      return false;
    }
    clearCount = 0;
    if (cm > nearCm || !ready) { nearCount = 0; return false; }
    if (++nearCount < 3) return false;
    nearCount = 3;
    if (hasTriggered && uint32_t(now - lastTrigger) < 5000) return false;
    ready = false;
    nearCount = 0;
    lastTrigger = now;
    hasTriggered = true;
    return true;
  }
};
