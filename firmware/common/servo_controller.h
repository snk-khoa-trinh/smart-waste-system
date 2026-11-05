#pragma once
// Isolated actuator control. Sequence activity is separate from idle holding PWM.
#include <driver/ledc.h>
#include <esp_timer.h>
#include <freertos/semphr.h>
#include "servo_plan.h"
#ifndef BENCH_CLASSIFIER_GPIO
#define BENCH_CLASSIFIER_GPIO 12
#endif
#ifndef BENCH_OPENER_GPIO
#define BENCH_OPENER_GPIO 15
#endif

namespace ServoBench {
constexpr int pins[] = {BENCH_CLASSIFIER_GPIO, BENCH_OPENER_GPIO};
constexpr ledc_channel_t channels[] = {LEDC_CHANNEL_6, LEDC_CHANNEL_7};
SemaphoreHandle_t lock = nullptr;
esp_timer_handle_t deadline = nullptr;
bool available = false, active = false, timerReady = false;
bool initialized[] = {false, false};
uint32_t commandedUs[] = {0, 0};
int selected = -1, phase = -1;
unsigned int completed = 0;
uint32_t fixedPulse = 0;
int rangeOffset = 0;
bool sweeping = false, homingProfile = false, holdingHome = false;
int cycleRoute = -1;
String error;

bool pairedProfile() { return homingProfile || cycleRoute >= 0; }
int phaseCount() {
  return homingProfile ? ServoBenchPlan::homeCount : cycleRoute >= 0 ? ServoBenchPlan::cycleCount :
         sweeping ? ServoBenchPlan::sweepCount : rangeOffset ? 5 : fixedPulse ? 1 : ServoBenchPlan::count(selected);
}
ServoBenchPlan::Step currentStep() {
  return sweeping ? ServoBenchPlan::sweep[phase] : rangeOffset ? ServoBenchPlan::rangeStep(rangeOffset, phase) :
         fixedPulse ? ServoBenchPlan::fixed(fixedPulse) : ServoBenchPlan::step(selected, phase);
}
ServoBenchPlan::CycleStep currentPair() {
  return homingProfile ? ServoBenchPlan::homeStep(phase) : ServoBenchPlan::cycleStep(cycleRoute, phase);
}

bool writePulse(int index, uint32_t pulse) {
  if (!initialized[index]) return false;
  if (pulse == 0) {
    if (ledc_stop(LEDC_HIGH_SPEED_MODE, channels[index], 0) != ESP_OK) return false;
  } else if (ledc_set_duty(LEDC_HIGH_SPEED_MODE, channels[index], pulse * 65536UL / 20000UL) != ESP_OK ||
             ledc_update_duty(LEDC_HIGH_SPEED_MODE, channels[index]) != ESP_OK) return false;
  commandedUs[index] = pulse;
  return true;
}

void outputOff() {
  for (int i = 0; i < 2; ++i) {
    if (initialized[i]) ledc_stop(LEDC_HIGH_SPEED_MODE, channels[i], 0);
    commandedUs[i] = 0;
  }
  active = false;
  holdingHome = false;
}

bool applyStep() {
  if (pairedProfile()) {
    const auto step = currentPair();
    // Initial closure leaves classifier undriven until the flap has closed.
    return writePulse(0, step.classifierUs) && writePulse(1, step.openerUs) &&
           esp_timer_start_once(deadline, step.holdMs * 1000ULL) == ESP_OK;
  }
  const auto step = currentStep();
  return writePulse(selected, step.pulseUs) &&
         esp_timer_start_once(deadline, step.holdMs * 1000ULL) == ESP_OK;
}

// Dedicated timer task continues even if the Arduino/USB loop stalls.
void advance(void*) {
  xSemaphoreTake(lock, portMAX_DELAY);
  if (!active) { xSemaphoreGive(lock); return; }
  ++phase;
  if (phase >= phaseCount()) {
    if (pairedProfile()) {
      // Final phase already commanded home. Keep the exact duty active: no detach,
      // neutral pulse, channel reconfiguration, or extra position after completion.
      active = false;
      holdingHome = commandedUs[0] == ServoBenchPlan::classifierHomeUs &&
                    commandedUs[1] == ServoBenchPlan::openerClosedUs;
      if (!holdingHome) { error = "Final home commands missing"; outputOff(); }
    } else outputOff(); // Manual calibration keeps its bounded PWM-off behavior.
    if (!homingProfile && error.isEmpty()) ++completed;
  } else if (!applyStep()) {
    error = "PWM/timer failure; outputs stopped";
    outputOff();
  }
  xSemaphoreGive(lock);
}

void setup() {
  lock = xSemaphoreCreateMutex();
  if (!lock) { error = "Could not allocate bench lock"; return; }
  esp_timer_create_args_t args = {};
  args.callback = advance;
  args.dispatch_method = ESP_TIMER_TASK;
  args.name = "servo-bench";
  available = esp_timer_create(&args, &deadline) == ESP_OK;
  if (!available) error = "Could not allocate bench deadline timer";
  // Shared camera bench remains motionless until its explicit command.
  // The DevKit setup explicitly requests startup homing after this call.
}

bool configureChannel(int index) {
  if (initialized[index]) return true; // Preserve idle holding duty between commands.
  ledc_channel_config_t channel = {};
  channel.gpio_num = pins[index];
  channel.speed_mode = LEDC_HIGH_SPEED_MODE;
  channel.channel = channels[index];
  channel.intr_type = LEDC_INTR_DISABLE;
  channel.timer_sel = LEDC_TIMER_2;
  channel.duty = 0;
  if (ledc_channel_config(&channel) != ESP_OK) return false;
  initialized[index] = true;
  return true;
}

bool start(int servo, uint32_t diagnosticPulse = 0, int offset = 0, bool sweep = false,
           int route = -1, bool home = false) {
  if (!available || servo < 0 || servo > 1 ||
      (diagnosticPulse && !ServoBenchPlan::validFixedPulse(diagnosticPulse)) ||
      (offset && !ServoBenchPlan::validRangeOffset(offset)) || (offset && diagnosticPulse) ||
      (sweep && (offset || diagnosticPulse || servo != 0)) || route < -1 || route > 1 ||
      (route >= 0 && (servo != 0 || diagnosticPulse || offset || sweep || home)) ||
      (home && (servo != 0 || diagnosticPulse || offset || sweep))) return false;
  xSemaphoreTake(lock, portMAX_DELAY);
  if (active) { xSemaphoreGive(lock); return false; }
  if (!timerReady) {
    ledc_timer_config_t timer = {};
    timer.speed_mode = LEDC_HIGH_SPEED_MODE;
    timer.duty_resolution = LEDC_TIMER_16_BIT;
    timer.timer_num = LEDC_TIMER_2; // Separate from camera XCLK timer0/channel0.
    timer.freq_hz = 50;
    timer.clk_cfg = LEDC_AUTO_CLK;
    if (ledc_timer_config(&timer) != ESP_OK) {
      error = "Could not configure servo PWM timer";
      xSemaphoreGive(lock); return false;
    }
    timerReady = true;
  }
  bool paired = route >= 0 || home;
  for (int i = paired ? 0 : servo; i <= (paired ? 1 : servo); ++i) {
    if (!configureChannel(i)) {
      error = "Could not configure servo channel";
      outputOff(); xSemaphoreGive(lock); return false;
    }
  }
  selected = servo;
  fixedPulse = diagnosticPulse;
  rangeOffset = offset;
  sweeping = sweep;
  cycleRoute = route;
  homingProfile = home;
  holdingHome = false;
  phase = 0;
  error = "";
  active = true;
  if (!applyStep()) { error = "Could not start bounded servo sequence"; outputOff(); }
  bool started = active;
  xSemaphoreGive(lock);
  return started;
}

void stop() {
  if (!available) return;
  xSemaphoreTake(lock, portMAX_DELAY);
  esp_timer_stop(deadline);
  outputOff();
  xSemaphoreGive(lock);
}

void status(JsonDocument& body) {
  if (lock) xSemaphoreTake(lock, portMAX_DELAY);
  body["servo_bench_available"] = available;
  body["sorting_cycle_supported"] = true;
  body["classifier_home_us"] = ServoBenchPlan::classifierHomeUs;
  body["classifier_side_us"] = ServoBenchPlan::classifierSideUs;
  body["opener_closed_us"] = ServoBenchPlan::openerClosedUs;
  body["opener_open_us"] = ServoBenchPlan::openerOpenUs;
  body["classifier_command_us"] = commandedUs[0];
  body["opener_command_us"] = commandedUs[1];
  body["servo_holding_home"] = holdingHome;
  body["servo_bench_active"] = active;
  body["automatic_sorting_enabled"] = false;
  body["actuators_enabled"] = commandedUs[0] != 0 || commandedUs[1] != 0;
  body["servo_bench_selected"] = selected < 0 ? "none" : selected == 0 ? "classifier" : "opener";
  body["servo_bench_phase"] = phase;
  body["servo_angles_calibrated"] = false;
  body["servo_bench_total_ms"] = homingProfile ? ServoBenchPlan::homeDurationMs : selected < 0 ? 0 :
    cycleRoute >= 0 ? ServoBenchPlan::cycleDurationMs : sweeping ? ServoBenchPlan::sweepDurationMs :
    rangeOffset ? ServoBenchPlan::rangeDurationMs(rangeOffset) :
    fixedPulse ? ServoBenchPlan::fixed(fixedPulse).holdMs : ServoBenchPlan::durationMs(selected);
  body["servo_bench_profile"] = homingProfile ? "startup-home" : cycleRoute >= 0 ? "sorting-cycle" :
    sweeping ? "endpoint-sweep" : rangeOffset ? "center-range" : fixedPulse ? "fixed-pulse" : "nominal-positions";
  body["sorting_route"] = cycleRoute < 0 ? "none" : cycleRoute == 0 ? "home" : "side";
  body["servo_bench_range_offset"] = rangeOffset;
  if (active && pairedProfile()) {
    const auto step = currentPair();
    body["classifier_pulse_us"] = step.classifierUs;
    body["opener_pulse_us"] = step.openerUs;
    body["servo_bench_hold_ms"] = step.holdMs;
  } else if (active && selected >= 0 && phase >= 0 && phase < phaseCount()) {
    const auto step = currentStep();
    body["servo_bench_nominal_degrees"] = step.nominalDegrees;
    body["servo_bench_pulse_us"] = step.pulseUs;
    body["servo_bench_hold_ms"] = step.holdMs;
    if (rangeOffset) body["servo_bench_center_offset"] = step.nominalDegrees - 90;
  }
  body["servo_bench_completed"] = completed;
  body["servo_bench_error"] = error;
  body["classifier_gpio"] = pins[0];
  body["opener_gpio"] = pins[1];
  if (lock) xSemaphoreGive(lock);
}
}
