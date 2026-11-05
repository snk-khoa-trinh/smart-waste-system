import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartReadings, labels } from "@/api";
import type { Reading, Station } from "@/api";
import { categories, date, useAPI } from "@/lib/dashboard";
export function FillHistory({ station }: { station: Station }) {
  const readings = useAPI<Reading[]>(`/stations/${station.id}/telemetry`);
  const chart = chartReadings(readings.data || []);
  return (
    <article className="card">
      <div className="card-title">
        <h3>Fill history</h3>
        <span>Last 180 readings</span>
      </div>
      {readings.isError ? (
        <p role="alert" className="error">
          {readings.error.message}
        </p>
      ) : !chart.length ? (
        <p className="empty">
          {readings.isPending
            ? "Loading history…"
            : "Waiting for telemetry from this station."}
        </p>
      ) : (
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart}>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) =>
                  new Date(v).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
              />
              <YAxis domain={[0, 100]} unit="%" width={42} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  borderColor: "var(--border)",
                  borderRadius: "var(--radius)",
                }}
                labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
              />
              {categories.map((c, i) => (
                <Line
                  key={c}
                  name={labels[c]}
                  dataKey={c}
                  stroke={
                    ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"][i]
                  }
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="reading-times">
        {station.compartments.map((c) => (
          <p key={c.category}>
            <strong>{labels[c.category]}</strong> {date(c.measured_at)} ·{" "}
            {c.quality}
            {c.stale ? " · stale" : ""}
          </p>
        ))}
      </div>
    </article>
  );
}
