"""Run one bounded servo identification sequence over DevKit USB (no network)."""

import argparse
import json
import time

import serial


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=[
            "status",
            "test",
            "hold",
            "range",
            "sweep",
            "cycle",
            "stop",
            "auto-on",
            "auto-off",
            "auto-once",
        ],
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Observe one autonomous item after auto-once",
    )
    parser.add_argument("--route", choices=["home", "side"])
    parser.add_argument("--servo", choices=["classifier", "opener"])
    parser.add_argument(
        "--pulse-us",
        type=int,
        default=1500,
    )
    parser.add_argument("--offset-deg", type=int, choices=[30, 60, 90, 120], default=30)
    parser.add_argument(
        "--port",
        default="/dev/serial/by-id/usb-Silicon_Labs_CP2102_USB_to_UART_Bridge_Controller_0001-if00-port0",
    )
    parser.add_argument("--wiring-confirmed", action="store_true")
    parser.add_argument("--clearance-confirmed", action="store_true")
    args = parser.parse_args()
    if args.command in {"test", "hold", "range", "sweep"} and not (
        args.servo and args.wiring_confirmed and args.clearance_confirmed
    ):
        parser.error(
            "Test requires --servo, --wiring-confirmed and --clearance-confirmed"
        )
    if args.command == "range" and args.offset_deg == 120:
        parser.error(
            "+/-120 requires pulses outside the unverified 1000..2000us envelope. "
            "No movement commanded; use the validated smaller range for prototype routing."
        )
    if args.command == "sweep" and args.servo != "classifier":
        parser.error("Sweep is available only for the classifier on GPIO27")
    if args.command == "cycle" and not (
        args.route and args.wiring_confirmed and args.clearance_confirmed
    ):
        parser.error(
            "Cycle requires --route, --wiring-confirmed and --clearance-confirmed"
        )
    if (
        args.command == "hold"
        and args.servo == "opener"
        and not 700 <= args.pulse_us <= 2000
    ):
        parser.error("Opener --pulse-us must be between 700 and 2000")
    if (
        args.command == "hold"
        and args.servo == "classifier"
        and not 500 <= args.pulse_us <= 2500
    ):
        parser.error("Classifier --pulse-us must be between 500 and 2500")
    if args.command in {"auto-on", "auto-once"} and not (
        args.wiring_confirmed and args.clearance_confirmed
    ):
        parser.error("Auto mode requires confirmed wiring and mechanism clearance")
    if args.watch and args.command != "auto-once":
        parser.error("--watch is supported only with auto-once")
    port = serial.Serial(port=None, baudrate=115200, timeout=0.15)
    port.dtr = False
    port.rts = False
    port.port = args.port
    port.open()
    try:
        serial_buffer = bytearray()

        def read_line():
            chunk = port.read_until(b"\n")
            serial_buffer.extend(chunk)
            if len(serial_buffer) > 8192:
                serial_buffer.clear()
                return ""
            if not serial_buffer.endswith(b"\n"):
                return ""
            line = serial_buffer.decode(errors="replace").strip()
            serial_buffer.clear()
            return line

        # Opening CP2102 can reset the DevKit. Locate the bench before any motion.
        latest = None
        # USB open may reset the board. Allow boot output, network setup and
        # the two-second startup homing sequence to finish before identification.
        deadline = time.monotonic() + 15
        next_probe = 0
        while time.monotonic() < deadline:
            if time.monotonic() >= next_probe:
                port.write(b"status\n")
                next_probe = time.monotonic() + 0.7
            line = read_line()
            if line.startswith("{"):
                try:
                    body = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if body.get("mode") == "usb-servo-bench":
                    if (
                        body.get("servo_bench_active")
                        and body.get("servo_bench_profile") == "startup-home"
                    ):
                        continue
                    latest = body
                    break
        if latest is None:
            raise SystemExit("USB servo bench not detected. No motion command sent.")
        if args.command == "status":
            print(json.dumps(latest, indent=2))
            return
        if args.command in {"auto-on", "auto-off", "auto-once"} and not latest.get(
            "automatic_supported"
        ):
            raise SystemExit(
                "Combined station firmware is required; no auto command sent"
            )
        if args.command in {"test", "hold", "range", "sweep", "cycle"} and (
            latest.get("automatic_enabled")
            or latest.get("automatic_busy")
            or latest.get("automatic_outcome_pending")
        ):
            raise SystemExit(
                "Disable auto mode and wait for current outcome before manual motion"
            )
        if args.command == "cycle" and not latest.get("sorting_cycle_supported"):
            raise SystemExit(
                "Installed firmware does not support sorting cycles; no motion sent."
            )
        if args.command in {"test", "hold", "range", "sweep", "cycle"} and (
            latest["servo_bench_active"] or not latest["servo_bench_available"]
        ):
            raise SystemExit("Bench unavailable or busy; no motion command sent.")
        completed_before = latest["servo_bench_completed"]
        command = f"test {args.servo}" if args.command == "test" else "stop"
        if args.command == "hold":
            command = f"hold {args.servo} {args.pulse_us}"
        elif args.command == "range":
            command = f"range {args.servo} {args.offset_deg}"
        elif args.command == "sweep":
            command = "sweep classifier"
        elif args.command == "cycle":
            command = f"cycle {args.route}"
        elif args.command.startswith("auto-"):
            command = (
                "auto "
                + {"auto-on": "on", "auto-off": "off", "auto-once": "once"}[
                    args.command
                ]
            )
        # Exactly one motion command; never replay an ambiguous test.
        port.write((command + "\n").encode())
        port.flush()
        print(f"Sent once: {command}", flush=True)
        deadline = time.monotonic() + (600 if args.watch else 18)
        auto_event_before = latest.get("automatic_event_id")
        last_auto_stage = None
        next_probe = time.monotonic() + 0.4
        last_phase = None
        while time.monotonic() < deadline:
            if time.monotonic() >= next_probe:
                port.write(b"status\n")
                next_probe = time.monotonic() + 0.5
            line = read_line()
            if not line:
                continue
            if not line.startswith("{"):
                print(line, flush=True)
                continue
            try:
                body = json.loads(line)
            except json.JSONDecodeError:
                continue
            if body.get("mode") != "usb-servo-bench":
                continue
            if (
                body.get("servo_bench_active")
                and body.get("servo_bench_phase") != last_phase
            ):
                last_phase = body["servo_bench_phase"]
                if body.get("servo_bench_profile") == "sorting-cycle":
                    classifier_us = body.get("classifier_pulse_us")
                    classifier_target = (
                        "PWM off" if classifier_us == 0 else f"{classifier_us} us"
                    )
                    print(
                        f"Cycle phase {last_phase}: classifier {classifier_target}, "
                        f"opener {body.get('opener_pulse_us')} us; hold {body.get('servo_bench_hold_ms')} ms",
                        flush=True,
                    )
                    continue
                angle = body.get("servo_bench_nominal_degrees")
                target = (
                    f"nominal {angle} degrees, "
                    if isinstance(angle, int) and angle >= 0
                    else "fixed pulse, "
                )
                if body.get("servo_bench_profile") == "center-range":
                    target = f"nominal center offset {body.get('servo_bench_center_offset'):+d} degrees, "
                print(
                    f"Phase {last_phase}: {target}"
                    f"{body.get('servo_bench_pulse_us')} us; hold {body.get('servo_bench_hold_ms')} ms",
                    flush=True,
                )
            if args.command.startswith("auto-"):
                expected = args.command != "auto-off"
                if args.watch:
                    stage = (body.get("automatic_stage"), body.get("inlet_ready"))
                    if stage != last_auto_stage:
                        last_auto_stage = stage
                        print(
                            f"AUTO {stage[0]}: ready={stage[1]}, distance={body.get('inlet_distance_cm')} cm; "
                            f"{body.get('automatic_error', '')}",
                            flush=True,
                        )
                    if (
                        body.get("automatic_stage") == "off"
                        and body.get("automatic_error")
                        and not body.get("automatic_enabled")
                        and not body.get("automatic_busy")
                        and not body.get("automatic_outcome_pending")
                    ):
                        raise SystemExit(
                            f"Autonomous test stopped: {body['automatic_error']}"
                        )
                    new_event = body.get("automatic_event_id") not in (
                        None,
                        "",
                        auto_event_before,
                    )
                    if (
                        new_event
                        and not body.get("automatic_enabled")
                        and not body.get("automatic_busy")
                        and not body.get("automatic_outcome_pending")
                        and body.get("automatic_stage") == "off"
                        and body.get("automatic_last_outcome")
                        in {"completed", "disabled", "failed"}
                    ):
                        print(json.dumps(body, indent=2), flush=True)
                        print(
                            "One autonomous item finished; USB observed status only after arming."
                        )
                        return
                elif body.get("automatic_enabled") == expected:
                    print(json.dumps(body, indent=2), flush=True)
                    print("Auto mode updated. No motion command is replayed.")
                    return
            if (
                not args.command.startswith("auto-")
                and not body["servo_bench_active"]
                and (
                    args.command == "stop"
                    or body["servo_bench_completed"] == completed_before + 1
                )
            ):
                print(json.dumps(body, indent=2), flush=True)
                if args.command == "cycle" and not (
                    body.get("servo_holding_home")
                    and body.get("classifier_command_us")
                    == body.get("classifier_home_us")
                    and body.get("opener_command_us") == body.get("opener_closed_us")
                ):
                    raise SystemExit(
                        "Cycle finished without verified home holding commands"
                    )
                print(
                    "PASS: sequence complete; holding classifier home and opener closed."
                    if body.get("servo_holding_home")
                    else "PASS: control sequence ended with PWM off. Servo type requires visual observation."
                )
                return
            if body.get("servo_bench_error"):
                raise SystemExit(f"Bench failed: {body['servo_bench_error']}")
        raise SystemExit(
            "Completion not confirmed; no automatic retry. Cut servo power if it keeps moving."
        )
    finally:
        try:
            port.dtr = False
            port.rts = False
        except OSError:
            pass
        port.close()


if __name__ == "__main__":
    try:
        main()
    except (serial.SerialException, OSError, ValueError) as exc:
        raise SystemExit(f"USB bench failed: {exc}") from None
