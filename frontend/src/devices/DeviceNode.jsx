import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import routerImg from '../../images/router.png';
import computerImg from '../../images/computer.png';
import { deviceCidr } from '../utils/format.js';
import './DeviceNode.css';

const DEVICE_IMAGES = {
  router: routerImg,
  computer: computerImg,
};

function DeviceNode({ data }) {
  const { device, linking, isSource, showIp = true, onRequestDelete } = data;
  const imageSrc = DEVICE_IMAGES[device.type] || routerImg;

  const handleDeleteClick = (e) => {
    // Keep the click from selecting/dragging the node underneath.
    e.stopPropagation();
    onRequestDelete?.(device.id);
  };

  // A computer has a single NIC: surface its IP right under the name.
  const computerCidr =
    showIp && device.type === 'computer' ? deviceCidr(device, 0) : null;

  const className = [
    'device-node',
    `device-node--${device.type}`,
    linking ? 'device-node--linking' : '',
    isSource ? 'device-node--source' : '',
  ].join(' ');

  return (
    <div className={className} title="Kliknij dwukrotnie, aby skonfigurować">
      <Handle type="target" position={Position.Top} className="device-node__handle" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className="device-node__handle" isConnectable={false} />

      <div className="device-node__icon-wrap">
        <img className="device-node__icon" src={imageSrc} alt={device.type} draggable={false} />
        {!linking && onRequestDelete && (
          <button
            type="button"
            className="device-node__delete"
            onClick={handleDeleteClick}
            onDoubleClick={(e) => e.stopPropagation()}
            title="Usuń urządzenie"
            aria-label="Usuń urządzenie"
          >
            <svg className="device-node__delete-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="device-node__name">
        {device.name || `${device.type}_${device.id}`}
      </div>

      {computerCidr && (
        <div className="device-node__ip">{computerCidr}</div>
      )}
    </div>
  );
}

export default memo(DeviceNode);
