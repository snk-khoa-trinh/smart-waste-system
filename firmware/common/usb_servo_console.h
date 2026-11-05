#pragma once
// Caller provides status(), plus optional station control hooks.
void usbServoConsoleLoop() {
  static char line[40];
  static size_t length = 0;
  static bool invalid = false;
  while (Serial.available()) {
    int ch = Serial.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      line[length] = '\0';
      if (invalid) Serial.println("ERROR invalid command; no test started");
      else if (!strcmp(line, "status")) status();
      else if (!strcmp(line, "stop")) {
#ifdef STATION_CONTROLLER
        stationStop();
#endif
        ServoBench::stop(); status();
      }
#ifdef STATION_CONTROLLER
      else if (stationCommand(line)) {}
      else if (stationMotionBlocked()) Serial.println("ERROR disable auto mode and wait for current cycle before manual motion");
#endif
      else if (!strcmp(line, "cycle home") || !strcmp(line, "cycle side")) {
        int route = !strcmp(line, "cycle home") ? 0 : 1;
        if (!ServoBench::start(0, 0, 0, false, route)) Serial.println("ERROR cycle unavailable or busy");
        else Serial.println("CYCLE START: close, home, position, open, close, return home, KEEP HOME PWM");
        status();
      } else if (!strcmp(line, "sweep classifier")) {
        if (!ServoBench::start(0, 0, 0, true)) Serial.println("ERROR bench unavailable or busy");
        else Serial.println("SWEEP: nominal 0,30,60,120,150,180, then center and PWM off; NOT measured angles");
        status();
      } else if (!strcmp(line, "test classifier") || !strcmp(line, "test opener")) {
        int servo = !strcmp(line, "test classifier") ? 0 : 1;
        if (!ServoBench::start(servo)) Serial.println("ERROR test unavailable or busy");
        else if (servo == 0) Serial.println("TEST START: nominal90 (1s), 60 (3s), 120 (3s), 90 (1s), PWM off");
        else Serial.println("TEST START: nominal90 (1s), 60 (3s), 90 (1s), PWM off");
        status();
      } else if (!strncmp(line, "hold ", 5)) {
        char name[12], extra;
        unsigned int pulse = 0;
        int parsed = sscanf(line, "hold %11s %u %c", name, &pulse, &extra);
        int servo = parsed == 2 && !strcmp(name, "classifier") ? 0 :
                    parsed == 2 && !strcmp(name, "opener") ? 1 : -1;
        if (servo < 0 || !ServoBenchPlan::validFixedPulse(pulse)) Serial.println("ERROR hold requires classifier/opener and 700..2000us");
        else if (!ServoBench::start(servo, pulse)) Serial.println("ERROR bench unavailable or busy");
        else Serial.printf("FIXED HOLD START: %s, constant %uus for %ums, then PWM off\n", name, pulse, static_cast<unsigned int>(ServoBenchPlan::fixed(pulse).holdMs));
        status();
      } else if (!strncmp(line, "range ", 6)) {
        char name[12], extra;
        int offset = 0;
        int parsed = sscanf(line, "range %11s %d %c", name, &offset, &extra);
        int servo = parsed == 2 && !strcmp(name, "classifier") ? 0 :
                    parsed == 2 && !strcmp(name, "opener") ? 1 : -1;
        if (servo < 0 || !ServoBenchPlan::validRangeOffset(offset)) Serial.println("ERROR range allows only 30/60/90; +/-120 exceeds unverified pulse envelope");
        else if (!ServoBench::start(servo, 0, offset)) Serial.println("ERROR bench unavailable or busy");
        else Serial.printf("RANGE START: %s center, +%d, center, -%d, center, PWM off; nominal offsets only\n", name, offset, offset);
        status();
      } else if (length) Serial.println("ERROR unknown command; no test started");
      length = 0;
      invalid = false;
    } else if (ch >= 32 && ch <= 126 && length < sizeof(line) - 1) {
      line[length++] = static_cast<char>(ch);
    } else invalid = true;
  }
  delay(5);
}
