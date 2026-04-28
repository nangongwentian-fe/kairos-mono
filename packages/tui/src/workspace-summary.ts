import type {
  WorkspaceChangedFile,
  WorkspaceDiffReport,
} from "@kairos/coding-agent";

const MAX_CHANGED_FILES = 30;

export function formatWorkspaceSummary(
  report: WorkspaceDiffReport | undefined,
): string {
  if (!report || !report.after.isGitRepository) {
    return "";
  }

  const sections: string[] = [];
  const workspaceChanges = formatChangedFiles(
    "workspace changes:",
    report.after.changedFiles,
  );
  if (workspaceChanges) {
    sections.push(workspaceChanges);
  }

  const preExistingChanges = formatChangedFiles(
    "pre-existing changes:",
    report.preExistingChangedFiles,
  );
  if (preExistingChanges) {
    sections.push(preExistingChanges);
  }

  return sections.length > 0 ? `\n${sections.join("\n\n")}\n` : "";
}

function formatChangedFiles(
  title: string,
  files: readonly WorkspaceChangedFile[],
): string {
  if (files.length === 0) {
    return "";
  }

  const visible = files.slice(0, MAX_CHANGED_FILES);
  const lines = visible.map((file) => `  ${file.status} ${formatPath(file)}`);
  const remaining = files.length - visible.length;
  if (remaining > 0) {
    lines.push(`  ...and ${remaining} more file(s)`);
  }

  return [title, ...lines].join("\n");
}

function formatPath(file: WorkspaceChangedFile): string {
  return file.oldPath ? `${file.oldPath} -> ${file.path}` : file.path;
}
