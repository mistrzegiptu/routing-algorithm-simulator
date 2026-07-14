import { BaseEdge, EdgeLabelRenderer, getStraightPath } from '@xyflow/react';
import './LinkEdge.css';

export default function LinkEdge({ id, sourceX, sourceY, targetX, targetY, data }) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  // Place each interface IP a little away from its node, along the link.
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const offset = 56;

  const src = { x: sourceX + ux * offset, y: sourceY + uy * offset };
  const tgt = { x: targetX - ux * offset, y: targetY - uy * offset };
  const mid = { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };

  const showIps = data?.showIps ?? true;
  const highlighted = data?.highlighted ?? false;
  const dimmed = data?.dimmed ?? false;
  const hovered = data?.hovered ?? false;

  const edgeClass = [
    'link-edge__path',
    highlighted ? 'link-edge__path--highlighted' : '',
    dimmed ? 'link-edge__path--dimmed' : '',
  ].filter(Boolean).join(' ');

  const handleDeleteClick = (e) => {
    // Keep the click from selecting the edge underneath.
    e.stopPropagation();
    data?.onRequestDelete?.(Number(id));
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} className={edgeClass} />
      <EdgeLabelRenderer>
        {showIps && data?.sourceCidr && (
          <div
            className="link-edge__ip"
            style={{ transform: `translate(-50%, -50%) translate(${src.x}px, ${src.y}px)` }}
          >
            {data.sourceCidr}
          </div>
        )}
        {showIps && data?.targetCidr && (
          <div
            className="link-edge__ip"
            style={{ transform: `translate(-50%, -50%) translate(${tgt.x}px, ${tgt.y}px)` }}
          >
            {data.targetCidr}
          </div>
        )}
        {data?.onRequestDelete && (
          <button
            type="button"
            className={`link-edge__delete ${hovered ? 'link-edge__delete--visible' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)` }}
            onClick={handleDeleteClick}
            onDoubleClick={(e) => e.stopPropagation()}
            title="Usuń połączenie"
            aria-label="Usuń połączenie"
          >
            <svg className="link-edge__delete-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
