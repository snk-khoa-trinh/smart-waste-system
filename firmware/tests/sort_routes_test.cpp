#include <assert.h>
#include "../common/sort_routes.h"
int main() {
  assert(prototypeRoute("recyclable") == 0);
  assert(prototypeRoute("e_waste") == 1);
  assert(prototypeRoute("non_recyclable") == -1);
  assert(prototypeRoute("unknown") == -1);
}
