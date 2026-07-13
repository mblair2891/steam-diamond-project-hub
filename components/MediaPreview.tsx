'use client';

export default function MediaPreview({
  url,
  mime,
  name,
  className = 'h-14 w-14'
}: {
  url?: string | null;
  mime?: string | null;
  name?: string;
  className?: string;
}) {
  const isImage = (mime || '').startsWith('image/') || Boolean(url?.match(/\.(jpe?g|png|gif|webp|heic)(\?|$)/i));
  const isVideo = (mime || '').startsWith('video/') || Boolean(url?.match(/\.(mp4|mov|webm|avi)(\?|$)/i));

  if (url && isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name || ''}
        className={`${className} rounded-lg border border-surface-600 object-cover`}
      />
    );
  }

  if (url && isVideo) {
    return (
      <video
        src={url}
        className={`${className} rounded-lg border border-surface-600 object-cover`}
        muted
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    <div
      className={`${className} flex items-center justify-center rounded-lg border border-surface-600 bg-surface-950 text-lg`}
    >
      {isVideo ? '▶' : isImage ? '🖼' : '📄'}
    </div>
  );
}
