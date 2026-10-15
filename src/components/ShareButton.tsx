/** Copies a share link for a design (or the flight it made) to the clipboard. */
import { useState } from 'react';
import type { RocketDesign } from '../physics/types.ts';
import type { MissionId } from '../schema.ts';
import { encodeShare, shareHash, shareUrl, type ShareKind } from '../share.ts';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard (insecure context, denied permission): let the user copy it.
    window.prompt('Copy this link', text);
    return false;
  }
}

export function ShareButton({
  missionId,
  design,
  rev,
  kind,
  label = 'share',
  className = 'ms-btn ms-btn--ghost',
}: {
  missionId: MissionId;
  design: RocketDesign;
  rev?: string;
  kind: ShareKind;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onClick = async (): Promise<void> => {
    const payload = await encodeShare({ missionId, design, ...(rev !== undefined ? { rev } : {}) });
    if (await copy(shareUrl(shareHash(missionId, kind, payload)))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };
  return (
    <button
      className={`${className}${copied ? ' ms-share--copied' : ''}`}
      onClick={() => void onClick()}
      title="Copy a link that opens this exact design"
      data-share={kind}
    >
      {copied ? 'link copied' : label}
    </button>
  );
}
