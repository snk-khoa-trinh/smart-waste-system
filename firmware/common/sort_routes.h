#pragma once
#include <string.h>
// Prototype has two calibrated positions; other categories do not actuate.
inline int prototypeRoute(const char* category) {
  return !strcmp(category, "recyclable") ? 0 : !strcmp(category, "e_waste") ? 1 : -1;
}
