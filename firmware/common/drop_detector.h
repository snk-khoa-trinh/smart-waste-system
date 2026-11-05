#pragma once
#include <stdint.h>
#include <math.h>

// Fixed empty baseline: three baseline readings arm; ONE nearer reading latches.
// Remains locked through capture/sorting, even after the item leaves the beam.
class DropDetector {
  float baseline = 10.5f, change = 2.0f, tolerance = 1.0f;
  unsigned int clearCount = 0;
  bool armed = false, latched = false;
public:
  bool configure(float emptyCm, float deltaCm) {
    if (!(emptyCm >= 4 && emptyCm <= 400 && deltaCm >= 1 && deltaCm <= emptyCm - 2)) return false;
    baseline = emptyCm; change = deltaCm; reset(); return true;
  }
  void reset() { clearCount = 0; armed = latched = false; }
  bool ready() const { return armed && !latched; }
  bool locked() const { return latched; }
  float baselineCm() const { return baseline; }
  float deltaCm() const { return change; }
  bool sample(bool valid, float cm) {
    if (latched) return false;
    if (!valid) { clearCount = 0; armed = false; return false; }
    if (fabsf(cm - baseline) <= tolerance) {
      if (++clearCount >= 3) { clearCount = 3; armed = true; }
      return false;
    }
    clearCount = 0;
    if (armed && cm <= baseline - change) {
      armed = false; latched = true; return true;
    }
    // Far-wall echoes do not count as empty, but cannot erase an armed baseline.
    return false;
  }
};
