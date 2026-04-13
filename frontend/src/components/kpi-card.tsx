interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: string;
  trendUp?: boolean;
  icon?: React.ReactNode;
  color?: string;
}

export default function KpiCard({
  title,
  value,
  subtitle,
  trend,
  trendUp,
  icon,
  color = "#3B82F6",
}: KpiCardProps) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 12,
        padding: "20px 24px",
        border: "1px solid #E2E8F0",
        flex: "1 1 0",
        minWidth: 200,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Accent top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: color,
          borderRadius: "12px 12px 0 0",
        }}
      />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#64748B", marginBottom: 8 }}>
            {title}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#0F172A", lineHeight: 1.1 }}>
            {value}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 6 }}>
              {subtitle}
            </div>
          )}
          {trend && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginTop: 8,
                padding: "2px 8px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                background: trendUp ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                color: trendUp ? "#059669" : "#DC2626",
              }}
            >
              {trendUp ? "↑" : "↓"} {trend}
            </div>
          )}
        </div>
        {icon && (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: `${color}15`,
              color: color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
