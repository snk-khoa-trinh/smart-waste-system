#include <assert.h>
#include "../common/inlet_detector.h"

static void clear(InletDetector& d, uint32_t t) {
  assert(!d.sample(true, 30, t));
  assert(!d.sample(true, 30, t + 100));
  assert(!d.sample(true, 30, t + 200));
}
static bool approach(InletDetector& d, uint32_t t) {
  assert(!d.sample(true, 8, t));
  assert(!d.sample(true, 8, t + 100));
  return d.sample(true, 8, t + 200);
}
int main() {
  InletDetector d;
  assert(!approach(d, 0)); // An item held at boot/arm must be removed first.
  clear(d, 300);
  assert(approach(d, 600));
  assert(!approach(d, 1000)); // Held object cannot retrigger.
  for (int i = 0; i < 4; ++i) assert(!d.sample(false, 0, 6000 + i * 100));
  assert(!approach(d, 6500)); // Missing echo did not rearm.
  clear(d, 7000);
  assert(!d.sample(true, 8, 7400));
  assert(!d.sample(true, 15.5f, 7500)); // Hysteresis band breaks near streak.
  assert(approach(d, 7600));
  clear(d, 8000);
  assert(!approach(d, 8400)); // Cooldown.
  assert(d.sample(true, 8, 13000));
  assert(!d.configure(20, 10));
  assert(d.configure(15, 16));
  assert(!d.sample(true, 16.3f, 15000));
  assert(!d.sample(true, 16.3f, 15100));
  assert(!d.sample(true, 16.3f, 15200));
  assert(!d.sample(true, 12.9f, 15400));
  assert(!d.sample(true, 14.6f, 15500));
  assert(d.sample(true, 12.9f, 15600)); // Mounted item is beyond old 12cm threshold.
  d.reset();
  clear(d, 0xfffff000u);
  assert(approach(d, 0xfffff200u));
  clear(d, 0xfffff500u);
  assert(approach(d, 0x1000u)); // Timer rollover.
}
