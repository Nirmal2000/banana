'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const ImageNode = ({ data }) => {
  return (
    <div className="image-node">
      <div className="image-wrap">
        {data.isLoading ? (
          <div className="image-skeleton" aria-label="Loading image">
            <div className="w-6 h-6 border-2 border-neutral-500/70 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <img
            src={
              data.imageUrl ||
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
            }
            alt="thumbnail"
          />
        )}
      </div>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default memo(ImageNode);
