#pragma once
#include <stdint.h>
#include <string.h>

// Pure timing logic: GPIO is driven from loop(), never from the motor timer.
namespace StationIndicator {
enum Pattern { Off, Ready, Clear, Network, Camera, Working, Sorting, Reporting, Fault };
inline Pattern choose(const char* stage, bool problem, bool wifi) {
  if (!wifi) return Network;
  if (!strcmp(stage, "waiting_camera") || !strcmp(stage, "enabling_inlet")) return Camera;
  if (!strcmp(stage, "outcome_pending")) return Reporting;
  if (problem) return Fault;
  if (!strcmp(stage, "waiting_item")) return Ready;
  if (!strcmp(stage, "waiting_clear")) return Clear;
  if (!strcmp(stage, "capturing") || !strcmp(stage, "classifying")) return Working;
  if (!strcmp(stage, "sorting")) return Sorting;
  return Off;
}
inline const char* name(Pattern pattern) {
  switch (pattern) {
    case Ready: return "ready-steady";
    case Clear: return "clear-1-flash";
    case Network: return "network-2-flashes";
    case Camera: return "camera-3-flashes";
    case Working: return "capture-inference-fast";
    case Sorting: return "sorting-slow";
    case Reporting: return "reporting-4-flashes";
    case Fault: return "error-6-flashes";
    default: return "off";
  }
}
inline bool level(Pattern pattern, uint32_t elapsed) {
  if (pattern == Ready) return true;
  if (pattern == Off) return false;
  if (pattern == Working) return elapsed % 250 < 125;
  if (pattern == Sorting) return elapsed % 1000 < 500;
  unsigned int pulses = pattern == Clear ? 1 : pattern == Network ? 2 : pattern == Camera ? 3 : pattern == Reporting ? 4 : 6;
  uint32_t phase = elapsed % 3000;
  return phase < pulses * 250 && phase % 250 < 120;
}
}
