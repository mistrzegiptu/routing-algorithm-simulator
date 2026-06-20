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

  const showIps = data?.showIps ?? true;

  return (
    <>
      <BaseEdge id={id} path={edgePath} className="link-edge__path" />
      <EdgeLabelRenderer>
        {showIps && data?.sourceCidr && (
          <div
            className="link-edge__ip nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${src.x}px, ${src.y}px)` }}
          >
            {data.sourceCidr}
          </div>
        )}
        {showIps && data?.targetCidr && (
          <div
            className="link-edge__ip nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${tgt.x}px, ${tgt.y}px)` }}
          >
            {data.targetCidr}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
