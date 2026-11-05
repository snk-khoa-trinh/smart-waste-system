#pragma once
// Copy to fill.local.h. Defaults deliberately leave GPIOs uninitialized.
// Confirm wiring before setting to 1. Standard HC-SR04 needs ECHO level shifting;
// HC-SR04P may use direct GPIO connections when powered from 3V3.
#define FILL_WIRING_CONFIRMED 0
#define FILL_TRIG_PIN -1
#define FILL_ECHO_PIN -1
// 0=recyclable, 1=non_recyclable, 2=e_waste. Select the physical compartment.
#define FILL_CATEGORY_INDEX 0
// Measure from the sensor face to the empty bottom and intended full surface.
// Zero means uncalibrated: raw distance is logged, but fullness stays invalid.
#define FILL_EMPTY_CM 0.0f
#define FILL_FULL_CM 0.0f
