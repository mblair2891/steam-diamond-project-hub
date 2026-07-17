'use client';

import { useEffect, useRef } from 'react';
import { Group, Rect, Circle, Ellipse, Text, Line, Transformer } from 'react-konva';
import type Konva from 'konva';
import { getCatalogItem } from '@/lib/floorplan-catalog';
import type { FloorPlanPlacedItem } from '@/lib/types';

interface PlacedItemNodeProps {
  item: FloorPlanPlacedItem;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onChange: (next: Partial<FloorPlanPlacedItem>) => void;
  onDragEnd: (x: number, y: number) => void;
}

export default function PlacedItemNode({
  item,
  selected,
  draggable,
  onSelect,
  onChange,
  onDragEnd
}: PlacedItemNodeProps) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const catalog = getCatalogItem(item.typeId);
  const color = catalog?.color || 'rgba(232,184,74,0.35)';
  const stroke = catalog?.stroke || '#e8b84a';
  const shape = catalog?.shape || 'round-rect';
  const w = item.width;
  const h = item.height;

  useEffect(() => {
    if (!selected || !trRef.current || !groupRef.current) return;
    trRef.current.nodes([groupRef.current]);
    trRef.current.getLayer()?.batchDraw();
  }, [selected]);

  const body = (() => {
    switch (shape) {
      case 'circle':
        return (
          <Circle
            x={w / 2}
            y={h / 2}
            radius={Math.min(w, h) / 2}
            fill={color}
            stroke={stroke}
            strokeWidth={2}
          />
        );
      case 'ellipse':
        return (
          <Ellipse
            x={w / 2}
            y={h / 2}
            radiusX={w / 2}
            radiusY={h / 2}
            fill={color}
            stroke={stroke}
            strokeWidth={2}
          />
        );
      case 'stool':
        return (
          <>
            <Circle
              x={w / 2}
              y={h / 2}
              radius={Math.min(w, h) / 2}
              fill={color}
              stroke={stroke}
              strokeWidth={2}
            />
            <Circle
              x={w / 2}
              y={h / 2}
              radius={Math.min(w, h) / 4}
              fill="transparent"
              stroke={stroke}
              strokeWidth={1.5}
            />
          </>
        );
      case 'plant':
        return (
          <>
            <Circle
              x={w / 2}
              y={h / 2}
              radius={Math.min(w, h) / 2}
              fill={color}
              stroke={stroke}
              strokeWidth={2}
            />
            <Text
              text="❀"
              width={w}
              height={h}
              align="center"
              verticalAlign="middle"
              fontSize={Math.min(w, h) * 0.45}
            />
          </>
        );
      case 'sink':
        return (
          <>
            <Rect width={w} height={h} fill={color} stroke={stroke} strokeWidth={2} cornerRadius={4} />
            <Rect
              x={w * 0.15}
              y={h * 0.2}
              width={w * 0.7}
              height={h * 0.55}
              fill="rgba(15,17,21,0.35)"
              stroke={stroke}
              strokeWidth={1}
              cornerRadius={3}
            />
          </>
        );
      case 'hood':
        return (
          <>
            <Rect width={w} height={h} fill={color} stroke={stroke} strokeWidth={2} cornerRadius={2} />
            <Line
              points={[w * 0.1, h * 0.35, w * 0.9, h * 0.35]}
              stroke={stroke}
              strokeWidth={2}
            />
            <Line
              points={[w * 0.1, h * 0.55, w * 0.9, h * 0.55]}
              stroke={stroke}
              strokeWidth={1.5}
            />
          </>
        );
      case 'booth':
        return (
          <>
            <Rect width={w} height={h * 0.55} y={h * 0.45} fill={color} stroke={stroke} strokeWidth={2} cornerRadius={4} />
            <Rect
              width={w}
              height={h * 0.35}
              fill={color}
              stroke={stroke}
              strokeWidth={2}
              cornerRadius={[8, 8, 0, 0]}
            />
          </>
        );
      case 'counter':
        return (
          <Rect width={w} height={h} fill={color} stroke={stroke} strokeWidth={2.5} cornerRadius={3} />
        );
      case 'partition':
        return <Rect width={w} height={h} fill={color} stroke={stroke} strokeWidth={2} />;
      case 'stage':
        return (
          <>
            <Rect width={w} height={h} fill={color} stroke={stroke} strokeWidth={2} cornerRadius={2} />
            <Line points={[0, h * 0.7, w, h * 0.7]} stroke={stroke} strokeWidth={1.5} dash={[4, 4]} />
          </>
        );
      case 'restroom':
        return (
          <>
            <Rect width={w} height={h} fill={color} stroke={stroke} strokeWidth={2} cornerRadius={4} />
            <Text
              text="WC"
              width={w}
              height={h}
              align="center"
              verticalAlign="middle"
              fontSize={Math.min(16, w * 0.3)}
              fontStyle="bold"
              fill="#eef1f6"
            />
          </>
        );
      case 'pos':
        return (
          <>
            <Rect width={w} height={h} fill={color} stroke={stroke} strokeWidth={2} cornerRadius={4} />
            <Rect
              x={w * 0.2}
              y={h * 0.15}
              width={w * 0.6}
              height={h * 0.45}
              fill="rgba(15,17,21,0.4)"
              stroke={stroke}
              strokeWidth={1}
            />
          </>
        );
      case 'l-shape':
        return (
          <>
            <Rect width={w} height={h * 0.35} fill={color} stroke={stroke} strokeWidth={2} />
            <Rect y={0} width={w * 0.35} height={h} fill={color} stroke={stroke} strokeWidth={2} />
          </>
        );
      case 'rect':
        return <Rect width={w} height={h} fill={color} stroke={stroke} strokeWidth={2} />;
      case 'round-rect':
      default:
        return (
          <Rect width={w} height={h} fill={color} stroke={stroke} strokeWidth={2} cornerRadius={6} />
        );
    }
  })();

  return (
    <>
      <Group
        ref={groupRef}
        x={item.x}
        y={item.y}
        width={w}
        height={h}
        rotation={item.rotation}
        draggable={draggable}
        onClick={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onDragEnd={(e) => {
          onDragEnd(e.target.x(), e.target.y());
        }}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            width: Math.max(16, Math.round(w * scaleX)),
            height: Math.max(16, Math.round(h * scaleY))
          });
        }}
      >
        {body}
        <Text
          text={item.label}
          width={w}
          height={h}
          align="center"
          verticalAlign="middle"
          fontSize={Math.max(9, Math.min(13, w * 0.18))}
          fontStyle="bold"
          fill="#eef1f6"
          listening={false}
        />
      </Group>
      {selected && draggable && (
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={[
            'top-left',
            'top-right',
            'bottom-left',
            'bottom-right',
            'middle-left',
            'middle-right',
            'top-center',
            'bottom-center'
          ]}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 16 || newBox.height < 16) return oldBox;
            return newBox;
          }}
          borderStroke="#e8b84a"
          anchorStroke="#e8b84a"
          anchorFill="#1a1f2a"
          anchorSize={8}
          rotateAnchorOffset={18}
        />
      )}
    </>
  );
}
