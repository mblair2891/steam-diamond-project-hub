'use client';

import { useEffect, useRef } from 'react';
import { Group, Line, Rect, Text, Transformer, Arc, Circle } from 'react-konva';
import type Konva from 'konva';
import type {
  FloorPlanDoor,
  FloorPlanDrawing,
  FloorPlanRoomLabel,
  FloorPlanWall,
  FloorPlanWindow
} from '@/lib/types';

interface CommonProps {
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<FloorPlanDrawing>) => void;
}

export function WallNode({
  wall,
  selected,
  draggable,
  onSelect,
  onChange
}: CommonProps & { wall: FloorPlanWall }) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (!selected || !trRef.current || !groupRef.current) return;
    trRef.current.nodes([groupRef.current]);
    trRef.current.getLayer()?.batchDraw();
  }, [selected]);

  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return (
    <>
      <Group
        ref={groupRef}
        x={wall.x1}
        y={wall.y1}
        rotation={angle}
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
          const node = e.target;
          const rad = (node.rotation() * Math.PI) / 180;
          const nx1 = node.x();
          const ny1 = node.y();
          const nx2 = nx1 + Math.cos(rad) * len;
          const ny2 = ny1 + Math.sin(rad) * len;
          onChange({ x1: nx1, y1: ny1, x2: nx2, y2: ny2, rotation: undefined } as Partial<FloorPlanWall>);
        }}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          node.scaleX(1);
          node.scaleY(1);
          const newLen = Math.max(8, len * scaleX);
          const rad = (node.rotation() * Math.PI) / 180;
          const nx1 = node.x();
          const ny1 = node.y();
          onChange({
            x1: nx1,
            y1: ny1,
            x2: nx1 + Math.cos(rad) * newLen,
            y2: ny1 + Math.sin(rad) * newLen
          });
        }}
      >
        <Rect
          x={0}
          y={-wall.thickness / 2}
          width={len}
          height={wall.thickness}
          fill={wall.color}
          stroke={selected ? '#fff' : wall.source === 'auto' ? '#e9d5ff' : wall.color}
          strokeWidth={selected ? 1.5 : wall.source === 'auto' ? 1 : 0}
          cornerRadius={1}
          dash={wall.source === 'auto' ? [6, 4] : undefined}
        />
        {wall.source === 'auto' && len > 40 && (
          <Text
            text="Auto"
            x={Math.max(0, len / 2 - 12)}
            y={-wall.thickness / 2 - 14}
            fontSize={10}
            fontStyle="bold"
            fill="#e9d5ff"
            listening={false}
          />
        )}
      </Group>
      {selected && draggable && (
        <Transformer
          ref={trRef}
          rotateEnabled
          enabledAnchors={['middle-left', 'middle-right']}
          borderStroke="#e8b84a"
          anchorStroke="#e8b84a"
          anchorFill="#1a1f2a"
          anchorSize={8}
        />
      )}
    </>
  );
}

export function DoorNode({
  door,
  selected,
  draggable,
  onSelect,
  onChange
}: CommonProps & { door: FloorPlanDoor }) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const w = door.width;
  const h = door.height;

  useEffect(() => {
    if (!selected || !trRef.current || !groupRef.current) return;
    trRef.current.nodes([groupRef.current]);
    trRef.current.getLayer()?.batchDraw();
  }, [selected]);

  return (
    <>
      <Group
        ref={groupRef}
        x={door.x}
        y={door.y}
        width={w}
        height={h}
        rotation={door.rotation}
        draggable={draggable}
        onClick={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          const sx = node.scaleX();
          const sy = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            width: Math.max(16, Math.round(w * sx)),
            height: Math.max(8, Math.round(h * sy))
          });
        }}
      >
        <Line
          points={[0, h / 2, w, h / 2]}
          stroke={door.color}
          strokeWidth={3}
          lineCap="round"
        />
        <Arc
          x={0}
          y={h / 2}
          innerRadius={0}
          outerRadius={w * 0.85}
          angle={90}
          rotation={-90}
          stroke={door.color}
          strokeWidth={1.5}
          dash={[4, 3]}
        />
        <Circle x={0} y={h / 2} radius={3} fill={door.color} />
        {door.source === 'auto' && (
          <Text
            text="Auto"
            x={0}
            y={-12}
            fontSize={10}
            fontStyle="bold"
            fill="#ddd6fe"
            listening={false}
          />
        )}
      </Group>
      {selected && draggable && (
        <Transformer
          ref={trRef}
          rotateEnabled
          borderStroke="#6cb6ff"
          anchorStroke="#6cb6ff"
          anchorFill="#1a1f2a"
          anchorSize={8}
        />
      )}
    </>
  );
}

export function WindowNode({
  win,
  selected,
  draggable,
  onSelect,
  onChange
}: CommonProps & { win: FloorPlanWindow }) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const w = win.width;
  const h = win.height;

  useEffect(() => {
    if (!selected || !trRef.current || !groupRef.current) return;
    trRef.current.nodes([groupRef.current]);
    trRef.current.getLayer()?.batchDraw();
  }, [selected]);

  return (
    <>
      <Group
        ref={groupRef}
        x={win.x}
        y={win.y}
        width={w}
        height={h}
        rotation={win.rotation}
        draggable={draggable}
        onClick={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          onSelect();
        }}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = groupRef.current;
          if (!node) return;
          const sx = node.scaleX();
          const sy = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            width: Math.max(16, Math.round(w * sx)),
            height: Math.max(6, Math.round(h * sy))
          });
        }}
      >
        <Rect
          width={w}
          height={h}
          fill={
            win.source === 'auto' ? 'rgba(34,211,238,0.18)' : 'rgba(62,207,142,0.15)'
          }
          stroke={win.color}
          strokeWidth={2}
          dash={win.source === 'auto' ? [5, 3] : undefined}
        />
        <Line points={[0, h / 2, w, h / 2]} stroke={win.color} strokeWidth={1.5} />
        <Line points={[w / 2, 0, w / 2, h]} stroke={win.color} strokeWidth={1} />
        {win.source === 'auto' && (
          <Text
            text="Auto"
            x={0}
            y={-12}
            fontSize={10}
            fontStyle="bold"
            fill="#a5f3fc"
            listening={false}
          />
        )}
      </Group>
      {selected && draggable && (
        <Transformer
          ref={trRef}
          rotateEnabled
          borderStroke="#3ecf8e"
          anchorStroke="#3ecf8e"
          anchorFill="#1a1f2a"
          anchorSize={8}
        />
      )}
    </>
  );
}

export function RoomLabelNode({
  label,
  selected,
  draggable,
  onSelect,
  onChange
}: CommonProps & { label: FloorPlanRoomLabel }) {
  return (
    <Group
      x={label.x}
      y={label.y}
      draggable={draggable}
      onClick={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
    >
      <Rect
        x={-4}
        y={-4}
        width={Math.max(40, label.text.length * (label.fontSize * 0.55) + 8)}
        height={label.fontSize + 10}
        fill={selected ? 'rgba(232,184,74,0.2)' : 'rgba(15,17,21,0.55)'}
        stroke={selected ? '#e8b84a' : 'transparent'}
        strokeWidth={1}
        cornerRadius={4}
      />
      <Text
        text={label.text}
        fontSize={label.fontSize}
        fontStyle="bold"
        fill={label.color}
        padding={2}
      />
    </Group>
  );
}
