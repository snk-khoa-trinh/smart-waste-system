#include <assert.h>
#include "../common/drop_detector.h"
int main() {
  DropDetector d;
  assert(!d.configure(3, 2));
  assert(!d.configure(10.5f, 0.5f));
  assert(d.configure(10.5f, 2));
  assert(!d.sample(true, 6)); // Item present at startup is not a baseline.
  assert(!d.sample(true, 10.2f));
  assert(!d.sample(true, 10.5f));
  assert(!d.ready());
  assert(!d.sample(true, 10.4f));
  assert(d.ready());
  assert(!d.sample(true, 9)); // Small fluctuation does not trigger.
  assert(!d.sample(true, 20)); // Far spike cannot trigger or become baseline.
  assert(d.sample(true, 8)); // Single near sample: no debounce delay.
  assert(d.locked() && !d.ready());
  for (int i=0;i<10;++i) assert(!d.sample(true, 10.5f));
  assert(!d.sample(true, 5)); // Return to baseline cannot unlock during sorting.
  d.reset(); // Controller acknowledgement/new session, followed by fresh clear.
  assert(!d.sample(true, 8));
  for (int i=0;i<3;++i) assert(!d.sample(true, 10.5f));
  assert(d.ready());
  assert(!d.sample(false, 0));
  assert(!d.ready());
  assert(!d.sample(true, 5)); // Invalid echo is not a rearm.
}
