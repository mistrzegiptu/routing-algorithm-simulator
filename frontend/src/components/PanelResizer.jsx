import "./PanelResizer.css";

export default function PanelResizer(handleProps) {
  return (
    <div
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      title="Przeciągnij, aby zmienić szerokość (dwuklik przywraca domyślną)"
      {...handleProps}
    />
  );
}
