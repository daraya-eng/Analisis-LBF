interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
      }}
    >
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0 }}>{title}</h2>
        {subtitle && (
          <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
