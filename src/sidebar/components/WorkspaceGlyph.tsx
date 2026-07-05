import type { Workspace } from '@shared/types';
import { iconComponent, NATIVE_HEXES } from '../lib/palette';

/** Native color+icon glyph for a workspace. */
export function WorkspaceGlyph({
  workspace,
  className = 'h-4 w-4',
}: {
  workspace: Workspace;
  className?: string;
}) {
  const Icon = iconComponent(workspace.icon);
  return <Icon className={className} style={{ color: NATIVE_HEXES[workspace.color] }} />;
}
