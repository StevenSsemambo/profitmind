export default function InsightSection({ icon: Icon, color, title, action, children }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h4 className="text-xs uppercase tracking-wide flex items-center gap-1.5" style={{ color }}>
          <Icon size={13} /> {title}
        </h4>
        {action}
      </div>
      {children}
    </div>
  );
}
