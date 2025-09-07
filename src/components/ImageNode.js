'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const ImageNode = ({ data }) => {
  return (
    <div
      style={{
        padding: 10,
        border: '1px solid #666',
        borderRadius: 5,
        background: '#333',
        color: '#fff',
        textAlign: 'center',
        opacity: data.isLoading ? 0.7 : 1,
      }}
    >
      <h4 style={{ margin: 0, marginBottom: 5 }}>{data.title || 'Image Node'}</h4>
      {data.isLoading ? (
        <div style={{
          width: 80,
          height: 80,
          background: '#555',
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
        }}>
          Generating...
        </div>
      ) : (
        <img
          src={data.imageUrl || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='} // 1x1 transparent pixel
          alt="thumbnail"
          style={{
            width: 80,
            height: 80,
            objectFit: 'cover',
            borderRadius: 3,
          }}
        />
      )}
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default memo(ImageNode);