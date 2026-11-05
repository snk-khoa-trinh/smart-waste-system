#include <assert.h>
#include "../common/station_indicator.h"
using namespace StationIndicator;
int main() {
  assert(choose("waiting_item", false, true) == Ready);
  assert(choose("waiting_item", false, false) == Network);
  assert(choose("waiting_camera", true, true) == Camera);
  assert(choose("off", true, true) == Fault);
  assert(choose("sorting", false, true) == Sorting);
  assert(choose("outcome_pending", true, true) == Reporting);
  assert(!level(Off, 0) && level(Ready, 3000));
  assert(level(Network, 0) && !level(Network, 120));
  assert(level(Network, 250) && !level(Network, 500));
  assert(level(Camera, 500) && !level(Camera, 750));
  assert(level(Camera, 3000));
  assert(level(Working, 0) && !level(Working, 125));
  assert(level(Sorting, 499) && !level(Sorting, 500));
}
