import { describe, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

interface PackageInfo {
  name: string;
  dir: string;
  packageJsonPath: string;
  dependencies: Set<string>;
}

const ROOT_DIR = path.resolve(import.meta.dir, "..");
const PACKAGES_DIR = path.join(ROOT_DIR, "packages");
const APPS_DIR = path.join(ROOT_DIR, "apps");

const ALLOWED_INTERNAL_DEPENDENCIES = new Map<string, readonly string[]>([
  ["@kairos/ai", []],
  ["@kairos/agent", ["@kairos/ai"]],
  ["@kairos/coding-agent", ["@kairos/ai", "@kairos/agent"]],
  [
    "@kairos/coding-tui",
    ["@kairos/ai", "@kairos/agent", "@kairos/coding-agent", "@kairos/tui"],
  ],
  ["@kairos/tui", ["@kairos/ai", "@kairos/agent"]],
  ["@kairos/web-ui", ["@kairos/ai", "@kairos/agent"]],
  ["@kairos/coding-web", ["@kairos/ai", "@kairos/coding-agent", "@kairos/web-ui"]],
  ["@kairos/docs-site", []],
]);

describe("package dependency boundaries", () => {
  test("workspace packages only declare allowed internal dependencies", async () => {
    const packages = await readPackageInfos();

    for (const packageInfo of packages) {
      const allowed = new Set(
        ALLOWED_INTERNAL_DEPENDENCIES.get(packageInfo.name) ?? [],
      );
      const declared = [...packageInfo.dependencies]
        .filter((dependency) => dependency !== packageInfo.name)
        .sort();

      expect(declared, packageInfo.name).toEqual([...allowed].sort());
    }
  });

  test("source imports stay within allowed package layers", async () => {
    const packages = await readPackageInfos();
    const packageNames = new Set(packages.map((packageInfo) => packageInfo.name));

    for (const packageInfo of packages) {
      const allowed = new Set(
        ALLOWED_INTERNAL_DEPENDENCIES.get(packageInfo.name) ?? [],
      );
      const imports = await readInternalSourceImports(packageInfo, packageNames);

      for (const dependency of imports) {
        expect(
          allowed.has(dependency),
          `${packageInfo.name} imports ${dependency}, but that edge is not allowed.`,
        ).toBe(true);
        expect(
          packageInfo.dependencies.has(dependency),
          `${packageInfo.name} imports ${dependency}, but package.json does not declare it.`,
        ).toBe(true);
      }
    }
  });
});

async function readPackageInfos(): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];

  for (const workspaceDir of [PACKAGES_DIR, APPS_DIR]) {
    packages.push(...(await readPackageInfosFromDir(workspaceDir)));
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

async function readPackageInfosFromDir(workspaceDir: string): Promise<PackageInfo[]> {
  const entries = await readdir(workspaceDir, { withFileTypes: true });
  const packages: PackageInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dir = path.join(workspaceDir, entry.name);
    const packageJsonPath = path.join(dir, "package.json");
    if (!(await exists(packageJsonPath))) {
      continue;
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    if (!packageJson.name?.startsWith("@kairos/")) {
      continue;
    }

    packages.push({
      name: packageJson.name,
      dir,
      packageJsonPath,
      dependencies: new Set([
        ...readInternalDependencyNames(packageJson.dependencies),
        ...readInternalDependencyNames(packageJson.devDependencies),
        ...readInternalDependencyNames(packageJson.peerDependencies),
        ...readInternalDependencyNames(packageJson.optionalDependencies),
      ]),
    });
  }

  return packages;
}

function readInternalDependencyNames(
  dependencies: Record<string, string> | undefined,
): string[] {
  return Object.keys(dependencies ?? {}).filter((name) =>
    name.startsWith("@kairos/"),
  );
}

async function readInternalSourceImports(
  packageInfo: PackageInfo,
  packageNames: ReadonlySet<string>,
): Promise<Set<string>> {
  const sourceDir = path.join(packageInfo.dir, "src");
  if (!(await exists(sourceDir))) {
    return new Set();
  }

  const files = await readSourceFiles(sourceDir);
  const imports = new Set<string>();

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const specifier of readImportSpecifiers(source)) {
      const packageName = toKairosPackageName(specifier);
      if (
        packageName &&
        packageNames.has(packageName) &&
        packageName !== packageInfo.name
      ) {
        imports.add(packageName);
      }
    }
  }

  return imports;
}

async function readSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await readSourceFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function readImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importPattern =
    /(?:from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["'])/g;
  let match: RegExpExecArray | null;

  while ((match = importPattern.exec(source))) {
    const specifier = match[1] ?? match[2];
    if (specifier) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

function toKairosPackageName(specifier: string): string | undefined {
  const match = /^(@kairos\/[^/]+)/.exec(specifier);
  return match?.[1];
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
